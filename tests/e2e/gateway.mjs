// Fake Supabase API gateway: /rest/v1 -> PostgREST, /auth/v1/user -> JWT check.
import http from "node:http";
import { verify } from "./jwt.mjs";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const PGRST = process.env.PGRST_URL ?? "http://127.0.0.1:3000";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Expose-Headers": "Content-Range, Content-Profile",
};

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") return res.writeHead(204, CORS).end();
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/auth/v1/user") {
      const claims = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!claims?.sub) return res.writeHead(401, { ...CORS, "Content-Type": "application/json" }).end('{"message":"invalid JWT"}');
      return res
        .writeHead(200, { ...CORS, "Content-Type": "application/json" })
        .end(JSON.stringify({ id: claims.sub, email: claims.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      return res.writeHead(200, { ...CORS, "Content-Type": "application/json" }).end("{}");
    }
    if (!url.pathname.startsWith("/rest/v1")) return res.writeHead(404, CORS).end();

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];
    const upstream = await fetch(PGRST + url.pathname.slice("/rest/v1".length) + url.search, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const out = { ...CORS };
    upstream.headers.forEach((v, k) => {
      if (["content-encoding", "transfer-encoding", "connection"].includes(k) || k.startsWith("access-control-")) return;
      out[k] = v;
    });
    res.writeHead(upstream.status, out).end(Buffer.from(await upstream.arrayBuffer()));
  })
  .listen(PORT, () => console.log(`gateway on :${PORT}`));
