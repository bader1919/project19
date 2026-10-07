/**
 * Minimal stateless MCP server (Streamable HTTP transport, JSON responses).
 * Claude adds it as a custom connector; every request carries the user's token
 * in the URL, so no sessions are needed.
 */
import type { Db } from "./db";
import { HttpError } from "./auth";
import {
  addLink,
  addNote,
  addToCollection,
  getItem,
  getTranscriptPage,
  ingestVideo,
  listLinks,
  listPending,
  listTopics,
  retryTranscript,
  saveAnalysis,
  searchLibrary,
  setTopics,
  type AnalysisInput,
} from "./library";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVER_INFO = { name: "refvault", title: "RefVault", version: "0.1.0" };

export const INSTRUCTIONS = `RefVault is the user's personal reference library (YouTube videos today; wikis and courses later).
The user saves videos so they never lose the links, tools and ideas mentioned in them. Content is English and Arabic.

When the user gives you a YouTube link to save:
1. Call add_video. It stores metadata, description, transcript and every URL found in the description/captions.
2. Read the returned transcript (call get_transcript for further pages when pages > 1) and the description.
3. Call save_analysis with:
   - summary: 4-8 sentences, written in the video's own language (Arabic video -> Arabic summary).
   - key_points: the concrete, re-usable takeaways (steps, numbers, recommendations), not generic statements.
   - topics: 2-6 short topic names. Call list_topics first and REUSE existing topic names whenever they fit; only create new ones when needed.
   - description_info: useful things from the description that are not plain links (tools, resources, discount codes, requirements, sponsor notes) as {kind, text, url?}.
   - mentions: things said out loud without a link (books, tools, people, websites, papers, courses) as {kind, name, context, timestamp_sec}. Include the timestamp from the transcript markers like "[754s]".
   - link_labels: a short human label for EVERY saved link (e.g. "pgvector GitHub repo", "Course discount page"); use the exact url returned by add_video.
   - extra_links: well-known official URLs for important mentions that had no link, only when you are confident they are correct.
4. Tell the user in one or two lines what was saved (title, number of links, topics).

If add_video reports status "transcript_pending", still save an analysis from the title + description, tell the user the transcript is missing, and suggest retry_transcript (or pasting the transcript).
For questions like "which video mentioned X" or "find the link to Y", use search_library and list_links, then answer with the item title, the link and the timestamp.
Never invent links. Never delete or overwrite the user's own notes.`;

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  run: (db: Db, userId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const itemId = { type: "string", description: "Item id (uuid) from add_video, search_library or list_pending" };
const READ = { readOnlyHint: true, openWorldHint: false };

function str(args: Record<string, unknown>, key: string, required = true): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `Missing required argument "${key}"`);
    return undefined;
  }
  if (typeof v !== "string") throw new HttpError(400, `"${key}" must be a string`);
  return v;
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `"${key}" must be a number`);
  return n;
}

function strArray(args: Record<string, unknown>, key: string): string[] | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new HttpError(400, `"${key}" must be an array of strings`);
  return v as string[];
}

