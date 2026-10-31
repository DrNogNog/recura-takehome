import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { config } from "../config.js";
import { handle, HttpError } from "../lib/http.js";
import * as svc from "../appointments/service.js";

/**
 * Demo admin: view every patient's appointment time and set or switch them.
 * Available to any signed-in account while DEMO_ADMIN isn't "off" — it's for
 * demonstrating the patient workflows, not for production use.
 */
export const demoRouter = Router();

demoRouter.use(requireAuth, (_req, _res, next) => {
  if (!config.demoAdmin) throw new HttpError(404, "Not found");
  next();
});

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

demoRouter.get(
  "/schedule",
  handle(async (req, res) => {
    const day = String(req.query.day ?? new Date().toISOString().slice(0, 10));
    if (!DAY_RE.test(day)) throw new HttpError(400, "day must be YYYY-MM-DD");
    res.setHeader("Cache-Control", "no-store");
    res.json(await svc.demoSchedule(day));
  })
);

demoRouter.post(
  "/patients/:patientId/time",
  handle(async (req, res) => {
    const { start } = req.body ?? {};
    if (typeof start !== "string") throw new HttpError(400, "start is required");
    res.json({ appointment: await svc.demoSetTime(String(req.params.patientId), start) });
  })
);

demoRouter.post(
  "/swap",
  handle(async (req, res) => {
    const { a, b } = req.body ?? {};
    if (typeof a !== "string" || typeof b !== "string") throw new HttpError(400, "a and b appointment ids are required");
    res.json(await svc.demoSwap(a, b));
  })
);

demoRouter.post(
  "/delay",
  handle(async (req, res) => {
    const { doctorId, day, minutes } = req.body ?? {};
    if (typeof doctorId !== "string" || typeof day !== "string" || !DAY_RE.test(day) || typeof minutes !== "number") {
      throw new HttpError(400, "doctorId, day (YYYY-MM-DD), and minutes are required");
    }
    res.json(await svc.setDoctorDelay(doctorId, day, Math.min(240, minutes)));
  })
);
