import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/library", () => ({
  addLink: vi.fn(),
  addNote: vi.fn(),
  addToCollection: vi.fn(),
  getItem: vi.fn(),
  getTranscriptPage: vi.fn(),
  ingestVideo: vi.fn(),
  listLinks: vi.fn(),
  listPending: vi.fn(),
  listTopics: vi.fn(),
  retryTranscript: vi.fn(),
  saveAnalysis: vi.fn(),
  searchLibrary: vi.fn(),
  setTopics: vi.fn(),
}));

import * as lib from "../server/library";
import { HttpError } from "../server/auth";
import { handleMcpHttp, handleRpc, INSTRUCTIONS, SERVER_INFO, SUPPORTED_PROTOCOL_VERSIONS, TOOLS } from "../server/mcp";
import type { Db } from "../server/db";

const db = {} as unknown as Db;
const mocked = (f: unknown) => f as ReturnType<typeof vi.fn>;
const ctx = () => ({ db, userId: async () => "user-1" });

type Rpc = { jsonrpc: "2.0"; id: string | number | null; result?: any; error?: { code: number; message: string } };
const rpc = async (method: string, params?: Record<string, unknown>, id: string | number = 1) =>
  (await handleRpc({ jsonrpc: "2.0", id, method, params }, ctx())) as Rpc;
const call = (name: string, args?: Record<string, unknown>) => rpc("tools/call", { name, arguments: args });
const payload = (r: Rpc) => JSON.parse(r.result.content[0].text);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("initialize", () => {
  it("echoes a supported protocol version", async () => {
    for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
      const r = await rpc("initialize", { protocolVersion: v });
      expect(r.result.protocolVersion).toBe(v);
    }
  });
  it("falls back to latest for unknown or missing versions", async () => {
    expect((await rpc("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect((await rpc("initialize")).result.protocolVersion).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });
  it("returns serverInfo, capabilities and instructions", async () => {
    const r = await rpc("initialize", { protocolVersion: "2025-06-18" }, "abc");
    expect(r.id).toBe("abc");
    expect(r.jsonrpc).toBe("2.0");
    expect(r.result.serverInfo).toEqual(SERVER_INFO);
    expect(r.result.capabilities.tools).toBeDefined();
    expect(r.result.instructions).toBe(INSTRUCTIONS);
    expect(r.result.instructions.length).toBeGreaterThan(50);
  });
});

describe("basic methods", () => {
  it("ping returns empty result", async () => {
    const r = await rpc("ping", undefined, 7);
    expect(r).toEqual({ jsonrpc: "2.0", id: 7, result: {} });
  });

  it("tools/list exposes well-formed tools without leaking run", async () => {
    const r = await rpc("tools/list");
    const tools = r.result.tools as Record<string, any>[];
    expect(tools.length).toBe(TOOLS.length);
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.inputSchema.type).toBe("object");
      expect(t).not.toHaveProperty("run");
    }
    expect(JSON.stringify(r)).not.toContain("=>");
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(["add_video", "save_analysis", "search_library", "tag_item"]));
  });

  it("every required property is declared in properties", () => {
    for (const t of TOOLS) {
      const s = t.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
      for (const k of s.required ?? []) expect(s.properties).toHaveProperty(k);
    }
  });

  it("unknown method -> -32601", async () => {
    const r = await rpc("nope/nothing");
    expect(r.error?.code).toBe(-32601);
    expect(r.id).toBe(1);
  });

  it("notification returns null", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx())).toBeNull();
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/cancelled", params: {} }, ctx())).toBeNull();
  });

  it("invalid requests -> -32600", async () => {
    for (const bad of [{ jsonrpc: "1.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 1 }, { jsonrpc: "2.0", id: 1, method: 5 }, null, "str", 5]) {
      const r = (await handleRpc(bad as never, ctx())) as Rpc;
      expect(r.error?.code).toBe(-32600);
    }
    const r = (await handleRpc({ id: 9 } as never, ctx())) as Rpc;
    expect(r.id).toBe(9);
  });
});

