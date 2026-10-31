import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { config } from "../config.js";
import { HttpError } from "./http.js";

const MAX_REDIRECTS = 3;

/** True for loopback, private, link-local (incl. cloud metadata), and other non-public addresses. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

/**
 * Rejects anything but a public http(s) address, so a pasted link can't make the
 * server reach into its own network (localhost, internal services, cloud metadata).
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "That doesn't look like a web address. Paste the full link, starting with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "Only http:// and https:// links can be scraped");
  if (url.username || url.password) throw new HttpError(400, "Links with a username or password can't be scraped");
  if (config.allowPrivateScrape) return url; // tests only: lets the E2E suite scrape a local fixture page

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new HttpError(400, "That link points to a private network and can't be scraped");
  }
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new HttpError(400, `Couldn't find the website ${host}. Check the link.`);
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new HttpError(400, "That link points to a private network and can't be scraped");
  return url;
}

/** Fetches a public HTML page with a timeout, a size cap, and every redirect re-checked. */
export async function fetchPublicHtml(raw: string, { timeoutMs = 10_000, maxBytes = 3_000_000 } = {}): Promise<{ url: URL; html: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "RecuraBot/0.1 (+meal planning)", Accept: "text/html,application/xhtml+xml" },
      });
    } catch (e) {
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      throw new HttpError(502, timedOut ? "That website took too long to respond" : "Couldn't reach that website");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hop >= MAX_REDIRECTS) throw new HttpError(502, "That link redirects too many times");
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw new HttpError(502, `That website answered with an error (${res.status})`);
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(type)) throw new HttpError(422, "That link isn't a web page (it may be a file or an image)");
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new HttpError(422, "That page is too large to scrape");

    // Read with a running size cap (content-length can be missing or wrong).
    const reader = res.body?.getReader();
    if (!reader) throw new HttpError(502, "That website sent an empty page");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(422, "That page is too large to scrape");
      }
      chunks.push(value);
    }
    return { url, html: Buffer.concat(chunks).toString("utf8") };
  }
}
