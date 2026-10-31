import { useCallback, useState, type FormEvent } from "react";
import { api } from "../api";
import { Spinner, StatusMessage } from "../components";
import { useAction, usePolling } from "../hooks";

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

const looksLikeUrl = (s: string) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s.trim());

/**
 * Paste a store page link; the server scrapes its products into your personal catalog,
 * which only you see and which your meal plans draw from.
 */
export function PersonalCatalog({ onChanged }: { onChanged?: () => void }) {
  const [url, setUrl] = useState("");
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const { busy, error, notice, run, setError } = useAction();

  const load = useCallback(async () => {
    const r = await api<{ items: CatalogItem[] }>("/api/food/catalog");
    setItems(r.items);
  }, []);
  const reload = usePolling(load);

  async function scrape(e: FormEvent) {
    e.preventDefault();
    if (!looksLikeUrl(url)) return setError("Paste a full link, starting with https://");
    const r = await run(
      "scrape",
      () => api<{ added: number; updated: number; items: CatalogItem[] }>("/api/food/catalog/scrape", { method: "POST", json: { url: url.trim() } }),
      (res) => {
        const site = res.items[0]?.market ?? "that page";
        const parts = [`Added ${res.added} food${res.added === 1 ? "" : "s"} from ${site}`];
        if (res.updated) parts.push(`${res.updated} already in your catalog were updated`);
        return `${parts.join(", ")}.`;
      }
    );
    if (r) {
      setUrl("");
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

  return (
    <section className="card" aria-labelledby="catalog-title">
      <div className="card-head">
        <h2 id="catalog-title">Your personal catalog</h2>
        <span className="muted small">{items ? `${items.length} item${items.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      <p className="muted small">
        Add foods from any grocery store page. They're only visible to you, and your meal plans can use them. Nutrition for scraped foods is
        estimated from similar items.
      </p>

      <form className="catalog-form" onSubmit={scrape} noValidate>
        <label className="catalog-url">
          Store page link
          <input type="url" inputMode="url" placeholder="https://store.example.com/produce" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2000} />
        </label>
        <button className="btn primary" disabled={busy !== null}>
          {busy === "scrape" && <Spinner />}
          {busy === "scrape" ? "Scraping…" : "Scrape link, and add food to local personal catalog"}
        </button>
      </form>
      <StatusMessage notice={notice} error={error} />

      {items === null ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="muted small">Nothing here yet. Paste a store link above to get started.</p>
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
