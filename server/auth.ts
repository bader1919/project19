import { createHash, randomBytes } from "node:crypto";
import type { Db } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return `rv_${randomBytes(24).toString("base64url")}`;
}

/** User id from the browser's Supabase session (Authorization: Bearer <jwt>). */
export async function userFromRequest(db: Db, req: Request): Promise<string> {
  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "Not signed in");
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Session expired — sign in again");
  return data.user.id;
}

/** User id from an MCP connector token (stored only as a SHA-256 hash). */
export async function userFromToken(db: Db, token: string | undefined): Promise<string> {
  if (!token || token.length < 20) throw new HttpError(401, "Missing or invalid RefVault token");
  const { data } = await db.from("api_tokens").select("id, user_id").eq("token_hash", hashToken(token)).maybeSingle();
  if (!data) throw new HttpError(401, "Unknown RefVault token — generate a new connector URL in Settings");
  await db.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id as string;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: (e as Error).message ?? "Server error" }, 500);
}
