# /// script
# requires-python = ">=3.10"
# dependencies = ["youtube-transcript-api>=1.2", "requests>=2.31"]
# ///
"""
RefVault PC helper.

YouTube blocks cloud servers, but not your home connection. This little program runs in
the background on your computer, asks RefVault which saved videos still need captions or
details, fetches them from YouTube, and sends them back. Your library then finishes the
summary by itself.

Run by the installer (helper/install.ps1, helper/install.sh) with `uv run --script`.
Options:  --check  test the connection and exit   --once  one round and exit
"""
from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
CONFIG = HERE / "config.json"
LOG = HERE / "helper.log"
VERSION = "1.1.0"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"


def log(msg: str) -> None:
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')}  {msg}"
    try:
        if LOG.exists() and LOG.stat().st_size > 1_000_000:
            LOG.write_text("", encoding="utf-8")  # keep the log small
        with LOG.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass
    if sys.stdout and (sys.stdout.isatty() or os.environ.get("RV_LOG_STDOUT")):
        print(line, flush=True)


def load_config() -> dict:
    # utf-8-sig: Windows PowerShell may write the file with a byte-order mark.
    cfg = json.loads(CONFIG.read_text(encoding="utf-8-sig")) if CONFIG.exists() else {}
    if os.environ.get("RV_HELPER_URL"):
        cfg["url"] = os.environ["RV_HELPER_URL"]
    if not cfg.get("url"):
        sys.exit("RefVault helper: no helper URL configured. Re-run the install command from RefVault → Settings.")
    cfg["url"] = cfg["url"].rstrip("/")
    return cfg


# ---------------------------------------------------------------- YouTube

def fetch_transcript(video_id: str) -> tuple[list[dict], str]:
    """Captions in the language actually spoken; hand-made ones over automatic ones."""
    from youtube_transcript_api import YouTubeTranscriptApi

    tracks = list(YouTubeTranscriptApi().list(video_id))
    if not tracks:
        raise RuntimeError("this video has no captions")
    generated = [t for t in tracks if t.is_generated]
    manual = [t for t in tracks if not t.is_generated]
    spoken = generated[0].language_code.split("-")[0] if generated else None

    def pick() -> object:
        for t in manual:
            if spoken and t.language_code.split("-")[0] == spoken:
                return t
        for lang in ("ar", "en"):
            for t in manual:
                if t.language_code.split("-")[0] == lang:
                    return t
        return generated[0] if generated else manual[0]

    track = pick()
    fetched = track.fetch()
    segments = [
        {"start": round(s.start, 2), "dur": round(s.duration, 2), "text": s.text}
        for s in fetched.snippets
        if s.text and s.text.strip()
    ]
    if not segments:
        raise RuntimeError("the caption track was empty")
    return segments, track.language_code


def fetch_details(video_id: str) -> dict | None:
    """Description, length, date and channel from the watch page."""
    r = requests.get(
        f"https://www.youtube.com/watch?v={video_id}&hl=en",
        headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
        cookies={"SOCS": "CAI", "CONSENT": "YES+"},  # skip the EU consent page
        timeout=20,
    )
    r.raise_for_status()
    m = re.search(r"ytInitialPlayerResponse\s*=\s*", r.text)
    if not m:
        return None
    data, _ = json.JSONDecoder().raw_decode(r.text, m.end())
    vd = data.get("videoDetails") or {}
    mf = (data.get("microformat") or {}).get("playerMicroformatRenderer") or {}
    channel = vd.get("channelId")
    return {
        "description": vd.get("shortDescription") or mf.get("description", {}).get("simpleText"),
        "duration_sec": int(vd["lengthSeconds"]) if str(vd.get("lengthSeconds", "")).isdigit() else None,
        "published_at": mf.get("publishDate") or mf.get("uploadDate"),
        "channel_url": f"https://www.youtube.com/channel/{channel}" if channel else None,
    }


# ---------------------------------------------------------------- RefVault

# ---------------------------------------------------------------- yt-dlp (Home Assistant add-on)
# The same approach as Music Assistant's YouTube provider: yt-dlp, with proof-of-origin tokens
# from the BgUtils provider (RV_POT_URL, e.g. the "YT Music PO Token Generator" add-on).
# Used when yt-dlp is installed (the add-on image); the PC helper falls back to the methods above.

def have_ytdlp() -> bool:
    try:
        import yt_dlp  # noqa: F401
        return True
    except ImportError:
        return False


