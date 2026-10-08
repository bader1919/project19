import type { Config } from "@netlify/functions";
import { handleToken } from "../../server/http";

export default (req: Request) => handleToken(req, `${new URL(req.url).origin}/mcp`, `${new URL(req.url).origin}/api/helper`);

export const config: Config = { path: "/api/token" };
