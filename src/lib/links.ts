/**
 * Pulls every web link out of pasted text. Links can be separated by spaces, new lines,
 * commas, semicolons, or nothing at all ("https://a.com/xhttps://b.com/y"): each
 * "http://" or "https://" starts a new link.
 *
 * The exception is a link nested inside another one, e.g. "?next=https://…",
 * "&u=https%3A…", or an archive path ".../web/2024/https://…". A scheme that directly
 * follows "=", "/", ":", or "%" belongs to the surrounding link, so it isn't split there.
 */
export interface ParsedLinks {
  links: string[]; // valid, de-duplicated, in the order pasted
  invalid: string[]; // pieces that started with http(s):// but aren't usable links
}

const SCHEME = /https?:\/\//gi;
const NESTED_BEFORE = new Set(["=", "/", ":", "%"]);
// Punctuation that often sticks to a link pasted in a sentence or list.
const TRAILING_JUNK = /[\s,;|.!?"'`<>()[\]{}]+$/;
const LEADING_JUNK = /^[\s"'`<([{]+/;

export function parseLinks(text: string): ParsedLinks {
  const starts: number[] = [];
  for (const m of text.matchAll(SCHEME)) {
    const i = m.index!;
    if (i > 0 && NESTED_BEFORE.has(text[i - 1])) continue; // nested inside the previous link
    starts.push(i);
  }

  const links: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  starts.forEach((start, n) => {
    const raw = text.slice(start, starts[n + 1] ?? text.length);
    // A link never contains whitespace, so anything after it is a separator or prose.
    const piece = raw.split(/\s/)[0].replace(LEADING_JUNK, "").replace(TRAILING_JUNK, "");
    let url: URL;
    try {
      url = new URL(piece);
    } catch {
      invalid.push(piece);
      return;
    }
    const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname);
    if (!url.hostname || (!url.hostname.includes(".") && url.hostname !== "localhost" && !isIp)) {
      invalid.push(piece);
      return;
    }
    url.hash = ""; // "#reviews" points at the same page
    const key = url.href;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(key);
  });
  return { links, invalid };
}
