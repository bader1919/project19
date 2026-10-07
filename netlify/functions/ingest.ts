import type { Config } from "@netlify/functions";
import { adminDb } from "../../server/db";
import { errorResponse, HttpError, json, userFromRequest } from "../../server/auth";
import { ingestVideo, retryTranscript } from "../../server/library";

/** POST /api/ingest {url, transcript?}  ·  POST /api/ingest {item_id, transcript?} retries a transcript */
export default async (req: Request) => {
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST");
    const db = adminDb();
    const userId = await userFromRequest(db, req);
    const body = (await req.json().catch(() => ({}))) as { url?: string; item_id?: string; transcript?: string };
    if (body.item_id) return json(await retryTranscript(db, userId, body.item_id, body.transcript));
    if (!body.url) throw new HttpError(400, "Paste a YouTube link");
    return json(await ingestVideo(db, userId, body.url, { manualTranscript: body.transcript }));
  } catch (e) {
    return errorResponse(e);
  }
};

export const config: Config = { path: "/api/ingest" };