def pick_caption_track(info: dict) -> tuple[str, list[dict]] | None:
    """Hand-made captions in the spoken language first, then Arabic/English, then the automatic ones."""
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    spoken = (info.get("language") or "").split("-")[0]
    base = lambda k: k.split("-")[0]  # noqa: E731
    for lang in [spoken, "ar", "en"]:
        for k, v in manual.items():
            if lang and base(k) == lang and k != "live_chat":
                return k, v
    for k, v in manual.items():
        if k != "live_chat":
            return k, v
    # Automatic captions also list machine translations into every language; the original is
    # "<lang>-orig" (or the spoken language itself).
    for k in [f"{spoken}-orig", spoken] + [k for k in auto if k.endswith("-orig")] + ["en"]:
        if k and k in auto:
            return k, auto[k]
    return None


def parse_json3(raw: bytes | str) -> list[dict]:
    data = json.loads(raw)
    out = []
    for ev in data.get("events", []):
        text = "".join(seg.get("utf8", "") for seg in ev.get("segs") or []).replace("\n", " ").strip()
        if not text:
            continue
        out.append({"start": round(ev.get("tStartMs", 0) / 1000, 2), "dur": round(ev.get("dDurationMs", 0) / 1000, 2), "text": text})
    return out


def ytdlp_fetch(video_id: str, need_transcript: bool) -> tuple[dict, list[dict] | None, str | None]:
    """Video details, and captions when asked: (meta, segments or None, language)."""
    import yt_dlp

    opts: dict = {"quiet": True, "no_warnings": True, "skip_download": True, "noplaylist": True}
    pot = os.environ.get("RV_POT_URL")
    if pot:
        opts["extractor_args"] = {"youtubepot-bgutilhttp": {"base_url": [pot]}}
    cookies = os.environ.get("RV_COOKIES")
    if cookies and Path(cookies).is_file():
        opts["cookiefile"] = cookies  # a signed-in session gets past "confirm you're not a bot"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        up = str(info.get("upload_date") or "")
        meta = {
            "description": info.get("description"),
            "duration_sec": info.get("duration"),
            "published_at": f"{up[:4]}-{up[4:6]}-{up[6:8]}" if len(up) == 8 else None,
            "channel_url": info.get("channel_url"),
        }
        if not need_transcript:
            return meta, None, None
        picked = pick_caption_track(info)
        if not picked:
            raise RuntimeError("this video has no captions")
        lang, formats = picked
        fmt = next((f for f in formats if f.get("ext") == "json3"), None)
        if not fmt:
            raise RuntimeError(f"no json3 captions for {lang}")
        segments = parse_json3(ydl.urlopen(fmt["url"]).read())
        if not segments:
            raise RuntimeError("the caption track was empty")
        return meta, segments, lang.replace("-orig", "")


# Normal "this video simply has no captions" answers; anything else may mean YouTube changed.
EXPECTED = {"TranscriptsDisabled", "NoTranscriptFound", "VideoUnavailable", "AgeRestricted", "InvalidVideoId", "RuntimeError"}


# Network trouble on this computer: try the same video again later instead of giving up on it.
TRANSIENT = {"ConnectionError", "Timeout", "ReadTimeout", "ConnectTimeout", "ProxyError", "SSLError", "ChunkedEncodingError"}
MAX_TRIES = 3


class Blocked(Exception):
    """YouTube is refusing this connection for now (bot check / rate limit)."""


BLOCK_SIGNS = ("Sign in to confirm", "IpBlocked", "RequestBlocked", "429", "Too Many Requests", "google.com/sorry")


def is_block(e: Exception) -> bool:
    text = f"{type(e).__name__}: {e}"
    return any(sign in text for sign in BLOCK_SIGNS)


def handle(session: requests.Session, base: str, job: dict, failures: list, tries: dict) -> str:
    vid = job["youtube_id"]
    body: dict = {"item_id": job["item_id"]}
    blocked: list = []
    if have_ytdlp():
        try:
            meta, segs, lang = ytdlp_fetch(vid, bool(job.get("need_transcript")))
            if job.get("need_details") and meta.get("description"):
                body["meta"] = meta
            if segs:
                body["segments"], body["lang"] = segs, lang
                job = {**job, "need_transcript": False}
            if body.get("meta"):
                job = {**job, "need_details": False}
        except Exception as e:  # fall through to the lighter methods below
            if is_block(e):
                blocked.append(e)
            log(f"{vid}: yt-dlp: {type(e).__name__}: {str(e).splitlines()[0][:200] if str(e) else ''}")
    if job.get("need_details"):
        try:
            meta = fetch_details(vid)
            if meta:
                body["meta"] = meta
        except Exception as e:  # details are a bonus; captions matter more
            if is_block(e):
                blocked.append(e)
            log(f"{vid}: could not read details ({e})")
    if job.get("need_transcript"):
        try:
            body["segments"], body["lang"] = fetch_transcript(vid)
        except Exception as e:
            name = type(e).__name__
            if is_block(e):
                # YouTube is refusing us: keep the job (save any details we did get), pause, don't count a try.
                if body.get("meta"):
                    session.post(f"{base}/result", json={**body, "partial": True}, timeout=60).raise_for_status()
                raise Blocked(str(e).splitlines()[0][:200] if str(e) else name) from e
            if name not in EXPECTED:
                tries[vid] = tries.get(vid, 0) + 1
                if tries[vid] < MAX_TRIES:
                    if name not in TRANSIENT:
                        failures.append(e)
                    return f"{vid}: will retry ({name}: {str(e)[:120]})"
                if name not in TRANSIENT:
                    failures.append(e)
            body["error"] = f"{type(e).__name__}: {str(e).splitlines()[0][:300] if str(e) else ''}"
    if blocked and not body.get("meta") and not body.get("segments") and "error" not in body:
        raise Blocked(str(blocked[-1]).splitlines()[0][:200])
    r = session.post(f"{base}/result", json=body, timeout=60)
    r.raise_for_status()
    got = f"{len(body.get('segments', []))} caption lines" if body.get("segments") else f"no captions ({body.get('error', 'not needed')})"
    return f"{vid}: {got}{', details' if body.get('meta') else ''}"


