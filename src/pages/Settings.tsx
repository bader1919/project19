import { useEffect, useState } from "react";
import { Check, Copy, Download, KeyRound, LogOut, Plug, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { exportJson, exportMarkdown } from "../lib/export";
import { useSession } from "../lib/auth";
import { PageHeader } from "../components/ui";

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">{icon}{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

function ConnectorCard() {
  const [tokens, setTokens] = useState<{ id: string; label: string | null; created_at: string; last_used_at: string | null }[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("api_tokens").select("id, label, created_at, last_used_at").order("created_at");
    setTokens(data ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <Card title="Claude connector (MCP)" icon={<Plug className="h-4 w-4 text-brand-500" />}>
      <p className="text-slate-600 dark:text-slate-300">
        Connect RefVault to Claude so it can save videos, write summaries, pick topics and search your library for you.
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-slate-600 dark:text-slate-300">
        <li>Click <strong>Generate connector URL</strong> and copy it (it's shown only once).</li>
        <li>In Claude: <strong>Settings → Connectors → Add custom connector</strong>. Name it “RefVault” and paste the URL.</li>
        <li>In any chat, say: <em>“Save this video to RefVault: https://youtu.be/…”</em></li>
      </ol>
      {url && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="mb-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">Your private connector URL — treat it like a password:</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs dark:bg-slate-900">{url}</code>
            <button
              className="btn-outline px-2 py-1"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
              aria-label="Copy connector URL"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          onClick={async () => {
            try {
              const r = await api<{ url: string }>("/api/token", { body: { label: "Claude connector" } });
              setUrl(r.url);
              setCopied(false);
              load();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Generate connector URL
        </button>
        {tokens.length > 0 && (
          <button
            className="btn-danger"
            onClick={async () => {
              if (!confirm("Disconnect every Claude connector using RefVault? You'll need to add a new URL in Claude.")) return;
              await api("/api/token", { method: "DELETE" });
              setUrl(null);
              load();
            }}
          >
            <Trash2 className="h-4 w-4" /> Revoke all
          </button>
        )}
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {tokens.length > 0 && (
        <ul className="text-xs text-slate-500">
          {tokens.map((t) => (
            <li key={t.id}>
              {t.label ?? "Connector"} · created {new Date(t.created_at).toLocaleDateString()} ·{" "}
              {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleString()}` : "never used"}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TranscriptKeysCard() {
  const [supadata, setSupadata] = useState("");
  const [ytio, setYtio] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("supadata_key, ytio_key")
      .maybeSingle()
      .then(({ data }) => {
        setSupadata(data?.supadata_key ?? "");
        setYtio(data?.ytio_key ?? "");
      });
  }, []);

  return (
    <Card title="Transcript sources" icon={<KeyRound className="h-4 w-4 text-amber-500" />}>
      <p className="text-slate-600 dark:text-slate-300">
        RefVault first reads captions straight from YouTube — <strong>free, no key needed</strong>. When YouTube blocks the server or a
        video has no captions, it falls back to these free-tier services (optional):
      </p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const { data: u } = await supabase.auth.getUser();
          const { error } = await supabase
            .from("user_settings")
            .upsert({ user_id: u.user!.id, supadata_key: supadata.trim() || null, ytio_key: ytio.trim() || null, updated_at: new Date().toISOString() });
          if (error) setError(error.message);
          else {
            setError(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }
        }}
      >
        <div>
          <label htmlFor="supadata" className="mb-1 block font-medium">
            Supadata API key <span className="font-normal text-slate-500">— 100 free transcripts/month, also transcribes videos without captions</span>
          </label>
          <input id="supadata" type="password" autoComplete="off" className="input" value={supadata} onChange={(e) => setSupadata(e.target.value)} placeholder="sd_…" />
          <a className="text-xs text-brand-600 hover:underline" href="https://supadata.ai" target="_blank" rel="noreferrer">Get a free key at supadata.ai</a>
        </div>
        <div>
          <label htmlFor="ytio" className="mb-1 block font-medium">
            youtube-transcript.io API token <span className="font-normal text-slate-500">— 25 free transcripts/month</span>
          </label>
          <input id="ytio" type="password" autoComplete="off" className="input" value={ytio} onChange={(e) => setYtio(e.target.value)} />
          <a className="text-xs text-brand-600 hover:underline" href="https://www.youtube-transcript.io" target="_blank" rel="noreferrer">Get a free token at youtube-transcript.io</a>
        </div>
        <button className="btn-primary">{saved ? <><Check className="h-4 w-4" /> Saved</> : "Save keys"}</button>
        {error && <p className="text-red-600">{error}</p>}
      </form>
    </Card>
  );
}

export function Settings() {
  const { session } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const run = (name: string, fn: () => Promise<void>) => async () => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      <div className="space-y-5">
        <ConnectorCard />
        <TranscriptKeysCard />
        <Card title="Backup & export" icon={<Download className="h-4 w-4 text-emerald-500" />}>
          <p className="text-slate-600 dark:text-slate-300">Your data is yours. Download everything at any time.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" disabled={!!busy} onClick={run("json", exportJson)}>
              {busy === "json" ? "Preparing…" : "Full backup (JSON)"}
            </button>
            <button className="btn-outline" disabled={!!busy} onClick={run("md", exportMarkdown)}>
              {busy === "md" ? "Preparing…" : "Readable export (Markdown)"}
            </button>
          </div>
        </Card>
        <Card title="Account" icon={<LogOut className="h-4 w-4 text-slate-500" />}>
          <p>Signed in as <strong>{session?.user.email}</strong></p>
          <button className="btn-outline" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </Card>
      </div>
    </div>
  );
}
