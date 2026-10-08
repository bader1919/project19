import { useCallback, useEffect, useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { exportJson, exportMarkdown } from "../lib/export";
import { useSession } from "../lib/auth";
import { formatDate, timeAgo } from "../lib/format";
import { ErrorBox, PageHeader } from "../components/ui";
import { ConfirmDialog } from "../components/ConfirmDialog";

function Section({ title, children, danger = false }: { title: string; children: React.ReactNode; danger?: boolean }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-line pt-8 first:border-t-0 first:pt-0">
      <h2 id={id} className={`text-h2 ${danger ? "text-danger" : ""}`}>{title}</h2>
      <div className="mt-3 max-w-prose space-y-4 text-body">{children}</div>
    </section>
  );
}

const Field = ({ id, label, hint, children }: { id: string; label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) => (
  <div>
    <label htmlFor={id} className="mb-1 block text-meta font-semibold text-ink">{label}</label>
    {children}
    {hint && <p id={`${id}-hint`} className="mt-1 text-meta text-ink-2">{hint}</p>}
  </div>
);

const Link = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a className="text-binding underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer">{children}</a>
);

/** Copy-to-clipboard block: a labelled read-only value with a button that says "Copied" afterwards. */
function CopyBlock({ label, value, buttonLabel, wrap = false }: { label: string; value: string; buttonLabel: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();
  useEffect(() => setCopied(false), [value]);
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-meta font-semibold text-ink">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          id={id}
          readOnly
          rows={wrap ? 4 : 2}
          dir="ltr"
          spellCheck={false}
          className="input min-w-0 flex-1 resize-none break-all font-[inherit] text-meta"
          value={value}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className="btn-outline shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setFailed(false);
            } catch {
              setFailed(true);
            }
          }}
        >
          {copied ? <><Check className="h-4 w-4 text-binding" aria-hidden="true" /> Copied</> : <><Copy className="h-4 w-4" aria-hidden="true" /> {buttonLabel}</>}
        </button>
      </div>
      {failed && <p role="alert" className="mt-1 text-meta text-danger">Couldn't copy automatically. Select the text above and copy it.</p>}
    </div>
  );
}

type Token = { id: string; label: string | null; created_at: string; last_used_at: string | null };

