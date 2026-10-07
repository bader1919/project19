import { useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold">RefVault</h1>
            <p className="text-sm text-slate-500">Never lose a reference from a video again.</p>
          </div>
        </div>
        {sent ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Check <strong>{email}</strong> for a sign-in link.
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
              setBusy(false);
              if (error) setError(error.message);
              else setSent(true);
            }}
          >
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              <Mail className="h-4 w-4" /> Email me a sign-in link
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-lg p-6 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Almost there</h1>
        <p className="text-slate-600 dark:text-slate-300">
          RefVault needs its Supabase connection. In Netlify → Site configuration → Environment variables, set
          <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_URL</code> and
          <code className="mx-1 rounded bg-slate-100 px-1 dark:bg-slate-800">VITE_SUPABASE_ANON_KEY</code>, then redeploy. See the README for the full steps.
        </p>
      </div>
    </div>
  );
}