def one_round(session: requests.Session, base: str, failures: list, tries: dict) -> int:
    r = session.get(f"{base}/jobs", timeout=30)
    if r.status_code == 401:
        raise PermissionError("RefVault rejected the helper URL — it was probably revoked. Re-run the install command from Settings.")
    r.raise_for_status()
    data = r.json()
    for job in data.get("jobs", []):
        log(handle(session, base, job, failures, tries))  # Blocked stops the round
    return int(data.get("poll_seconds", 20))


def maybe_upgrade(cfg: dict, state: dict, error: Exception) -> None:
    """YouTube changes often; when captions break, update youtube-transcript-api (at most every 6 h)."""
    uv = cfg.get("uv")
    stamp = HERE / "last_upgrade"  # survives restarts, so a broken video can't cause a restart loop
    try:
        last = float(stamp.read_text())
    except (OSError, ValueError):
        last = 0.0
    if not uv or time.time() - last < 6 * 3600:
        return
    try:
        stamp.write_text(str(time.time()))
    except OSError:
        return
    log(f"captions failing ({error}); updating youtube-transcript-api and restarting")
    try:
        subprocess.run([uv, "run", "--upgrade", "--script", str(Path(__file__).resolve()), "--check"], timeout=600, check=False)
        if state.get("lock"):
            state["lock"].close()  # let the new copy take over
        flags = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW
        subprocess.Popen([uv, "run", "--script", str(Path(__file__).resolve())], creationflags=flags, close_fds=True)
        sys.exit(0)
    except Exception as e:
        log(f"update failed: {e}")


def single_instance() -> socket.socket | None:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 47815))
        return s
    except OSError:
        return None


def main() -> None:
    cfg = load_config()
    base = cfg["url"]
    session = requests.Session()
    session.headers["User-Agent"] = f"RefVault-Helper/{VERSION}"

    if "--check" in sys.argv:
        r = session.get(f"{base}/jobs", timeout=30)
        print("RefVault:", "connected" if r.ok else f"error {r.status_code} {r.text[:200]}")
        if not r.ok:
            sys.exit(1)
        try:
            segs, lang = fetch_transcript("jNQXAC9IVRw")
            print(f"YouTube captions: working ({len(segs)} lines, {lang})")
        except Exception as e:
            print(f"YouTube captions: NOT working here ({type(e).__name__}: {str(e)[:200]})")
        return

    lock = single_instance()
    if lock is None and "--once" not in sys.argv:
        return  # already running
    log(f"RefVault helper {VERSION} started")
    state: dict = {"lock": lock}
    tries: dict = {}
    delay = 20
    pause = 0  # grows while YouTube keeps refusing this connection
    while True:
        failures: list = []
        try:
            delay = one_round(session, base, failures, tries)
            pause = 0
            if failures:
                maybe_upgrade(cfg, state, failures[-1])
        except Blocked as e:
            # Retrying right away keeps the block alive; wait it out (30 min, doubling up to 6 h).
            pause = min(pause * 2, 6 * 3600) if pause else 1800
            delay = pause
            hint = "" if os.environ.get("RV_COOKIES") and Path(os.environ["RV_COOKIES"]).is_file() else " A YouTube cookies file avoids this (see the add-on docs)."
            log(f"YouTube is blocking this connection for now ({e}). Trying again in {pause // 60} min.{hint}")
        except PermissionError as e:
            log(str(e))
            delay = 3600
        except Exception as e:
            log(f"round failed: {e}")
            delay = 60
        if "--once" in sys.argv:
            return
        time.sleep(max(5, min(delay, 6 * 3600)))


if __name__ == "__main__":
    main()
