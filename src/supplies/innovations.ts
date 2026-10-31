import { config } from "../config.js";

export interface Innovation {
  title: string;
  link: string;
  snippet: string;
}

const THEMES = ["easy grip", "environmentally friendly", "reusable", "latest innovation"];
const cache = new Map<string, { at: number; results: Innovation[] }>();
const TTL_MS = 6 * 60 * 60_000;

/**
 * Recent innovations for a tool, via Google Programmable Search when GOOGLE_API_KEY and
 * GOOGLE_CSE_ID are set. Without them, returns ready-made Google search links instead.
 */
export async function findInnovations(itemName: string): Promise<{ source: "google" | "links"; results: Innovation[] }> {
  if (!config.googleApiKey || !config.googleCseId) {
    return {
      source: "links",
      results: THEMES.map((t) => ({
        title: `${itemName}: ${t}`,
        link: `https://www.google.com/search?q=${encodeURIComponent(`${itemName} ${t} medical 2026`)}`,
        snippet: `Search Google for ${t} versions of this tool.`,
      })),
    };
  }

  const hit = cache.get(itemName);
  if (hit && Date.now() - hit.at < TTL_MS) return { source: "google", results: hit.results };

  const q = `${itemName} medical (${THEMES.map((t) => `"${t}"`).join(" OR ")})`;
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", config.googleApiKey);
  url.searchParams.set("cx", config.googleCseId);
  url.searchParams.set("q", q);
  url.searchParams.set("num", "5");
  url.searchParams.set("dateRestrict", "y1");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google search failed: ${res.status}`);
  const data = (await res.json()) as { items?: Array<{ title: string; link: string; snippet: string }> };
  const results = (data.items ?? []).map(({ title, link, snippet }) => ({ title, link, snippet }));
  cache.set(itemName, { at: Date.now(), results });
  return { source: "google", results };
}
