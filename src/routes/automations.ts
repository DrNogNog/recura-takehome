import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { handle } from "../lib/http.js";
import { parseFilter } from "../automations/history.js";
import * as svc from "../automations/service.js";

/** Automations: each account manages its own rules and sees its own run history. */
export const automationsRouter = Router();
automationsRouter.use(requireAuth, (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

automationsRouter.get("/catalog", (req, res) => {
  res.json(svc.catalog(req.user!));
});

automationsRouter.get(
  "/",
  handle(async (req, res) => {
    res.json({ rules: await svc.listRules(req.user!) });
  })
);

automationsRouter.post(
  "/",
  handle(async (req, res) => {
    res.status(201).json({ rule: await svc.createRule(req.user!, req.body) });
  })
);

automationsRouter.patch(
  "/:id",
  handle(async (req, res) => {
    res.json({ rule: await svc.updateRule(req.user!, String(req.params.id), req.body) });
  })
);

automationsRouter.delete(
  "/:id",
  handle(async (req, res) => {
    await svc.deleteRule(req.user!, String(req.params.id));
    res.status(204).end();
  })
);

automationsRouter.post(
  "/:id/test",
  handle(async (req, res) => {
    res.json({ run: await svc.testRule(req.user!, String(req.params.id)) });
  })
);

automationsRouter.get(
  "/inbox",
  handle(async (req, res) => {
    const since = typeof req.query.since === "string" ? req.query.since : undefined;
    res.json({ notifications: await svc.listInbox(req.user!, since) });
  })
);

automationsRouter.get("/queue", (_req, res) => {
  res.json(svc.queueStatus());
});

automationsRouter.get(
  "/history",
  handle(async (req, res) => {
    res.json(await svc.history(req.user!, parseFilter(req.query)));
  })
);

automationsRouter.get(
  "/history.csv",
  handle(async (req, res) => {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="recura-automation-history-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(await svc.historyAsCsv(req.user!, parseFilter(req.query)));
  })
);

automationsRouter.get(
  "/runs",
  handle(async (req, res) => {
    res.json({ runs: await svc.listRuns(req.user!) });
  })
);
