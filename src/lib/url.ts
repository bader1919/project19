/** Only render http(s) links as clickable (data comes from video descriptions and AI output). */
export function safeHref(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}
