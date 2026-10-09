import type { Config, Context } from "@netlify/functions";
import { handleMcp } from "../../server/http";

export default (req: Request, context: Context) => handleMcp(req, context.params.token);

export const config: Config = { path: "/mcp/:token" };
