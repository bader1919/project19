import type { Config } from "@netlify/functions";
import { handleIngest } from "../../server/http";

export default (req: Request) => handleIngest(req);

export const config: Config = { path: "/api/ingest" };
