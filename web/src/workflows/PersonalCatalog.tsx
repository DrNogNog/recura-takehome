import { useCallback, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { Spinner, StatusMessage } from "../components";
import { useAction, usePolling } from "../hooks";
import { parseLinks } from "../links";

interface CatalogItem {
  id: string;
  name: string;
  market: string;
  price: number;
  servingSize: string;
  nutrients: { calories: number; protein: number };
  nutrientsEstimated: boolean;
  sourceUrl?: string;
}

interface ScrapeResponse {
  results: Array<{ url: string; ok: boolean; added?: number; updated?: number; error?: string }>;
  added: number;
  updated: number;
  failed: number;
  skipped: string[];
  invalid: string[];
}

const MAX_LINKS = 10; // matches the server's per-paste limit
const SCRAPE_TIMEOUT_MS = 90_000; // several pages can take a while
const host = (url: string) => new URL(url).hostname + new URL(url).pathname.replace(/\/$/, "");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Paste one or more store page links (separated however you like, even glued together);
 * the server scrapes each page's products into your personal catalog, which only you see
 * and which your meal plans draw from.
 */
export function PersonalCatalog({ onChanged }: { onChanged?: () => void }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [results, setResults] = useState<ScrapeResponse | null>(null);
  const { busy, error, notice, run, setError } = useAction();
  const parsed = useMemo(() => parseLinks(text), [text]);

  const load = useCallback(async () => {
    const r = await api<{ items: CatalogItem[] }>("/api/food/catalog");
    setItems(r.items);
  }, []);
  const reload = usePolling(load);

  async function scrape(e: FormEvent) {
    e.preventDefault();
    if (!parsed.links.length) return setError("Paste at least one link, starting with https://");
    setResults(null);
    const r = await run(
      "scrape",
      () => api<ScrapeResponse>("/api/food/catalog/scrape", { method: "POST", json: { text }, signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS) }),
      (res) => {
        const ok = res.results.length - res.failed;
        const parts = [`Added ${plural(res.added, "food")} from ${plural(ok, "page")}`];
        if (res.updated) parts.push(`${res.updated} already in your catalog were updated`);
        if (res.failed) parts.push(`${plural(res.failed, "link")} couldn't be scraped`);
        return `${parts.join(", ")}.`;
      }
    );
    if (r) {
      setResults(r);
      setText(r.skipped.join("\n")); // anything over the limit stays in the box for next time
      await reload();
      onChanged?.();
    }
  }

  async function remove(item: CatalogItem) {
    // DELETE returns no body, so return `true` explicitly; `run` uses undefined to mean "failed".
    const ok = await run(`remove-${item.id}`, async () => (await api(`/api/food/catalog/${item.id}`, { method: "DELETE" }), true), `Removed ${item.name}.`);
    if (ok) {
      await reload();
      onChanged?.();
    }
  }

  const over = Math.max(0, parsed.links.length - MAX_LINKS);

  return (
    <section className="card" aria-labelledby="catalog-title">
      <div className="card-head">
        <h2 id="catalog-title">Your personal catalog</h2>
        <span className="muted small">{items ? plural(items.length, "item") : ""}</span>
      </div>
      <p className="muted small">
        Add foods from grocery store pages. They're only visible to you, and your meal plans can use them. Nutrition for scraped foods is
        estimated from similar items.
      </p>

      <form className="catalog-form" onSubmit={scrape} noValidate>
        <label className="catalog-url">
          Store page links
          <textarea
            rows={3}
            placeholder={"Paste one or more links, e.g.\nhttps://store-a.com/produce https://store-b.com/dairy"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={20_000}
            aria-describedby="links-found"
          />
        </label>
        <button className="btn primary" disabled={busy !== null || !parsed.links.length}>
          {busy === "scrape" && <Spinner />}
          {busy === "scrape" ? `Scraping ${plural(Math.min(parsed.links.length, MAX_LINKS), "link")}…` : "Scrape link, and add food to local personal catalog"}
        </button>
      </form>

      {/* Live preview of what the parser found, before anything is sent. */}
      <div id="links-found" className="links-found" aria-live="polite">
        {text.trim() && (
          <>
            <span className="muted small">
              {parsed.links.length ? `${plural(parsed.links.length, "link")} found` : "No links found yet. Each link should start with https://"}
              {parsed.invalid.length > 0 && ` · ${plural(parsed.invalid.length, "piece")} ignored`}
              {over > 0 && ` · only the first ${MAX_LINKS} are scraped at a time`}
            </span>
            {parsed.links.length > 0 && (
              <ul className="link-chips">
                {parsed.links.slice(0, MAX_LINKS).map((l) => (
                  <li key={l} title={l}>
                    {host(l)}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <StatusMessage notice={notice} error={error} />

      {results && results.results.length > 0 && (
        <ul className="link-results" aria-label="Results for each link">
          {results.results.map((r) => (
            <li key={r.url} className={r.ok ? "ok" : "failed"}>
              <span aria-hidden="true">{r.ok ? "✓" : "✕"}</span>
              <span className="link-results-url" title={r.url}>
                {host(r.url)}
              </span>
              <span className="muted small">
                {r.ok ? `${plural(r.added ?? 0, "food")} added${r.updated ? `, ${r.updated} updated` : ""}` : r.error}
              </span>
            </li>
          ))}
        </ul>
      )}

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="muted small">Nothing here yet. Paste store links above to get started.</p>
      ) : (
        <ul className="catalog-list">
          {items.map((i) => (
            <li key={i.id}>
              <div>
                <strong>{i.name}</strong>
                <div className="muted small num">
                  ${i.price.toFixed(2)}/{i.servingSize} · {Math.round(i.nutrients.calories)} kcal{i.nutrientsEstimated && " (estimated)"} · {i.market}
                </div>
              </div>
              <button className="btn small ghost" onClick={() => remove(i)} disabled={busy !== null} aria-label={`Remove ${i.name}`}>
                {busy === `remove-${i.id}` ? <Spinner /> : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
