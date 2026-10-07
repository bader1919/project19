/**
 * Supabase Edge Function entry: one function serves the whole API.
 *   POST/DELETE  /functions/v1/refvault/token
 *   POST         /functions/v1/refvault/ingest
 *   POST         /functions/v1/refvault/mcp/<token>   (Claude custom connector)
 * Bundled to index.js by `npm run build:edge` (Supabase provides SUPABASE_URL and the service key).
 */
import { handleIngest, handleMcp, handleToken } from "../../../server/http";
import { json } from "../../../server/auth";
import { env } from "../../../server/env";

declare const Deno: { serve: (h: (req: Request) => Response | Promise<Response>) => void };

Deno.serve((req) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const base = `${(env("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/functions/v1/refvault`;
  const mcp = path.match(/\/mcp\/([^/]+)$/);
  if (mcp) return handleMcp(req, decodeURIComponent(mcp[1]));
  if (path.endsWith("/ingest")) return handleIngest(req);
  if (path.endsWith("/token")) return handleToken(req, `${base}/mcp`);
  return json({ name: "RefVault API", ok: true });
});
