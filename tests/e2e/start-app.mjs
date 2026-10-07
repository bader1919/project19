// Starts the Vite dev server (frontend + functions) wired to the local fake Supabase.
import { createServer } from "vite";
import { ANON_KEY, SERVICE_KEY } from "./jwt.mjs";
import { installFakeYouTube } from "./fake-youtube.mjs";

const GATEWAY = `http://localhost:${process.env.GATEWAY_PORT ?? 54321}`;
process.env.VITE_SUPABASE_URL = GATEWAY;
process.env.VITE_SUPABASE_ANON_KEY = ANON_KEY;
process.env.SUPABASE_URL = GATEWAY;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
installFakeYouTube();

const server = await createServer({ server: { port: Number(process.env.APP_PORT ?? 5173), strictPort: true, host: "127.0.0.1" } });
await server.listen();
server.printUrls();
