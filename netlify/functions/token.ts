import type { Config } from "@netlify/functions";
import { handleToken } from "../../server/http";

export default (req: Request) => handleToken(req, `${new URL(req.url).origin}/mcp`);

export const config: Config = { path: "/api/token" };