export const TOOLS: Tool[] = [
  {
    name: "add_video",
    title: "Save a YouTube video",
    description:
      "Save a YouTube video to the library: fetches title, channel, description, transcript (free YouTube captions first, then the user's configured backup APIs) and extracts every link. Returns the item, its links and the first page of the transcript so you can analyze it and call save_analysis.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Any YouTube video URL (watch, youtu.be, shorts, live)" },
        transcript: { type: "string", description: "Optional transcript text to store when automatic fetching is not possible" },
      },
      required: ["url"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: async (db, userId, args) => {
      const res = await ingestVideo(db, userId, str(args, "url")!, { manualTranscript: str(args, "transcript", false) });
      const item = await getItem(db, userId, res.item_id);
      const transcript = await getTranscriptPage(db, userId, res.item_id, 1);
      return {
        ...res,
        next_step: res.already_saved && item.analyzed_at
          ? "Already saved and analyzed. Show the user the summary or update it with save_analysis if asked."
          : "Analyze the description and transcript, then call save_analysis.",
        item,
        transcript,
      };
    },
  },
  {
    name: "get_transcript",
    title: "Read a transcript page",
    description: "Transcript of a saved video in ~40k-character pages, with [seconds] markers. Use when add_video or get_item reports more than one page.",
    inputSchema: {
      type: "object",
      properties: { item_id: itemId, page: { type: "integer", minimum: 1, description: "Page number, default 1" } },
      required: ["item_id"],
    },
    annotations: READ,
    run: (db, userId, args) => getTranscriptPage(db, userId, str(args, "item_id")!, num(args, "page") ?? 1),
  },
  {
    name: "save_analysis",
    title: "Save summary, topics and labels",
    description:
      "Store your analysis of a saved item: summary, key points, topics, useful description info, things mentioned without a link, and labels for the extracted links. Replaces the previous AI analysis; never touches the user's notes.",
    inputSchema: {
      type: "object",
      properties: {
        item_id: itemId,
        summary: { type: "string", description: "4-8 sentences in the video's language" },
        key_points: { type: "array", items: { type: "string" } },
        topics: { type: "array", items: { type: "string" }, description: "2-6 topic names; reuse existing ones from list_topics" },
        description_info: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", description: "tool | resource | code | requirement | sponsor | social | other" },
              text: { type: "string" },
              url: { type: "string" },
            },
            required: ["kind", "text"],
          },
        },
        mentions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", description: "book | tool | person | website | product | paper | course | other" },
              name: { type: "string" },
              context: { type: "string" },
              timestamp_sec: { type: "integer" },
              url: { type: "string" },
            },
            required: ["kind", "name"],
          },
        },
        link_labels: {
          type: "array",
          items: {
            type: "object",
            properties: { url: { type: "string" }, label: { type: "string" }, context: { type: "string" } },
            required: ["url", "label"],
          },
        },
        extra_links: {
          type: "array",
          description: "Official URLs for important mentions that had no link (only when certain)",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              label: { type: "string" },
              context: { type: "string" },
              timestamp_sec: { type: "integer" },
            },
            required: ["url", "label"],
          },
        },
        title: { type: "string", description: "Optional better title (rarely needed)" },
      },
      required: ["item_id", "summary"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: (db, userId, args) => {
      str(args, "item_id");
      str(args, "summary");
      strArray(args, "key_points");
      strArray(args, "topics");
      return saveAnalysis(db, userId, args as unknown as AnalysisInput);
    },
  },
  {
    name: "search_library",
    title: "Search the library",
    description:
      "Full-text search (English + Arabic, prefix matching) across titles, summaries, topics, descriptions, transcripts, links and notes. Filter by topic, type or status. Empty query lists the most recent items.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        topic: { type: "string" },
        type: { type: "string", enum: ["video", "wiki", "course", "article"] },
        status: { type: "string", enum: ["fetched", "transcript_pending", "analyzed", "error"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    annotations: READ,
    run: (db, userId, args) =>
      searchLibrary(db, userId, {
        query: str(args, "query", false),
        topic: str(args, "topic", false),
        type: str(args, "type", false),
        status: str(args, "status", false),
        limit: num(args, "limit"),
      }),
  },
  {
    name: "get_item",
    title: "Open an item",
    description: "Everything stored for one item: summary, key points, topics, links, mentions, description info, notes and collections.",
    inputSchema: { type: "object", properties: { item_id: itemId }, required: ["item_id"] },
    annotations: READ,
    run: (db, userId, args) => getItem(db, userId, str(args, "item_id")!),
  },
  {
    name: "list_links",
    title: "Find saved links",
    description: "Search every link saved from any item by text (url, label, context) and/or domain. Each result includes the item title and timestamp.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, domain: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 } },
    },
    annotations: READ,
    run: (db, userId, args) =>
      listLinks(db, userId, { query: str(args, "query", false), domain: str(args, "domain", false), limit: num(args, "limit") }),
  },
  {
    name: "list_topics",
    title: "List topics",
    description: "All topics with how many items use each. Call before save_analysis to reuse existing topic names.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: (db, userId) => listTopics(db, userId),
  },
  {
    name: "list_pending",
    title: "Items waiting for analysis",
    description: "Saved items that have not been analyzed yet (oldest first). Use for 'analyze everything pending'.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
    annotations: READ,
    run: (db, userId, args) => listPending(db, userId, num(args, "limit") ?? 20),
  },
  {
    name: "add_note",
    title: "Add a note",
    description: "Add a note to an item (only when the user asks you to note something).",
    inputSchema: {
      type: "object",
      properties: { item_id: itemId, text: { type: "string" } },
      required: ["item_id", "text"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: (db, userId, args) => addNote(db, userId, str(args, "item_id")!, str(args, "text")!),
  },
  {
    name: "add_link",
    title: "Add a link",
    description: "Attach a link to an item by hand.",
    inputSchema: {
      type: "object",
      properties: { item_id: itemId, url: { type: "string" }, label: { type: "string" }, context: { type: "string" } },
      required: ["item_id", "url"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: (db, userId, args) =>
      addLink(db, userId, str(args, "item_id")!, str(args, "url")!, str(args, "label", false), str(args, "context", false)),
  },
  {
    name: "tag_item",
    title: "Set topics",
    description: "Add topics to an item, or replace its topics when replace=true.",
    inputSchema: {
      type: "object",
      properties: { item_id: itemId, topics: { type: "array", items: { type: "string" } }, replace: { type: "boolean" } },
      required: ["item_id", "topics"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: (db, userId, args) => {
      const topics = strArray(args, "topics");
      if (!topics) throw new HttpError(400, 'Missing required argument "topics"');
      return setTopics(db, userId, str(args, "item_id")!, topics, { replace: args.replace === true });
    },
  },
  {
    name: "add_to_collection",
    title: "Add to collection",
    description: "Put an item in a named collection (created if it doesn't exist).",
    inputSchema: {
      type: "object",
      properties: { item_id: itemId, collection: { type: "string" } },
      required: ["item_id", "collection"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: (db, userId, args) => addToCollection(db, userId, str(args, "item_id")!, str(args, "collection")!),
  },
  {
    name: "retry_transcript",
    title: "Retry transcript",
    description: "Try fetching the transcript again for an item marked transcript_pending, or store transcript text the user provides.",
    inputSchema: {
      type: "object",
      properties: { item_id: itemId, transcript: { type: "string" } },
      required: ["item_id"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: (db, userId, args) => retryTranscript(db, userId, str(args, "item_id")!, str(args, "transcript", false)),
  },
];

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

function rpcError(id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export async function handleRpc(
  msg: JsonRpcRequest,
  ctx: { db: Db; userId: () => Promise<string> },
): Promise<JsonRpcResponse | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id, -32600, "Invalid Request");
  const isNotification = msg.id === undefined;

  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id: msg.id ?? null, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: msg.id ?? null,
        result: {
          tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
        },
      };
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(msg.id, -32602, `Unknown tool: ${name}`);
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const userId = await ctx.userId();
        const out = await tool.run(ctx.db, userId, args);
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { content: [{ type: "text", text: JSON.stringify(out, null, 1) }] },
        };
      } catch (e) {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? null,
          result: { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true },
        };
      }
    }
    default:
      if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

/** HTTP entry point for the Streamable HTTP transport (stateless, JSON responses). */
export async function handleMcpHttp(req: Request, ctx: { db: Db; userId: () => Promise<string> }): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") {
    // No server-initiated stream in stateless mode.
    return new Response("Method Not Allowed", { status: 405, headers: { ...cors, Allow: "POST, OPTIONS" } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400, headers: cors });
  }

  // Authenticate once up front so a bad token fails loudly at connect time.
  let userId: string | undefined;
  const lazyUser = async () => (userId ??= await ctx.userId());
  try {
    await lazyUser();
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return Response.json(rpcError(null, -32001, (e as Error).message), { status, headers: cors });
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses = (
    await Promise.all(messages.map((m) => handleRpc(m as JsonRpcRequest, { db: ctx.db, userId: lazyUser })))
  ).filter((r): r is JsonRpcResponse => r !== null);

  if (!responses.length) return new Response(null, { status: 202, headers: cors });
  return Response.json(Array.isArray(body) ? responses : responses[0], { headers: cors });
}
