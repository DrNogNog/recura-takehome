import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { innovationsFromResponse } from "./innovations.js";

// Builds a cited text block the way the Messages API returns web search answers.
const cited = (text: string, url: string, title = "Source"): Anthropic.Beta.BetaContentBlock =>
  ({
    type: "text",
    text,
    citations: [{ type: "web_search_result_location", url, title, cited_text: "…", encrypted_index: "x" }],
  }) as unknown as Anthropic.Beta.BetaContentBlock;

test("each cited sentence becomes one result linked to its source", () => {
  const results = innovationsFromResponse([
    { type: "text", text: "Here is what I found:\n\n", citations: null } as unknown as Anthropic.Beta.BetaContentBlock,
    cited("1. Ergonomic scissors with soft-touch grips reduce hand strain.", "https://maker.example/ergo", "Ergo scissors"),
    cited("Reusable stainless handles cut single-use plastic waste.", "https://green.example/handles", "Green handles"),
  ]);
  assert.deepEqual(results, [
    { title: "Ergo scissors", link: "https://maker.example/ergo", snippet: "Ergonomic scissors with soft-touch grips reduce hand strain." },
    { title: "Green handles", link: "https://green.example/handles", snippet: "Reusable stainless handles cut single-use plastic waste." },
  ]);
});

test("uncited text is ignored, so links never come from model-written text", () => {
  const results = innovationsFromResponse([
    { type: "text", text: "See https://made-up.example for more.", citations: null } as unknown as Anthropic.Beta.BetaContentBlock,
  ]);
  assert.deepEqual(results, []);
});

test("the same source page appears only once", () => {
  const results = innovationsFromResponse([
    cited("First finding.", "https://same.example/page"),
    cited("Second finding from the same page.", "https://same.example/page"),
  ]);
  assert.equal(results.length, 1);
});

test("non-web links in citations are skipped", () => {
  assert.deepEqual(innovationsFromResponse([cited("Odd source.", "javascript:alert(1)")]), []);
});

test("the heading before a cited sentence joins its snippet, without markdown", () => {
  const results = innovationsFromResponse([
    { type: "text", text: "Intro line.\n\n2. **Colored coatings:** ", citations: null } as unknown as Anthropic.Beta.BetaContentBlock,
    cited("Finishes include blue and rose gold.", "https://shop.example/scissors"),
  ]);
  assert.equal(results[0]?.snippet, "Colored coatings: Finishes include blue and rose gold.");
});
