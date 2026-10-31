import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinks } from "./links.js";

test("splits links glued together with no separator", () => {
  const { links } = parseLinks("https://store-a.com/producehttps://store-b.com/dairyhttp://store-c.com/bakery");
  assert.deepEqual(links, ["https://store-a.com/produce", "https://store-b.com/dairy", "http://store-c.com/bakery"]);
});

test("splits on spaces, new lines, commas, and semicolons", () => {
  const text = "https://a.com/1 https://b.com/2\nhttps://c.com/3,https://d.com/4; https://e.com/5";
  assert.deepEqual(parseLinks(text).links, ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://d.com/4", "https://e.com/5"]);
});

test("keeps a link nested inside another link's query or path", () => {
  const { links } = parseLinks("https://a.com/go?next=https://b.com/x https://web.archive.org/web/2024/https://c.com/y");
  assert.deepEqual(links, ["https://a.com/go?next=https://b.com/x", "https://web.archive.org/web/2024/https://c.com/y"]);
});

test("trims surrounding punctuation and quotes from pasted prose", () => {
  const { links } = parseLinks('Try (https://a.com/sale), "https://b.com/deals". Or <https://c.com/bulk>!');
  assert.deepEqual(links, ["https://a.com/sale", "https://b.com/deals", "https://c.com/bulk"]);
});

test("removes duplicates (ignoring #fragments) and keeps the pasted order", () => {
  const { links } = parseLinks("https://b.com/x https://a.com/y https://b.com/x#reviews https://a.com/y");
  assert.deepEqual(links, ["https://b.com/x", "https://a.com/y"]);
});

test("reports pieces that aren't usable links", () => {
  const { links, invalid } = parseLinks("https:// https://nodot https://good.com/p");
  assert.deepEqual(links, ["https://good.com/p"]);
  assert.equal(invalid.length, 2);
});

test("finds nothing in text without links", () => {
  assert.deepEqual(parseLinks("just some words, no links"), { links: [], invalid: [] });
});
