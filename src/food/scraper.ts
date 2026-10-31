import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { FoodItem, Nutrients } from "./types.js";

/**
 * Scrapes product listings from local market pages. Most grocery sites publish
 * schema.org Product data as JSON-LD, which is far more stable than their HTML,
 * so that's what this reads. Only point it at sites whose terms allow it.
 */
export async function scrapeMarket(url: string, reference: FoodItem[]): Promise<FoodItem[]> {
  const res = await fetch(url, { headers: { "User-Agent": "RecuraBot/0.1 (+meal planning)" } });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  const $ = cheerio.load(await res.text());
  const market = new URL(url).hostname;

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
        if (price > 0) products.push({ name: String(n.name), price, category: n.category });
      }
    } catch {
      // Malformed JSON-LD block; skip it.
    }
  });

  return products.map((p) => {
    const match = estimateFrom(p.name, reference);
    return {
      id: `scr-${createHash("sha1").update(`${market}|${p.name}`).digest("hex").slice(0, 12)}`,
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
