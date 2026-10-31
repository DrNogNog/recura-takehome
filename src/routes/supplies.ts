import { Router } from "express";
import { requireAuth, requireRole, STAFF_ROLES } from "../auth/middleware.js";
import { config } from "../config.js";
import { handle, HttpError, sendCached } from "../lib/http.js";
import * as svc from "../supplies/service.js";
import { findInnovations } from "../supplies/innovations.js";

export const suppliesRouter = Router();
suppliesRouter.use(requireAuth, requireRole(...STAFF_ROLES));

/**
 * The supply catalog is read far more than it's written, so it's served with
 * shared-cache headers: a CDN in front (CDN_BASE_URL) can hold it for 60s and keep
 * serving the stale copy for 5 minutes if the origin is unreachable (availability
 * over freshness during a partition). `Vary: Authorization` keeps it per-session.
 */
const CATALOG_CACHE = "public, max-age=0, s-maxage=60, stale-while-revalidate=30, stale-if-error=300";

suppliesRouter.get(
  "/",
  handle(async (req, res) => {
    const data = await svc.listSupplies();
    res.setHeader("Vary", "Authorization");
    sendCached(req, res, { ...data, cdn: config.cdnBaseUrl || null }, { lastUpdated: data.lastUpdated, cacheControl: CATALOG_CACHE });
  })
);

suppliesRouter.get(
  "/consumption",
  handle(async (_req, res) => {
    res.json({ rates: await svc.consumptionRates() });
  })
);

suppliesRouter.get(
  "/shopping-list",
  handle(async (req, res) => {
    const items = await svc.shoppingList();
    const total = +items.reduce((s, i) => s + i.estCost, 0).toFixed(2);
    sendCached(req, res, { items, total }, { cacheControl: "private, max-age=30" });
  })
);

suppliesRouter.get(
  "/history",
  handle(async (_req, res) => {
    res.json({ history: await svc.history() });
  })
);

suppliesRouter.get(
  "/export/accounting.csv",
  handle(async (_req, res) => {
    const csv = await svc.accountingCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="recura-supplies-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  })
);

/** Add a new item to the supply list. */
suppliesRouter.post(
  "/",
  handle(async (req, res) => {
    res.status(201).json({ item: await svc.createSupply(req.body ?? {}, req.user!.name) });
  })
);

/** Order more: body { quantity, unitCost? } adds to stock and logs a restock. */
suppliesRouter.post(
  "/:id/order",
  handle(async (req, res) => {
    const { quantity, unitCost } = req.body ?? {};
    res.json({ item: await svc.orderSupply(String(req.params.id), quantity, unitCost, req.user!.name) });
  })
);

suppliesRouter.patch(
  "/:id",
  handle(async (req, res) => {
    res.json({ item: await svc.updateSupply(String(req.params.id), req.body ?? {}, req.user!.name) });
  })
);

suppliesRouter.post(
  "/:id/use",
  handle(async (req, res) => {
    const { quantity, location } = req.body ?? {};
    if (typeof quantity !== "number") throw new HttpError(400, "quantity must be a number");
    res.json({ item: await svc.recordUse(String(req.params.id), quantity, location, req.user!.name) });
  })
);

suppliesRouter.post(
  "/:id/sterilize",
  handle(async (req, res) => {
    res.json({ item: await svc.markSterilized(String(req.params.id), req.user!.name) });
  })
);

suppliesRouter.get(
  "/:id/history",
  handle(async (req, res) => {
    res.json({ history: await svc.history(String(req.params.id)) });
  })
);

suppliesRouter.get(
  "/:id/innovations",
  handle(async (req, res) => {
    const name = String(req.query.name ?? "");
    if (!name) throw new HttpError(400, "name is required");
    res.json(await findInnovations(name));
  })
);
