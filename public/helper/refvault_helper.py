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
VERSION = "1.0.0"
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
    if sys.stdout and sys.stdout.isatty():
        print(line, flush=True)


def load_config() -> dict:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
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

# Normal "this video simply has no captions" answers; anything else may mean YouTube changed.
EXPECTED = {"TranscriptsDisabled", "NoTranscriptFound", "VideoUnavailable", "AgeRestricted", "InvalidVideoId", "RuntimeError"}


def handle(session: requests.Session, base: str, job: dict, failures: list) -> str:
    vid = job["youtube_id"]
    body: dict = {"item_id": job["item_id"]}
    if job.get("need_details"):
        try:
            meta = fetch_details(vid)
            if meta:
                body["meta"] = meta
        except Exception as e:  # details are a bonus; captions matter more
            log(f"{vid}: could not read details ({e})")
    if job.get("need_transcript"):
        try:
            body["segments"], body["lang"] = fetch_transcript(vid)
        except Exception as e:
            if type(e).__name__ not in EXPECTED:
                failures.append(e)
            body["error"] = f"{type(e).__name__}: {str(e).splitlines()[0][:300] if str(e) else ''}"
    r = session.post(f"{base}/result", json=body, timeout=60)
    r.raise_for_status()
    got = f"{len(body.get('segments', []))} caption lines" if body.get("segments") else f"no captions ({body.get('error', 'not needed')})"
    return f"{vid}: {got}{', details' if body.get('meta') else ''}"


def one_round(session: requests.Session, base: str, failures: list) -> int:
    r = session.get(f"{base}/jobs", timeout=30)
    if r.status_code == 401:
        raise PermissionError("RefVault rejected the helper URL — it was probably revoked. Re-run the install command from Settings.")
    r.raise_for_status()
    data = r.json()
    for job in data.get("jobs", []):
        log(handle(session, base, job, failures))
    return int(data.get("poll_seconds", 20))


def maybe_upgrade(cfg: dict, state: dict, error: Exception) -> None:
    """YouTube changes often; when captions break, update youtube-transcript-api (at most every 6 h)."""
    uv = cfg.get("uv")
    if not uv or time.time() - state.get("upgraded", 0) < 6 * 3600:
        return
    state["upgraded"] = time.time()
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
    delay = 20
    while True:
        failures: list = []
        try:
            delay = one_round(session, base, failures)
            if failures:
                maybe_upgrade(cfg, state, failures[-1])
        except PermissionError as e:
            log(str(e))
            delay = 3600
        except Exception as e:
            log(f"round failed: {e}")
            delay = 60
        if "--once" in sys.argv:
            return
        time.sleep(max(5, min(delay, 3600)))


if __name__ == "__main__":
    main()
