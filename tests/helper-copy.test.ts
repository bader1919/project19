import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Home Assistant add-on", () => {
  it("ships the same helper as the PC installer (one code base)", () => {
    expect(readFileSync("refvault_helper/refvault_helper.py", "utf8")).toBe(readFileSync("public/helper/refvault_helper.py", "utf8"));
  });
});
