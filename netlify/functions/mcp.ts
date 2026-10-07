import type { Config, Context } from "@netlify/functions";
import { adminDb } from "../../server/db";
import { userFromToken } from "../../server/auth";
import { handleMcpHttp } from "../../server/mcp";

export default async (req: Request, context: Context) => {
  const db = adminDb();
  return handleMcpHttp(req, { db, userId: () => userFromToken(db, context.params.token) });
};

export const config: Config = { path: "/mcp/:token" };
