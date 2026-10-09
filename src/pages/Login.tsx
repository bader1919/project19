import { useState } from "react";
import { supabase } from "../lib/supabase";
import { ErrorBox } from "../components/ui";

function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 2.5h14a1 1 0 0 1 1 1V22l-8-5-8 5V3.5a1 1 0 0 1 1-1z" fill="currentColor" />
      <path d="M10 7.5v6l5-3z" fill="rgb(var(--paper))" />
    </svg>
  );
}

export function Login() {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="flex min-h-dvh justify-center bg-paper px-4 pb-10 pt-[12vh]">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 text-binding">
          <div className="flex items-center gap-2.5">
            <Mark />
            <h1 className="text-[1.75rem] font-semibold leading-9 text-ink">RefVault</h1>
          </div>
          <p className="mt-3 text-body text-ink-2">Find the link, book or idea you saw in a video.</p>
        </div>
        {sent ? (
          <p role="status" className="sheet px-4 py-3 text-body">
            Check <strong dir="ltr">{email}</strong> for a sign-in link. It can take a minute to arrive.
          </p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const { error } =
                mode === "password"
                  ? await supabase.auth.signInWithPassword({ email, password })
                  : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
              setBusy(false);
              if (error) setError(error.message);
              else if (mode === "link") setSent(true);
            }}
          >
            <div>
              <label htmlFor="email" className="mb-1 block text-meta font-semibold text-ink-2">Email</label>
              <input id="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            </div>
            {mode === "password" && (
              <div>
                <label htmlFor="password" className="mb-1 block text-meta font-semibold text-ink-2">Password</label>
                <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            )}
            {error && <ErrorBox message={error} />}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Signing in…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => (setMode(mode === "password" ? "link" : "password"), setError(null))}
            >
              {mode === "password" ? "Use an email link instead" : "Use a password instead"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export function NotConfigured() {
  return (
    <main className="flex min-h-dvh justify-center bg-paper px-4 pt-[12vh]">
      <div className="sheet h-fit max-w-lg p-6 text-body">
        <h1 className="mb-2 text-h2">Almost there</h1>
        <p className="text-ink-2">
          RefVault needs its Supabase connection. In Netlify, open Site configuration, then Environment variables, and set
          <code className="mx-1 rounded-tab bg-binding-wash px-1 text-meta">VITE_SUPABASE_URL</code> and
          <code className="mx-1 rounded-tab bg-binding-wash px-1 text-meta">VITE_SUPABASE_ANON_KEY</code>, then redeploy. The README has the full steps.
        </p>
      </div>
    </main>
  );
}
