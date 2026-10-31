import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { fetchPublicHtml } from "../lib/safeFetch.js";
import type { FoodItem, Nutrients } from "./types.js";

/**
 * Scrapes product listings from local market pages. Most grocery sites publish
 * schema.org Product data as JSON-LD, which is far more stable than their HTML,
 * so that's what this reads. Only point it at sites whose terms allow it.
 */
const MAX_PRODUCTS = 100;

export async function scrapeMarket(rawUrl: string, reference: FoodItem[], ownerId?: string): Promise<FoodItem[]> {
  const { url: finalUrl, html } = await fetchPublicHtml(rawUrl);
  const url = finalUrl.toString();
  const $ = cheerio.load(html);
  const market = finalUrl.hostname;

  const products: Array<{ name: string; price: number; category?: string }> = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const nodes = (Array.isArray(data) ? data : data["@graph"] ?? [data]).flatMap((n: any) =>
        n["@type"] === "ItemList" ? (n.itemListElement ?? []).map((e: any) => e.item ?? e) : [n]
      );
      for (const n of nodes) {
        if (n?.["@type"] !== "Product" || !n.name) continue;
        const offer = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        const price = Number(offer?.price ?? offer?.lowPrice);
        const name = String(n.name).replace(/\s+/g, " ").trim().slice(0, 120);
        if (name && price > 0 && price < 10_000 && products.length < MAX_PRODUCTS) {
          products.push({ name, price, category: typeof n.category === "string" ? n.category.slice(0, 40) : undefined });
        }
      }
    } catch {
      // Malformed JSON-LD block; skip it.
    }
  });

  return products.map((p) => {
    const match = estimateFrom(p.name, reference);
    return {
      // Personal items get their own id per owner, so two users scraping one page don't collide.
      id: `scr-${createHash("sha1").update(`${ownerId ?? ""}|${market}|${p.name}`).digest("hex").slice(0, 12)}`,
      ownerId,
      name: p.name,
      market,
      category: p.category ?? match?.category ?? "Other",
      // Listed price is per package; assume ~4 servings when we can't tell.
      price: +(p.price / 4).toFixed(2),
      servingSize: match?.servingSize ?? "1 serving (estimated)",
      nutrients: match?.nutrients ?? GENERIC_SERVING,
      tags: match?.tags ?? [],
      nutrientsEstimated: true,
      sourceUrl: url,
      updatedAt: new Date().toISOString(),
    };
  });
}

const GENERIC_SERVING: Nutrients = {
  calories: 150, protein: 5, carbs: 20, fat: 5, fiber: 2, sugar: 5,
  sodium: 150, potassium: 150, calcium: 30, iron: 1, vitaminC: 2,
};

/** Borrows nutrients from the closest-named known item. */
function estimateFrom(name: string, reference: FoodItem[]): FoodItem | undefined {
  const words = name.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  let best: FoodItem | undefined;
  let bestScore = 0;
  for (const r of reference) {
    const ref = r.name.toLowerCase();
    const score = words.filter((w) => ref.includes(w.replace(/s$/, ""))).length;
    if (score > bestScore) [best, bestScore] = [r, score];
  }
  return best;
}
