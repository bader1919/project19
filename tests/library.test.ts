import { describe, expect, it } from "vitest";
import { parsePastedTranscript } from "../server/library";

describe("parsePastedTranscript", () => {
  it("parses YouTube 'Show transcript' copy (timestamp on its own line)", () => {
    const raw = "0:00\nhey everyone\n0:04\nwelcome back\n1:02:03\nlast line";
    expect(parsePastedTranscript(raw)).toEqual([
      { start: 0, dur: 0, text: "hey everyone" },
      { start: 4, dur: 0, text: "welcome back" },
      { start: 3723, dur: 0, text: "last line" },
    ]);
  });

  it("parses 'timestamp text' on one line, including Arabic", () => {
    expect(parsePastedTranscript("0:00 السلام عليكم\n0:30 اليوم نتحدث")).toEqual([
      { start: 0, dur: 0, text: "السلام عليكم" },
      { start: 30, dur: 0, text: "اليوم نتحدث" },
    ]);
  });

  it("joins wrapped lines onto the previous cue", () => {
    expect(parsePastedTranscript("0:00 first part\ncontinues here\n0:10 next")).toEqual([
      { start: 0, dur: 0, text: "first part continues here" },
      { start: 10, dur: 0, text: "next" },
    ]);
  });

  it("returns [] for plain text without timestamps", () => {
    expect(parsePastedTranscript("just a paragraph of text\nanother line\nmeeting at 10:30 maybe")).toEqual([]);
  });
});
