import { Router } from "express";
import { requireAuth, requireRole, STAFF_ROLES } from "../auth/middleware.js";
import { handle, HttpError } from "../lib/http.js";
import * as svc from "../food/service.js";
import type { MealSlot } from "../food/types.js";

export const foodRouter = Router();
foodRouter.use(requireAuth, requireRole(...STAFF_ROLES));

foodRouter.get(
  "/items",
  handle(async (req, res) => {
    const tags = req.query.tags ? String(req.query.tags).split(",").filter(Boolean) : undefined;
    const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
    const items = await svc.searchItems({ text: req.query.q ? String(req.query.q) : undefined, maxPrice, tags });
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ items });
  })
);

foodRouter.post("/scrape", (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls.map(String) : undefined;
  res.status(202).json(svc.queueScrape(urls));
});

foodRouter.get("/queue", (_req, res) => {
  res.json(svc.queueStatus());
});

/** Query: month=YYYY-MM (defaults to the current month), today=YYYY-MM-DD (the viewer's date). */
foodRouter.get(
  "/plan",
  handle(async (req, res) => {
    const today = svc.resolveToday(req.query.today);
    res.json({ plan: await svc.getMonth(req.user!.id, req.query.month ? String(req.query.month) : undefined, today) });
  })
);

/** Body: { date?: YYYY-MM-DD, month?: YYYY-MM, refill?, today?, dailyCalories?, weeklyBudget?, preferences?, tags? } */
foodRouter.post(
  "/plan/fill",
  handle(async (req, res) => {
    const today = svc.resolveToday(req.body?.today);
    res.json({ plan: await svc.fillPlan(req.user!.id, req.body ?? {}, today) });
  })
);

foodRouter.post(
  "/plan/log",
  handle(async (req, res) => {
    const { date, slot, eaten } = req.body ?? {};
    if (typeof date !== "string" || typeof eaten !== "boolean" || !["breakfast", "lunch", "dinner", "snack"].includes(slot)) {
      throw new HttpError(400, "date (YYYY-MM-DD), slot, and eaten (boolean) are required");
    }
    const today = svc.resolveToday(req.body?.today);
    res.json({ plan: await svc.logMeal(req.user!.id, date, slot as MealSlot, eaten, today) });
  })
);

foodRouter.get(
  "/nutrition",
  handle(async (req, res) => {
    res.json(await svc.nutritionReport(req.user!.id, svc.resolveToday(req.query.today)));
  })
);

foodRouter.get(
  "/habits",
  handle(async (req, res) => {
    res.json(await svc.eatingHabits(req.user!.id));
  })
);
