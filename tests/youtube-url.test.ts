import { describe, it, expect } from "vitest";
import { parseYouTubeId, formatTimestamp, youtubeWatchUrl } from "../shared/youtube-url";

const ID = "dQw4w9WgXcQ";

describe("parseYouTubeId", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`http://youtube.com/watch?v=${ID}`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?t=42`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}?feature=share`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/v/${ID}`],
    [ID],
    [`  ${ID}  `],
    [`  https://youtu.be/${ID}\n`],
    [`youtube.com/watch?v=${ID}`],
    [`www.youtube.com/watch?v=${ID}`],
    [`youtu.be/${ID}`],
    [`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`],
    [`https://www.youtube.com/watch?v=${ID}&t=30s&list=PL12345&index=2`],
    [`https://www.youtube.com/watch?list=PL12345&v=${ID}&feature=share`],
    [`https://www.youtube.com/watch?v=${ID}#t=10`],
  ])("extracts id from %s", (input) => {
    expect(parseYouTubeId(input)).toBe(ID);
  });

  it("keeps ids with - and _", () => {
    expect(parseYouTubeId("https://youtu.be/a-b_c-d_e-f")).toBe("a-b_c-d_e-f");
    expect(parseYouTubeId("-_-_-_-_-_-")).toBe("-_-_-_-_-_-");
  });

  it.each([
    [""],
    ["   "],
    ["hello world"],
    ["not a url"],
    ["https://example.com/watch?v=" + ID],
    ["https://vimeo.com/123456789"],
    ["https://notyoutube.com/watch?v=" + ID],
    ["https://youtube.com.evil.com/watch?v=" + ID],
    ["https://www.youtube.com/"],
    ["https://www.youtube.com/watch"],
    ["https://www.youtube.com/watch?v=short"],
    ["https://www.youtube.com/watch?v=" + ID + "TOOLONG"],
    ["https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx"],
    ["https://youtu.be/"],
    ["https://youtu.be/tooshort"],
    ["https://www.youtube.com/shorts/abc"],
    ["dQw4w9WgXc"], // 10 chars
    ["dQw4w9WgXcQQ"], // 12 chars
    ["مرحبا بالعالم"],
  ])("returns null for %j", (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});

describe("youtubeWatchUrl", () => {
  it("builds canonical url", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });
});

describe("formatTimestamp", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [59, "0:59"],
    [60, "1:00"],
    [65, "1:05"],
    [599, "9:59"],
    [600, "10:00"],
    [3599, "59:59"],
    [3600, "1:00:00"],
    [3661, "1:01:01"],
    [36000, "10:00:00"],
    [86399, "23:59:59"],
  ])("%d -> %s", (sec, out) => {
    expect(formatTimestamp(sec)).toBe(out);
  });

  it("floors fractions", () => {
    expect(formatTimestamp(65.9)).toBe("1:05");
  });
  it("clamps negatives to 0:00", () => {
    expect(formatTimestamp(-10)).toBe("0:00");
  });
  it("round-trips format for parseable inputs", () => {
    expect(formatTimestamp(7384)).toBe("2:03:04");
  });
});
