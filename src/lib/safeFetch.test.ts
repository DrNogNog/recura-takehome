import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl } from "./safeFetch.js";

// The scraper fetches links people paste, so it must never reach the server's own network.
const rejects = (url: string) =>
  assert.rejects(assertPublicUrl(url), (e: Error & { status?: number }) => e.status === 400, `${url} should be rejected`);

test("rejects non-web schemes and malformed links", async () => {
  await rejects("ftp://example.com/file");
  await rejects("file:///etc/passwd");
  await rejects("javascript:alert(1)");
  await rejects("not a link");
});

test("rejects private, loopback, and metadata addresses", async () => {
  for (const url of [
    "http://localhost:3000/",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://192.168.1.10/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://printer.local/",
  ]) {
    await rejects(url);
  }
});

test("rejects links with embedded credentials", async () => {
  await rejects("https://user:pass@example.com/");
});

test("accepts a public IP address", async () => {
  const url = await assertPublicUrl("https://93.184.216.34/produce");
  assert.equal(url.hostname, "93.184.216.34");
});
