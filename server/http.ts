import { adminDb, ok } from "./db";
import { errorResponse, hashToken, HttpError, json, newToken, userFromRequest, userFromToken } from "./auth";
import { ingestVideo, retryTranscript } from "./library";
import { handleMcpHttp } from "./mcp";

/** Browser calls may come from another origin (the app on Netlify, the API on Supabase). */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** POST {url, transcript?} saves a video · POST {item_id, transcript?} retries a transcript */
export async function handleIngest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    const db = adminDb();
    const userId = await userFromRequest(db, req);
    const body = (await req.json().catch(() => ({}))) as { url?: string; item_id?: string; transcript?: string };
    if (body.item_id) return withCors(json(await retryTranscript(db, userId, body.item_id, body.transcript)));
    if (!body.url) throw new HttpError(400, "Paste a YouTube link");
    return withCors(json(await ingestVideo(db, userId, body.url, { manualTranscript: body.transcript })));
  } catch (e) {
    return withCors(errorResponse(e));
  }
}

/** POST creates a connector token (shown once, stored hashed) · DELETE revokes all of them */
export async function handleToken(req: Request, mcpBase: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    const db = adminDb();
    const userId = await userFromRequest(db, req);
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { label?: string };
      const token = newToken();
      ok(
        await db.from("api_tokens").insert({ user_id: userId, token_hash: hashToken(token), label: body.label ?? "Claude connector" }),
        "save token",
      );
      return withCors(json({ token, url: `${mcpBase}/${token}` }));
    }
    if (req.method === "DELETE") {
      ok(await db.from("api_tokens").delete().eq("user_id", userId), "revoke tokens");
      return withCors(json({ ok: true }));
    }
    throw new HttpError(405, "Use POST or DELETE");
  } catch (e) {
    return withCors(errorResponse(e));
  }
}

export function handleMcp(req: Request, token: string | undefined): Promise<Response> {
  const db = adminDb();
  return handleMcpHttp(req, { db, userId: () => userFromToken(db, token) });
}