describe("tools/call", () => {
  it("wraps JSON output in content[0].text", async () => {
    mocked(lib.listTopics).mockResolvedValue([{ name: "ai", count: 2 }]);
    const r = await call("list_topics");
    expect(r.result.isError).toBeUndefined();
    expect(r.result.content).toHaveLength(1);
    expect(r.result.content[0].type).toBe("text");
    expect(payload(r)).toEqual([{ name: "ai", count: 2 }]);
    expect(lib.listTopics).toHaveBeenCalledWith(db, "user-1");
  });

  it("unknown tool -> -32602", async () => {
    const r = await call("does_not_exist");
    expect(r.error?.code).toBe(-32602);
    expect(r.error?.message).toContain("does_not_exist");
    const r2 = await rpc("tools/call", {});
    expect(r2.error?.code).toBe(-32602);
  });

  it("library throwing -> isError with message", async () => {
    mocked(lib.getItem).mockRejectedValue(new Error("Item not found"));
    const r = await call("get_item", { item_id: "x" });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain("Item not found");
  });

  it("auth failure inside tools/call is reported as isError", async () => {
    const r = (await handleRpc(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_topics" } },
      { db, userId: async () => { throw new HttpError(401, "nope"); } },
    )) as Rpc;
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toContain("nope");
    expect(lib.listTopics).not.toHaveBeenCalled();
  });

  it("missing arguments object is treated as empty", async () => {
    const r = await call("get_item");
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/item_id/);
  });

  describe("validation", () => {
    it.each([
      ["add_video", {}, /url/],
      ["add_video", { url: "" }, /url/],
      ["get_item", {}, /item_id/],
      ["get_transcript", {}, /item_id/],
      ["save_analysis", { item_id: "i" }, /summary/],
      ["save_analysis", { summary: "s" }, /item_id/],
      ["add_note", { item_id: "i" }, /text/],
      ["add_link", { item_id: "i" }, /url/],
      ["add_to_collection", { item_id: "i" }, /collection/],
      ["retry_transcript", {}, /item_id/],
    ] as [string, Record<string, unknown>, RegExp | null][])("%s with %j -> isError", async (name, args, re) => {
      const r = await call(name, args);
      expect(r.result.isError).toBe(true);
      if (re) expect(r.result.content[0].text).toMatch(re);
    });

    // Suspected bug: tag_item declares topics as required but run() does `strArray(...) ?? []`,
    // so a missing topics arg succeeds (and with replace=true would wipe all topics).
    it("tag_item without topics is an error (required by its schema)", async () => {
      mocked(lib.setTopics).mockResolvedValue([]);
      const r = await call("tag_item", { item_id: "i", replace: true });
      expect(r.result.isError).toBe(true);
    });

    it("rejects wrong types", async () => {
      const cases: [string, Record<string, unknown>, RegExp][] = [
        ["save_analysis", { item_id: "i", summary: "s", topics: "ai" }, /topics/],
        ["save_analysis", { item_id: "i", summary: "s", topics: ["a", 1] }, /topics/],
        ["save_analysis", { item_id: "i", summary: "s", key_points: [{}] }, /key_points/],
        ["save_analysis", { item_id: "i", summary: 5 }, /summary/],
        ["tag_item", { item_id: "i", topics: "x" }, /topics/],
        ["tag_item", { item_id: "i", topics: [1] }, /topics/],
        ["search_library", { limit: "abc" }, /limit/],
        ["list_links", { limit: "many" }, /limit/],
        ["list_pending", { limit: {} }, /limit/],
        ["get_transcript", { item_id: "i", page: "first" }, /page/],
        ["add_video", { url: 123 }, /url/],
        ["search_library", { query: ["a"] }, /query/],
      ];
      for (const [name, args, re] of cases) {
        const r = await call(name, args);
        expect(r.result.isError, `${name} ${JSON.stringify(args)}`).toBe(true);
        expect(r.result.content[0].text).toMatch(re);
      }
      expect(lib.saveAnalysis).not.toHaveBeenCalled();
      expect(lib.searchLibrary).not.toHaveBeenCalled();
    });
  });

  describe("argument pass-through", () => {
    it("search_library maps all args", async () => {
      mocked(lib.searchLibrary).mockResolvedValue([]);
      await call("search_library", { query: "q", topic: "t", type: "video", status: "analyzed", limit: 5 });
      expect(lib.searchLibrary).toHaveBeenCalledWith(db, "user-1", { query: "q", topic: "t", type: "video", status: "analyzed", limit: 5 });
    });
    it("search_library with no args passes undefineds; numeric string limit coerced", async () => {
      mocked(lib.searchLibrary).mockResolvedValue([]);
      await call("search_library");
      expect(lib.searchLibrary).toHaveBeenLastCalledWith(db, "user-1", { query: undefined, topic: undefined, type: undefined, status: undefined, limit: undefined });
      await call("search_library", { limit: "7", query: "" });
      expect(lib.searchLibrary).toHaveBeenLastCalledWith(db, "user-1", expect.objectContaining({ limit: 7, query: undefined }));
    });
    it("list_links", async () => {
      mocked(lib.listLinks).mockResolvedValue([]);
      await call("list_links", { query: "gh", domain: "github.com", limit: 3 });
      expect(lib.listLinks).toHaveBeenCalledWith(db, "user-1", { query: "gh", domain: "github.com", limit: 3 });
    });
    it("list_pending defaults limit to 20", async () => {
      mocked(lib.listPending).mockResolvedValue([]);
      await call("list_pending");
      expect(lib.listPending).toHaveBeenLastCalledWith(db, "user-1", 20);
      await call("list_pending", { limit: 4 });
      expect(lib.listPending).toHaveBeenLastCalledWith(db, "user-1", 4);
    });
    it("get_transcript defaults page to 1", async () => {
      mocked(lib.getTranscriptPage).mockResolvedValue({});
      await call("get_transcript", { item_id: "i" });
      expect(lib.getTranscriptPage).toHaveBeenLastCalledWith(db, "user-1", "i", 1);
      await call("get_transcript", { item_id: "i", page: 3 });
      expect(lib.getTranscriptPage).toHaveBeenLastCalledWith(db, "user-1", "i", 3);
    });
    it("get_item", async () => {
      mocked(lib.getItem).mockResolvedValue({ id: "i" });
      expect(payload(await call("get_item", { item_id: "i" }))).toEqual({ id: "i" });
      expect(lib.getItem).toHaveBeenCalledWith(db, "user-1", "i");
    });
    it("tag_item passes replace flag only when strictly true", async () => {
      mocked(lib.setTopics).mockResolvedValue([]);
      await call("tag_item", { item_id: "i", topics: ["a", "b"], replace: true });
      expect(lib.setTopics).toHaveBeenLastCalledWith(db, "user-1", "i", ["a", "b"], { replace: true });
      await call("tag_item", { item_id: "i", topics: ["a"] });
      expect(lib.setTopics).toHaveBeenLastCalledWith(db, "user-1", "i", ["a"], { replace: false });
      await call("tag_item", { item_id: "i", topics: [], replace: "true" });
      expect(lib.setTopics).toHaveBeenLastCalledWith(db, "user-1", "i", [], { replace: false });
    });
    it("save_analysis passes the full args object", async () => {
      mocked(lib.saveAnalysis).mockResolvedValue({ ok: true });
      const args = {
        item_id: "i",
        summary: "s",
        key_points: ["k"],
        topics: ["t"],
        mentions: [{ kind: "book", name: "B", timestamp_sec: 3 }],
        link_labels: [{ url: "https://a.b", label: "L" }],
      };
      await call("save_analysis", args);
      expect(lib.saveAnalysis).toHaveBeenCalledWith(db, "user-1", args);
    });
    it("add_note / add_link / add_to_collection / retry_transcript", async () => {
      mocked(lib.addNote).mockResolvedValue({});
      mocked(lib.addLink).mockResolvedValue({});
      mocked(lib.addToCollection).mockResolvedValue({});
      mocked(lib.retryTranscript).mockResolvedValue({});
      await call("add_note", { item_id: "i", text: "hello" });
      expect(lib.addNote).toHaveBeenCalledWith(db, "user-1", "i", "hello");
      await call("add_link", { item_id: "i", url: "https://x.y", label: "L", context: "C" });
      expect(lib.addLink).toHaveBeenCalledWith(db, "user-1", "i", "https://x.y", "L", "C");
      await call("add_link", { item_id: "i", url: "https://x.y" });
      expect(lib.addLink).toHaveBeenLastCalledWith(db, "user-1", "i", "https://x.y", undefined, undefined);
      await call("add_to_collection", { item_id: "i", collection: "Favs" });
      expect(lib.addToCollection).toHaveBeenCalledWith(db, "user-1", "i", "Favs");
      await call("retry_transcript", { item_id: "i", transcript: "txt" });
      expect(lib.retryTranscript).toHaveBeenCalledWith(db, "user-1", "i", "txt");
      await call("retry_transcript", { item_id: "i" });
      expect(lib.retryTranscript).toHaveBeenLastCalledWith(db, "user-1", "i", undefined);
    });

    describe("add_video", () => {
      it("calls ingestVideo, getItem, getTranscriptPage and returns next_step", async () => {
        mocked(lib.ingestVideo).mockResolvedValue({ item_id: "it1", status: "fetched", already_saved: false });
        mocked(lib.getItem).mockResolvedValue({ id: "it1", analyzed_at: null });
        mocked(lib.getTranscriptPage).mockResolvedValue({ page: 1, pages: 1, text: "hi" });
        const r = await call("add_video", { url: "https://youtu.be/dQw4w9WgXcQ", transcript: "manual" });
        expect(lib.ingestVideo).toHaveBeenCalledWith(db, "user-1", "https://youtu.be/dQw4w9WgXcQ", { manualTranscript: "manual" });
        expect(lib.getItem).toHaveBeenCalledWith(db, "user-1", "it1");
        expect(lib.getTranscriptPage).toHaveBeenCalledWith(db, "user-1", "it1", 1);
        const out = payload(r);
        expect(out.item_id).toBe("it1");
        expect(out.item).toEqual({ id: "it1", analyzed_at: null });
        expect(out.transcript.text).toBe("hi");
        expect(out.next_step).toMatch(/save_analysis/);
        expect(out.next_step).not.toMatch(/Already saved/);
      });

      it("already saved and analyzed -> different next_step", async () => {
        mocked(lib.ingestVideo).mockResolvedValue({ item_id: "it1", already_saved: true });
        mocked(lib.getItem).mockResolvedValue({ id: "it1", analyzed_at: "2024-01-01" });
        mocked(lib.getTranscriptPage).mockResolvedValue({});
        const out = payload(await call("add_video", { url: "u" }));
        expect(out.next_step).toMatch(/Already saved and analyzed/);
        expect(lib.ingestVideo).toHaveBeenCalledWith(db, "user-1", "u", { manualTranscript: undefined });
      });

      it("already saved but not analyzed -> analyze", async () => {
        mocked(lib.ingestVideo).mockResolvedValue({ item_id: "it1", already_saved: true });
        mocked(lib.getItem).mockResolvedValue({ id: "it1", analyzed_at: null });
        mocked(lib.getTranscriptPage).mockResolvedValue({});
        expect(payload(await call("add_video", { url: "u" })).next_step).toMatch(/Analyze/);
      });

      it("ingest failure -> isError and no follow-up calls", async () => {
        mocked(lib.ingestVideo).mockRejectedValue(new Error("Not a YouTube URL"));
        const r = await call("add_video", { url: "bad" });
        expect(r.result.isError).toBe(true);
        expect(r.result.content[0].text).toContain("Not a YouTube URL");
        expect(lib.getItem).not.toHaveBeenCalled();
        expect(lib.getTranscriptPage).not.toHaveBeenCalled();
      });
    });
  });
});

