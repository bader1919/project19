import { adminDb, ok } from "./db";
import { errorResponse, hashToken, HttpError, json, newToken, userFromRequest, userFromToken } from "./auth";
import { applyMetadata, ingestVideo, ownedItem, requestReanalysis, retryTranscript } from "./library";
import { handleMcpHttp } from "./mcp";
import { runWorker } from "./auto";
import { helperJobs, helperResult } from "./helper";
import { background } from "./env";

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
    const body = (await req.json().catch(() => ({}))) as { url?: string; item_id?: string; transcript?: string; description?: string };
    if (!body.item_id && !body.url) throw new HttpError(400, "Paste a YouTube link");
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 20_000) : "";
    const transcript = typeof body.transcript === "string" && body.transcript.trim() ? body.transcript : undefined;
    let result: Record<string, unknown>;
    let itemId: string;
    if (body.item_id && description && !transcript) {
      // Only a pasted description: store it (and its links), no transcript retry.
      itemId = (await ownedItem(db, userId, body.item_id)).id;
      result = { ok: true, item_id: itemId };
    } else if (body.item_id) {
      result = { ...(await retryTranscript(db, userId, body.item_id, transcript)) };
      itemId = body.item_id;
    } else {
      const saved = await ingestVideo(db, userId, body.url!, { manualTranscript: transcript });
      result = { ...saved };
      itemId = String(result.item_id);
    }
    if (description) {
      // The pasted description wins over whatever was fetched; links in it are extracted and the summary redone.
      await applyMetadata(db, userId, itemId, { description });
      await requestReanalysis(db, itemId);
      result = { ...result, description_saved: true };
    }
    // Start the transcript / analysis now instead of waiting for the next cron minute.
    background(runWorker(db, 120_000));
    return withCors(json(result));
  } catch (e) {
    return withCors(errorResponse(e));
  }
}

/** POST creates a connector token (shown once, stored hashed) · DELETE revokes all of them */
export async function handleToken(req: Request, mcpBase: string, helperBase: string): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    const db = adminDb();
    const userId = await userFromRequest(db, req);
    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { label?: string; scope?: string };
      const scope = body.scope === "helper" ? "helper" : "mcp";
      const token = newToken();
      ok(
        await db.from("api_tokens").insert({
          user_id: userId,
          token_hash: hashToken(token),
          scope,
          label: body.label ?? (scope === "helper" ? "PC helper" : "Claude connector"),
        }),
        "save token",
      );
      return withCors(json({ token, url: scope === "helper" ? `${helperBase}/${token}` : `${mcpBase}/${token}` }));
    }
    if (req.method === "DELETE") {
      // ?scope=mcp revokes only Claude connectors (keeps the PC helper running), and vice versa.
      const scope = new URL(req.url).searchParams.get("scope");
      let del = db.from("api_tokens").delete().eq("user_id", userId);
      if (scope === "mcp" || scope === "helper") del = del.eq("scope", scope);
      ok(await del, "revoke tokens");
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

/** The RefVault PC helper: GET <base>/helper/<token>/jobs · POST <base>/helper/<token>/result */
export async function handleHelper(req: Request, token: string, action: string): Promise<Response> {
  try {
    const db = adminDb();
    const userId = await userFromToken(db, token, "helper");
    if (action === "jobs" && req.method === "GET") return json(await helperJobs(db, userId));
    if (action === "result" && req.method === "POST") {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body || typeof body !== "object") throw new HttpError(400, "Send a JSON body");
      const result = await helperResult(db, userId, body);
      background(runWorker(db, 120_000));
      return json(result);
    }
    throw new HttpError(404, "Unknown helper action");
  } catch (e) {
    return errorResponse(e);
  }
}

function sameSecret(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Called every minute by pg_cron (migration 004) with the shared worker secret. */
export async function handleWorker(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    const db = adminDb();
    const { data: secret } = await db.rpc("app_secret", { p_name: "worker_secret" });
    if (typeof secret !== "string" || !sameSecret(req.headers.get("x-worker-secret") ?? "", secret)) {
      throw new HttpError(401, "Not allowed");
    }
    return json(await runWorker(db, 120_000));
  } catch (e) {
    return errorResponse(e);
  }
}
