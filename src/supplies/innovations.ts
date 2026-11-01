import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export interface Innovation {
  title: string;
  link: string;
  snippet: string;
}

export type InnovationSource = "claude" | "links";

const THEMES = ["easy grip", "environmentally friendly", "reusable", "latest innovation"];
const TTL_MS = 6 * 60 * 60_000; // re-search an item at most every 6 hours
const MAX_PAUSE_RESUMES = 2;
const MAX_RESULTS = 6;
const cache = new Map<string, { at: number; results: Innovation[] }>();

let client: Anthropic | undefined;

/** Ready-made Google search links: used without an Anthropic key, or if the AI search fails. */
function searchLinks(itemName: string): Innovation[] {
  return THEMES.map((t) => ({
    title: `${itemName}: ${t}`,
    link: `https://www.google.com/search?q=${encodeURIComponent(`${itemName} ${t} medical ${new Date().getFullYear()}`)}`,
    snippet: `Search Google for ${t} versions of this tool.`,
  }));
}

/**
 * Recent innovations for a medical supply, found by Claude with the web search tool.
 * Every link comes from a search result Claude cited (never from text it wrote), and each
 * snippet is Claude's one-line summary of that source. Falls back to plain search links.
 */
export async function findInnovations(itemName: string): Promise<{ source: InnovationSource; results: Innovation[] }> {
  if (!config.anthropicEnabled) return { source: "links", results: searchLinks(itemName) };

  const key = itemName.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { source: "claude", results: hit.results };

  try {
    const results = await searchWithClaude(itemName);
    if (!results.length) return { source: "links", results: searchLinks(itemName) };
    cache.set(key, { at: Date.now(), results });
    return { source: "claude", results };
  } catch (e) {
    console.error(`[innovations] Claude web search failed for "${itemName}":`, e instanceof Error ? e.message : e);
    return { source: "links", results: searchLinks(itemName) };
  }
}

async function searchWithClaude(itemName: string): Promise<Innovation[]> {
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content:
        `Find recent innovations (from the last two years) in "${itemName}" for medical clinics: ` +
        "products or designs that are easier to grip or use, more environmentally friendly or reusable, safer, or cheaper to run. " +
        `List up to ${MAX_RESULTS} distinct findings. For each, write one plain sentence saying what is new, and cite the page it came from. ` +
        "Only include findings you can cite. No introduction or closing summary.",
    },
  ];

  let response: Anthropic.Beta.BetaMessage | undefined;
  for (let attempt = 0; attempt <= MAX_PAUSE_RESUMES; attempt++) {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3, allowed_callers: ["direct"] }],
      messages,
    });
    // "direct" keeps searches out of code execution, so the answer cites its sources.
    // A long server-tool turn can pause; send it back to let Claude finish.
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response || response.stop_reason === "refusal") return [];
  return innovationsFromResponse(response.content);
}

/**
 * Turns Claude's cited sentences into results: each text block with a web-search citation
 * becomes one finding, linked to the cited page, with the heading Claude wrote just before it
 * (e.g. "2. **Colored coatings:**") joined in. One result per page.
 */
export function innovationsFromResponse(content: Anthropic.Beta.BetaContentBlock[]): Innovation[] {
  const results: Innovation[] = [];
  const seen = new Set<string>();
  let lead = ""; // uncited text since the last cited block
  for (const block of content) {
    if (block.type !== "text") continue;
    if (!block.citations?.length) {
      lead += block.text;
      continue;
    }
    const heading = lead.split("\n").pop() ?? "";
    lead = "";
    const sentence = clean(heading + block.text);
    for (const c of block.citations) {
      if (c.type !== "web_search_result_location" || !/^https?:\/\//i.test(c.url) || seen.has(c.url)) continue;
      seen.add(c.url);
      results.push({ title: c.title || new URL(c.url).hostname, link: c.url, snippet: sentence || clean(c.cited_text) });
      break; // one source per finding
    }
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

/** Plain one-line text: no list numbers, bullets, or markdown emphasis. */
function clean(text: string): string {
  return text.replace(/\*\*|__/g, "").replace(/\s+/g, " ").replace(/^[\s\-–•*\d.)]+/, "").trim();
}
