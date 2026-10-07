import type { Config } from "@netlify/functions";
import { adminDb, ok } from "../../server/db";
import { errorResponse, hashToken, HttpError, json, newToken, userFromRequest } from "../../server/auth";

/**
 * POST   /api/token  -> create a connector token (shown once, stored hashed)
 * DELETE /api/token  -> revoke all connector tokens
 */
export default async (req: Request) => {
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
      return json({ token, url: `${new URL(req.url).origin}/mcp/${token}` });
    }
    if (req.method === "DELETE") {
      ok(await db.from("api_tokens").delete().eq("user_id", userId), "revoke tokens");
      return json({ ok: true });
    }
    throw new HttpError(405, "Use POST or DELETE");
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = { path: "/api/token" };