function ConnectorSection({ tokens, url, setUrl, reload }: { tokens: Token[]; url: string | null; setUrl: (u: string | null) => void; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Connect to Claude">
      <p className="text-ink-2">Connect RefVault to Claude so it can save videos, write summaries, pick topics and search your library for you.</p>
      <ol className="list-decimal space-y-1 ps-5 text-ink-2">
        <li>Select <strong className="font-medium text-ink">Generate connector URL</strong> and copy it. It's shown only once.</li>
        <li>In Claude, open <strong className="font-medium text-ink">Settings</strong>, then <strong className="font-medium text-ink">Connectors</strong>, then <strong className="font-medium text-ink">Add custom connector</strong>. Name it “RefVault” and paste the URL.</li>
        <li>In any chat, say <em>“Save this video to RefVault: https://youtu.be/…”</em></li>
      </ol>
      {url && <CopyBlock label="Your private connector URL. Treat it like a password." value={url} buttonLabel="Copy link" />}
      <div>
        <button
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setError(null);
              const r = await api<{ url: string }>("/token", { body: { label: "Claude connector" } });
              setUrl(r.url);
              reload();
            } catch (e) {
              setError(`Couldn't create the connector URL. ${(e as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Generating…" : url ? "Generate another URL" : "Generate connector URL"}
        </button>
      </div>
      {error && <ErrorBox message={error} />}
      {tokens.length > 0 && (
        <ul className="space-y-0.5 text-meta text-ink-2">
          {tokens.map((t) => (
            <li key={t.id}>
              {t.label ?? "Connector"}, created {formatDate(t.created_at)}, {t.last_used_at ? `last used ${timeAgo(t.last_used_at)}` : "never used"}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function helperCommand(os: "windows" | "unix", helperUrl: string): string {
  const app = window.location.origin;
  return os === "windows"
    ? `$env:RV_HELPER_URL='${helperUrl}'; $env:RV_APP='${app}'; irm ${app}/helper/install.ps1 | iex`
    : `curl -fsSL ${app}/helper/install.sh | RV_HELPER_URL='${helperUrl}' RV_APP='${app}' sh`;
}

/** The PC helper fetches captions over the user's home connection (YouTube blocks cloud servers). */
function HelperSection() {
  const [seen, setSeen] = useState<string | null>(null);
  const [os, setOs] = useState<"windows" | "unix">(/Win/i.test(navigator.userAgent) ? "windows" : "unix");
  const [helperUrl, setHelperUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("user_settings").select("helper_seen_at").maybeSingle();
      setSeen((data as { helper_seen_at: string | null } | null)?.helper_seen_at ?? null);
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const running = seen && Date.now() - new Date(seen).getTime() < 3 * 60_000;
  const command = helperUrl ? helperCommand(os, helperUrl) : null;

  return (
    <Section title="PC helper">
      <p className="text-ink-2">
        YouTube blocks cloud servers but not your home internet. This small background program on your computer fetches the real captions
        and video description for every video you save. When your computer is off, the transcript services below do it instead. Either way it's automatic.
      </p>
      <p role="status" className={`flex items-center gap-2 font-medium ${running ? "text-binding" : "text-ink-2"}`}>
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${running ? "bg-binding" : "border border-ink-2"}`} />
        {running ? "Running on your computer" : seen ? `Not running, last seen ${timeAgo(seen)}` : "Not installed yet"}
      </p>
      <div role="group" aria-label="Your operating system" className="flex gap-2">
        {(["windows", "unix"] as const).map((o) => (
          <button key={o} type="button" aria-pressed={os === o} className={`btn-sm rounded-ctl border px-3 font-medium ${os === o ? "border-binding bg-binding-wash text-binding" : "border-line bg-sheet text-ink-2 hover:bg-binding-wash/60"}`} onClick={() => setOs(o)}>
            {o === "windows" ? "Windows" : "Mac or Linux"}
          </button>
        ))}
      </div>
      <ol className="list-decimal space-y-1 ps-5 text-ink-2">
        <li>Select <strong className="font-medium text-ink">Create install command</strong> and copy it.</li>
        {os === "windows" ? (
          <li>Open <strong className="font-medium text-ink">PowerShell</strong> (Start menu, then type “PowerShell”), paste, press Enter. No admin needed.</li>
        ) : (
          <li>Open <strong className="font-medium text-ink">Terminal</strong>, paste, press Enter. No sudo needed.</li>
        )}
        <li>That's it. It starts with your computer from now on.</li>
      </ol>
      {command && <CopyBlock label="Install command. It contains a private key, so don't share it." value={command} buttonLabel="Copy command" wrap />}
      <div>
        <button
          className="btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setError(null);
              const r = await api<{ url: string }>("/token", { body: { label: "PC helper", scope: "helper" } });
              setHelperUrl(r.url);
            } catch (e) {
              setError(`Couldn't create the install command. ${(e as Error).message}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Creating…" : command ? "Create a new command" : "Create install command"}
        </button>
      </div>
      {error && <ErrorBox message={error} />}
    </Section>
  );
}

function TranscriptKeysSection() {
  const [supadata, setSupadata] = useState("");
  const [ytio, setYtio] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("supadata_key, ytio_key, gemini_key")
      .maybeSingle()
      .then(({ data }) => {
        setSupadata(data?.supadata_key ?? "");
        setYtio(data?.ytio_key ?? "");
        setGoogleKey(data?.gemini_key ?? "");
      });
  }, []);

  return (
    <Section title="Transcripts and summaries">
      <p className="text-ink-2">
        Transcripts come from YouTube's captions, then your PC helper, then these transcript services (free tiers). Summaries, topics and
        link labels are written by Gemma 4.
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const { data: u } = await supabase.auth.getUser();
          const { error } = await supabase.from("user_settings").upsert({
            user_id: u.user!.id,
            supadata_key: supadata.trim() || null,
            ytio_key: ytio.trim() || null,
            gemini_key: googleKey.trim() || null,
            updated_at: new Date().toISOString(),
          });
          setSaving(false);
          if (error) setError(`Couldn't save your keys. ${error.message}`);
          else {
            setError(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }
        }}
      >
        <Field
          id="supadata"
          label="Supadata API key"
          hint={<>100 free transcripts a month. Also transcribes videos without captions. <Link href="https://supadata.ai">Get a free key at supadata.ai</Link></>}
        >
          <input id="supadata" type="password" autoComplete="off" aria-describedby="supadata-hint" className="input" value={supadata} onChange={(e) => setSupadata(e.target.value)} placeholder="sd_…" />
        </Field>
        <Field
          id="ytio"
          label="youtube-transcript.io API token"
          hint={<>25 free transcripts a month. <Link href="https://www.youtube-transcript.io">Get a free token at youtube-transcript.io</Link></>}
        >
          <input id="ytio" type="password" autoComplete="off" aria-describedby="ytio-hint" className="input" value={ytio} onChange={(e) => setYtio(e.target.value)} />
        </Field>
        <Field
          id="google-key"
          label="Google AI Studio key for Gemma 4 (optional)"
          hint={<>Writes the automatic summaries. Leave empty to use RefVault's own key. <Link href="https://aistudio.google.com/apikey">Get a free key at Google AI Studio</Link></>}
        >
          <input id="google-key" type="password" autoComplete="off" aria-describedby="google-key-hint" className="input" value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} />
        </Field>
        <button className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : saved ? <><Check className="h-4 w-4" aria-hidden="true" /> Saved</> : "Save keys"}
        </button>
        {error && <ErrorBox message={error} />}
      </form>
    </Section>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const check = (v: string) => (v.length >= 8 ? null : "Use at least 8 characters.");
  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const err = check(password);
        setFieldError(err);
        if (err) return;
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        setMessage(error ? { ok: false, text: `Couldn't change your password. ${error.message}` } : { ok: true, text: "Password changed." });
        if (!error) setPassword("");
      }}
    >
      <label htmlFor="new-password" className="block text-meta font-semibold text-ink">New password</label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="sm:w-72">
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className={`input ${fieldError ? "border-danger" : ""}`}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby="new-password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setFieldError(null)}
            onBlur={() => password && setFieldError(check(password))}
          />
          <p id="new-password-hint" role={fieldError ? "alert" : undefined} className={`mt-1 text-meta ${fieldError ? "text-danger" : "text-ink-2"}`}>
            {fieldError ?? "At least 8 characters."}
          </p>
        </div>
        <button className="btn-outline" disabled={busy}>{busy ? "Changing…" : "Change password"}</button>
      </div>
      {message && (message.ok ? <p role="status" className="text-meta text-ink-2">{message.text}</p> : <ErrorBox message={message.text} />)}
    </form>
  );
}

