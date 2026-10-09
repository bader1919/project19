import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

/**
 * Runs the Netlify functions inside `vite dev`, so the whole app works locally
 * without the Netlify CLI. Production uses real Netlify Functions.
 */
const ROUTES: { pattern: RegExp; file: string; params: string[] }[] = [
  { pattern: /^\/api\/ingest\/?$/, file: "/netlify/functions/ingest.ts", params: [] },
  { pattern: /^\/api\/token\/?$/, file: "/netlify/functions/token.ts", params: [] },
  { pattern: /^\/mcp\/([^/?]+)\/?$/, file: "/netlify/functions/mcp.ts", params: ["token"] },
];

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export function netlifyFunctions(): Plugin {
  return {
    name: "refvault-netlify-functions",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const route = ROUTES.find((r) => r.pattern.test(url.pathname));
        if (!route) return next();
        try {
          const match = url.pathname.match(route.pattern)!;
          const params = Object.fromEntries(route.params.map((p, i) => [p, decodeURIComponent(match[i + 1])]));
          const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: body ? new Uint8Array(body) : undefined,
          });
          const mod = await server.ssrLoadModule(route.file);
          const response: Response = await mod.default(request, { params });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}
