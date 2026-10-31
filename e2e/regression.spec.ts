import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";

/**
 * Regression suite for Recura: public pages, sign-up and sign-in, every patient and staff
 * workflow, the demo admin tools, the personal food catalog, and the API's error and
 * permission checks. Tests run in order against one server and build on each other.
 */
test.describe.configure({ mode: "serial" });

const PATIENT = { username: "patient", password: "patient123" };
const MANAGER = { username: "manager", password: "manager123" };

async function login(page: Page, who: { username: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(who.username);
  await page.locator('input[autocomplete="current-password"]').fill(who.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

/** Picks a workflow in the dropdown and runs it. */
async function runWorkflow(page: Page, label: string) {
  await page.locator(".ms-trigger").click();
  await page.getByRole("option", { name: new RegExp(label) }).click();
  await page.getByRole("button", { name: "Run workflow" }).click();
  await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
  await expect(page.locator(".loading-screen")).toHaveCount(0);
}

async function openAccountMenu(page: Page) {
  await page.getByRole("button", { name: /^Account menu for/ }).click();
}

async function apiToken(request: APIRequestContext, who: { username: string; password: string }) {
  const r = await request.post("/api/auth/login", { data: who });
  expect(r.ok()).toBeTruthy();
  return ((await r.json()) as { token: string }).token;
}

// A tiny local "grocery store" page with schema.org products, for the scrape test.
let store: Server;
let storeUrl = "";
test.beforeAll(async () => {
  const products = [
    { "@type": "Product", name: "Organic Rolled Oats 42oz", offers: { price: "6.49" } },
    { "@type": "Product", name: "Wild Salmon Fillets 1lb", offers: { price: "12.99" } },
  ];
  store = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html><title>Store</title><script type="application/ld+json">${JSON.stringify({ "@graph": products })}</script>`);
  });
  await new Promise<void>((resolve) => store.listen(0, "127.0.0.1", resolve));
  const address = store.address();
  storeUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/produce`;
});
test.afterAll(() => store?.close());

test.describe("public pages", () => {
  test("home, about, and photo lightbox", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#hero-title")).toHaveText("Run your clinic on time.");
    await expect(page.getByText("Patients turned away")).toHaveCount(0); // removed stats stay removed

    // Each workflow card photo opens full size, then closes.
    await page.getByRole("button", { name: /^Expand photo:/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close photo" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "About us" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator("#about-title")).toHaveText("Built so Care can run on time.");
    await expect(page.getByRole("heading", { name: "Ms. Perrigiene" })).toBeVisible();

    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Access Portal" })).toBeVisible();
  });
});

test.describe("sign up and sign in", () => {
  test("sign-up validates input, then creates a patient and signs in", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("E2E Patient");
    await page.getByLabel("Username").fill(`e2e_${Date.now()}`);
    await page.locator('input[autocomplete="new-password"]').fill("short");
    await page.getByRole("button", { name: "Sign Up as a Patient" }).click();
    await expect(page.getByRole("alert")).toHaveText("Password must be at least 8 characters");

    await page.locator('input[autocomplete="new-password"]').fill("e2e-password-1");
    await page.getByRole("button", { name: "Sign Up as a Patient" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), E2E/ })).toBeVisible();
    await expect(page.locator(".ms-trigger")).toContainText("View my appointment");
  });

  test("wrong password shows an error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("patient");
    await page.locator('input[autocomplete="current-password"]').fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid username or password");
  });

  test("an unreachable server shows a clear message", async ({ page }) => {
    await login(page, PATIENT);
    await page.route("**/api/appointments/me", (route) => route.abort("failed"));
    await page.locator(".ms-trigger").click();
    await page.getByRole("option", { name: /View my appointment/ }).click();
    await page.getByRole("button", { name: "Run workflow" }).click();
    await expect(page.getByText("Can't reach the server. Check your connection and try again.")).toBeVisible();
  });

  test("an expired session returns to sign-in with a reason", async ({ page }) => {
    await login(page, PATIENT);
    await page.evaluate(() => sessionStorage.setItem("recura.token", "expired-or-forged"));
    await runWorkflowExpectingSignIn(page);
    await expect(page.getByText("Your session expired. Sign in again to continue.")).toBeVisible();
  });
});