export function Settings() {
  const { session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadTokens = useCallback(async () => {
    const { data } = await supabase.from("api_tokens").select("id, label, created_at, last_used_at").eq("scope", "mcp").order("created_at");
    setTokens(data ?? []);
  }, []);
  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const run = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(name);
    setExportError(null);
    try {
      await fn();
    } catch (e) {
      setExportError(`Couldn't prepare the export. ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-list">
      <PageHeader title="Settings" />
      <div className="space-y-8">
        <ConnectorSection tokens={tokens} url={url} setUrl={setUrl} reload={loadTokens} />
        <HelperSection />
        <TranscriptKeysSection />
        <Section title="Data">
          <p className="text-ink-2">Your data is yours. Download everything at any time.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" disabled={!!busy} onClick={run("json", exportJson)}>
              {busy === "json" ? "Preparing…" : "Download full backup (JSON)"}
            </button>
            <button className="btn-outline" disabled={!!busy} onClick={run("md", exportMarkdown)}>
              {busy === "md" ? "Preparing…" : "Download readable export (Markdown)"}
            </button>
          </div>
          {exportError && <ErrorBox message={exportError} />}
        </Section>
        <Section title="Account">
          <p>Signed in as <strong className="font-medium" dir="ltr">{session?.user.email}</strong></p>
          <ChangePassword />
          <div>
            <button className="btn-outline" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </Section>
        {tokens.length > 0 && (
          <Section title="Danger zone" danger>
            <p className="text-ink-2">Disconnect every Claude connector that uses RefVault. You'll need to add a new URL in Claude afterwards.</p>
            <div>
              <button className="btn-danger border border-danger/40" onClick={() => setRevoking(true)}>Disconnect all connectors</button>
            </div>
          </Section>
        )}
      </div>
      {revoking && (
        <ConfirmDialog
          title="Disconnect all Claude connectors?"
          body={`${tokens.length === 1 ? "The 1 connector" : `All ${tokens.length} connectors`} will stop working. You'll need to generate a new URL and add it in Claude.`}
          confirmLabel="Disconnect all"
          danger
          onConfirm={async () => {
            await api("/token?scope=mcp", { method: "DELETE" });
            setUrl(null);
            await loadTokens();
          }}
          onClose={() => setRevoking(false)}
        />
      )}
    </div>
  );
}