describe("handleMcpHttp", () => {
  const post = (body: unknown, raw = false) =>
    new Request("https://x.test/mcp/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    });

  it("OPTIONS -> 204 with CORS", async () => {
    const res = await handleMcpHttp(new Request("https://x.test/mcp", { method: "OPTIONS" }), ctx());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(await res.text()).toBe("");
  });

  it("GET (and others) -> 405 with Allow", async () => {
    for (const method of ["GET", "DELETE", "PUT"]) {
      const res = await handleMcpHttp(new Request("https://x.test/mcp", { method }), ctx());
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toContain("POST");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  it("invalid JSON -> 400 -32700 (before auth)", async () => {
    const userId = vi.fn(async () => "u");
    const res = await handleMcpHttp(post("{not json", true), { db, userId });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Rpc;
    expect(body.error?.code).toBe(-32700);
    expect(body.id).toBeNull();
    expect(userId).not.toHaveBeenCalled();
  });

  it("auth failure -> 401 JSON-RPC error", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }), {
      db,
      userId: async () => {
        throw new HttpError(401, "Unknown RefVault token");
      },
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await res.json()) as Rpc;
    expect(body.error?.message).toContain("Unknown RefVault token");
    expect(typeof body.error?.code).toBe("number");
  });

  it("non-HttpError auth failure -> 500", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }), {
      db,
      userId: async () => {
        throw new Error("db down");
      },
    });
    expect(res.status).toBe(500);
  });

  it("single request -> single response object with CORS", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", id: 5, method: "ping" }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 5, result: {} });
  });

  it("single notification -> 202 empty", async () => {
    const res = await handleMcpHttp(post({ jsonrpc: "2.0", method: "notifications/initialized" }), ctx());
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("batch array -> array of responses (notifications omitted)", async () => {
    const res = await handleMcpHttp(
      post([
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "nope" },
      ]),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Rpc[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
    expect(body[1].error?.code).toBe(-32601);
  });

  it("batch of one stays an array", async () => {
    const res = await handleMcpHttp(post([{ jsonrpc: "2.0", id: 1, method: "ping" }]), ctx());
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("batch of only notifications -> 202 empty", async () => {
    const res = await handleMcpHttp(
      post([
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", method: "notifications/cancelled" },
      ]),
      ctx(),
    );
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("resolves userId exactly once per HTTP request, even for a batch of tool calls", async () => {
    mocked(lib.listTopics).mockResolvedValue([]);
    const userId = vi.fn(async () => "u-42");
    const res = await handleMcpHttp(
      post([
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_topics" } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_topics" } },
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_pending" } },
      ]),
      { db, userId },
    );
    expect(res.status).toBe(200);
    expect(userId).toHaveBeenCalledTimes(1);
    expect(lib.listTopics).toHaveBeenCalledTimes(2);
    expect(lib.listTopics).toHaveBeenCalledWith(db, "u-42");
  });

  it("resolves userId once for a single request", async () => {
    const userId = vi.fn(async () => "u");
    await handleMcpHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }), { db, userId });
    expect(userId).toHaveBeenCalledTimes(1);
  });

  it("invalid request in body -> 200 with -32600 error", async () => {
    const res = await handleMcpHttp(post({ hello: "world" }), ctx());
    const body = (await res.json()) as Rpc;
    expect(body.error?.code).toBe(-32600);
  });

  it("empty batch array -> 202 (no responses)", async () => {
    const res = await handleMcpHttp(post([]), ctx());
    expect(res.status).toBe(202);
  });
});