async function runWorkflowExpectingSignIn(page: Page) {
  await page.locator(".ms-trigger").click();
  await page.getByRole("option", { name: /View my appointment/ }).click();
  await page.getByRole("button", { name: "Run workflow" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Access Portal" })).toBeVisible();
}

test.describe("patient workflows", () => {
  test("workflow picker lists the four patient workflows", async ({ page }) => {
    await login(page, PATIENT);
    await page.locator(".ms-trigger").click();
    await expect(page.getByRole("option")).toHaveText([/View my appointment/, /Check in/, /Reschedule appointment/, /Arrival calculator/]);
    await page.keyboard.press("Escape");
  });

  test("view appointment shows booked and expected times", async ({ page }) => {
    await login(page, PATIENT);
    await runWorkflow(page, "View my appointment");
    await expect(page.getByText("Booked for")).toBeVisible();
    await expect(page.getByText("Expected start")).toBeVisible();
  });

  test("reschedule moves to an open time", async ({ page }) => {
    await login(page, PATIENT);
    await runWorkflow(page, "Reschedule appointment");
    const slot = page.locator(".slot").first();
    await expect(slot).toBeVisible();
    await slot.click();
    await page.getByRole("button", { name: /^Move to/ }).click();
    await expect(page.locator(".status-message .badge.ok")).toContainText("Moved to");
  });

  test("arrival calculator runs on its own, then locks at check-in", async ({ page, request }) => {
    // Put the patient's appointment at the current slot so check-in is open.
    const token = await apiToken(request, PATIENT);
    const slot = new Date(Math.floor(Date.now() / 1_800_000) * 1_800_000).toISOString();
    const moved = await request.post("/api/demo/patients/p1/time", { data: { start: slot }, headers: { Authorization: `Bearer ${token}` } });
    expect(moved.ok()).toBeTruthy();

    await login(page, PATIENT);
    await runWorkflow(page, "Arrival calculator");
    await expect(page.getByText(/Calculated automatically from the current time/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Calculate" })).toHaveCount(0);
    await expect(page.getByText("In timeframe?")).toBeVisible();

    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: "Check in" }).click();
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await expect(page.getByText("You're checked in", { exact: true })).toBeVisible();

    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: "Arrival calculator" }).click();
    await expect(page.getByText("Calculated from when you checked in.")).toBeVisible();
  });

  test("demo admin shows the Gantt chart and sets and switches times", async ({ page }) => {
    await login(page, PATIENT);
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: /Demo admin/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Demo admin" })).toBeVisible();
    expect(await page.locator(".gantt-row:not(.gantt-axis)").count()).toBeGreaterThanOrEqual(6);

    // Give two patients a free slot on the day shown. (Outside clinic hours the seeded
    // appointments are tomorrow, so don't assume anyone is booked today.)
    const row = (name: string) => page.locator(".admin-table tbody tr", { hasText: name });
    for (const name of ["Priya Nair", "Elena Garcia"]) {
      await row(name).getByRole("button", { name: `Set time for ${name}` }).click();
      await page.locator('[role="option"]:not(.Mui-disabled):not(.Mui-selected)').first().click();
      await expect(page.locator(".status-message .badge.ok")).toContainText(`${name} moved to`);
    }

    // Switch them.
    const priyaBefore = await row("Priya Nair").locator("td").nth(1).innerText();
    const elenaBefore = await row("Elena Garcia").locator("td").nth(1).innerText();
    await row("Priya Nair").getByRole("button", { name: /Switch Priya Nair's time/ }).click();
    await page.getByRole("option", { name: /Elena Garcia/ }).click();
    await expect(page.locator(".status-message .badge.ok")).toContainText("Switched times: Priya Nair ⇄ Elena Garcia");
    await expect(row("Priya Nair").locator("td").nth(1)).toHaveText(elenaBefore);
    await expect(row("Elena Garcia").locator("td").nth(1)).toHaveText(priyaBefore);
  });
});

test.describe("staff workflows", () => {
  test("restock: add, order, edit, and order from the shopping list", async ({ page }) => {
    await login(page, MANAGER);
    await runWorkflow(page, "Restock medical supplies");

    // Add a supply.
    await page.getByRole("button", { name: "+ Add supply" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("E2E face shields");
    await dialog.getByLabel("Category").fill("PPE");
    await dialog.getByLabel("Location").fill("Exam Room B");
    await dialog.getByLabel("Quantity on hand").fill("5");
    await dialog.getByLabel("Unit", { exact: true }).fill("shields");
    await dialog.getByLabel("Reorder when at or below").fill("20");
    await dialog.getByLabel("Unit cost ($)").fill("1.25");
    await dialog.getByLabel("Supplier", { exact: true }).fill("HealthTech Supply");
    await dialog.getByRole("button", { name: "Add supply" }).click();
    await expect(page.locator(".status-message .badge.ok")).toHaveText("Added E2E face shields to the supply list.");
    const row = page.locator("tbody tr", { hasText: "E2E face shields" });
    await expect(row).toContainText("5 shields");

    // Order more.
    await row.getByRole("button", { name: "Actions for E2E face shields" }).click();
    await page.getByRole("menuitem", { name: "Order more" }).click();
    await page.getByRole("dialog").getByLabel("Quantity to order").fill("35");
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(page.locator(".status-message .badge.ok")).toContainText("Stock is now 40");
    await expect(row).toContainText("40 shields");

    // Edit details.
    await row.getByRole("button", { name: "Actions for E2E face shields" }).click();
    await page.getByRole("menuitem", { name: "Edit details" }).click();
    await page.getByRole("dialog").getByLabel("Location").fill("Procedure Room");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".status-message .badge.ok")).toHaveText("Saved changes to E2E face shields.");
    await expect(row).toContainText("Procedure Room");

    // Order the gloves from the shopping list; they should drop off it.
    await page.getByRole("tab", { name: "Shopping list" }).click();
    const gloves = page.locator(".shop li", { hasText: "Nitrile exam gloves" });
    await gloves.getByRole("button", { name: /^Order/ }).click();
    await page.getByRole("button", { name: "Place order" }).click();
    await expect(gloves).toHaveCount(0);

    await page.getByRole("tab", { name: "Update history" }).click();
    await expect(page.locator(".history").getByText("restock").first()).toBeVisible();
  });

  test("food: plan a day, fill the month, collapse settings, and scrape a store link", async ({ page }) => {
    await login(page, MANAGER);
    await runWorkflow(page, "Get food recommendations");

    // Plan one open day.
    const open = page.getByRole("gridcell", { name: /tap to plan/ }).first();
    const label = (await open.getAttribute("aria-label"))!.split(",").slice(0, 2).join(",");
    await open.click();
    await expect(page.getByRole("gridcell", { name: new RegExp(`^${label}.*calories`) })).toBeVisible();

    // Fill next month (always fully open, whatever today's date); the settings fold into a
    // line, and reopen on click.
    await page.getByRole("button", { name: "Next month" }).click();
    const month = (await page.locator("#cal-title").innerText()).split(" ")[0]; // e.g. "November"
    await page.getByRole("button", { name: `Fill all of ${month}`, exact: false }).click();
    await expect(page.getByRole("button", { name: /Show settings/ })).toBeVisible();
    // Every day of that month is planned (the grid's trailing days belong to the next month).
    await expect(page.getByRole("gridcell", { name: new RegExp(`${month} \\d+, tap to plan`) })).toHaveCount(0);
    await page.getByRole("button", { name: /Show settings/ }).click();
    await expect(page.getByLabel("Daily calories")).toBeVisible();

    // Personal catalog: a bad link is caught, a real store page adds foods, and they can be removed.
    const link = page.getByLabel("Store page link");
    await link.fill("not a link");
    await page.getByRole("button", { name: "Scrape link, and add food to local personal catalog" }).click();
    await expect(page.getByText("Paste a full link, starting with https://")).toBeVisible();

    await link.fill(storeUrl);
    await page.getByRole("button", { name: "Scrape link, and add food to local personal catalog" }).click();
    await expect(page.locator(".status-message .badge.ok", { hasText: "Added 2 foods" })).toBeVisible();
    await expect(page.locator(".catalog-list li")).toHaveCount(2);
    await page.getByRole("button", { name: "Remove Wild Salmon Fillets 1lb" }).click();
    await expect(page.locator(".catalog-list li")).toHaveCount(1);
  });
});

test.describe("API regression", () => {
  test("auth, permissions, validation, and double booking", async ({ request }) => {
    // Not signed in.
    expect((await request.get("/api/workflows")).status()).toBe(401);

    // Malformed JSON gets a clear 400, not a 500.
    const bad = await request.post("/api/auth/login", { headers: { "Content-Type": "application/json" }, data: "{oops" });
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toEqual({ error: "The request body isn't valid JSON" });

    // Sign-up can't create privileged roles.
    const boss = await request.post("/api/auth/signup", { data: { name: "X", username: "e2eboss", password: "password123", role: "boss" } });
    expect(boss.status()).toBe(400);

    // Patients can't reach staff workflows; staff can.
    const patient = await apiToken(request, PATIENT);
    const manager = await apiToken(request, MANAGER);
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });
    expect((await request.get("/api/supplies", { headers: as(patient) })).status()).toBe(403);
    expect((await request.get("/api/supplies", { headers: as(manager) })).status()).toBe(200);

    // Supply validation.
    const noName = await request.post("/api/supplies", { headers: as(manager), data: { name: "" } });
    expect(noName.status()).toBe(400);
    const badOrder = await request.post("/api/supplies/sup-1/order", { headers: as(manager), data: { quantity: 0 } });
    expect(badOrder.status()).toBe(400);

    // No double booking: put Kofi in a future slot, then Sam can't reschedule into it.
    const sam = await apiToken(request, { username: "patient2", password: "patient123" });
    const future = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 2, 15, 0)).toISOString();
    expect((await request.post("/api/demo/patients/p6/time", { headers: as(sam), data: { start: future } })).ok()).toBeTruthy();
    const mine = (await (await request.get("/api/appointments/me", { headers: as(sam) })).json()).appointment;
    expect(mine).toBeTruthy();
    const clash = await request.post(`/api/appointments/${mine.id}/reschedule`, { headers: as(sam), data: { newStart: future } });
    expect(clash.status()).toBe(409);
    expect((await clash.json()).error).toMatch(/just booked by someone else/);

    // Scraping rejects non-web links.
    const ftp = await request.post("/api/food/catalog/scrape", { headers: as(manager), data: { url: "ftp://example.com/x" } });
    expect(ftp.status()).toBe(400);
  });
});
