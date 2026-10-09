export interface TranscriptSegment {
  /** start time in seconds */
  start: number;
  /** duration in seconds */
  dur: number;
  text: string;
}

export interface ExtractedLink {
  url: string;
  domain: string;
  context: string;
  source: "description" | "transcript";
  timestamp_sec: number | null;
}

export interface DescriptionInfo {
  /** e.g. "tool", "resource", "chapter", "sponsor", "social", "other" */
  kind: string;
  text: string;
  url?: string | null;
  timestamp_sec?: number | null;
}

export interface Mention {
  /** e.g. "book", "tool", "person", "product", "website", "paper", "course" */
  kind: string;
  name: string;
  context?: string | null;
  timestamp_sec?: number | null;
  url?: string | null;
}
