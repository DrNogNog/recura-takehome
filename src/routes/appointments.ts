import { Router } from "express";
import { requireAuth, requireRole, STAFF_ROLES } from "../auth/middleware.js";
import { handle, HttpError, sendCached } from "../lib/http.js";
import { checkArrivalWindow, minutesLate } from "../appointments/calculators.js";
import * as svc from "../appointments/service.js";

export const appointmentsRouter = Router();

// Patients poll these often, so responses are short-lived private caches with ETags.
const POLL_CACHE = "private, max-age=15, must-revalidate";

appointmentsRouter.get(
  "/me",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    const appt = await svc.myNextAppointment(req.user!.id);
    sendCached(req, res, { appointment: appt }, { lastUpdated: appt?.lastUpdated, cacheControl: POLL_CACHE });
  })
);

/** API: actual appointment time. */
appointmentsRouter.get(
  "/:id/actual",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    const a = await svc.getForPatient(String(req.params.id), req.user!.id);
    sendCached(req, res, { actualAppointment: a.actualAppointment, lastUpdated: a.lastUpdated }, { lastUpdated: a.lastUpdated, cacheControl: POLL_CACHE });
  })
);

/** API: expected appointment time after the doctor's delays. */
appointmentsRouter.get(
  "/:id/expected",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    const a = await svc.getForPatient(String(req.params.id), req.user!.id);
    sendCached(
      req,
      res,
      { expectedAppointment: a.expectedAppointment, delayMinutes: a.delayMinutes, lastUpdated: a.lastUpdated },
      { lastUpdated: a.lastUpdated, cacheControl: POLL_CACHE }
    );
  })
);

appointmentsRouter.get(
  "/:id/status",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    const a = await svc.getForPatient(String(req.params.id), req.user!.id);
    sendCached(
      req,
      res,
      { checkedIn: a.checkedIn, checkedInAt: a.checkedInAt, status: a.status, lastUpdated: a.lastUpdated },
      { lastUpdated: a.lastUpdated, cacheControl: POLL_CACHE }
    );
  })
);

appointmentsRouter.post(
  "/:id/check-in",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    res.json(await svc.checkIn(String(req.params.id), req.user!.id));
  })
);

appointmentsRouter.get(
  "/:id/slots",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    const day = String(req.query.day ?? new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "day must be YYYY-MM-DD");
    res.json({ day, slots: await svc.availableSlots(String(req.params.id), req.user!.id, day) });
  })
);

appointmentsRouter.post(
  "/:id/reschedule",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    const { newStart } = req.body ?? {};
    if (typeof newStart !== "string") throw new HttpError(400, "newStart is required");
    res.json({ appointment: await svc.reschedule(String(req.params.id), req.user!.id, newStart) });
  })
);

/** Staff report how far behind a doctor is running; every patient's expected time shifts. */
appointmentsRouter.post(
  "/delays",
  requireAuth,
  requireRole(...STAFF_ROLES),
  handle(async (req, res) => {
    const { doctorId = "d1", day = new Date().toISOString().slice(0, 10), minutes } = req.body ?? {};
    if (typeof minutes !== "number") throw new HttpError(400, "minutes must be a number");
    res.json(await svc.setDoctorDelay(doctorId, day, minutes));
  })
);

export const calculatorsRouter = Router();

/** Calculator: did the patient arrive in the timeframe, and how late were they. */
calculatorsRouter.post("/arrival", (req, res) => {
  const { scheduledAt, arrivedAt, earlyMinutes, graceMinutes } = req.body ?? {};
  const s = new Date(scheduledAt);
  const a = new Date(arrivedAt ?? Date.now());
  if (Number.isNaN(s.getTime()) || Number.isNaN(a.getTime())) {
    return res.status(400).json({ error: "scheduledAt and arrivedAt must be valid dates" });
  }
  res.json(checkArrivalWindow(s, a, earlyMinutes ?? 30, graceMinutes ?? 10));
});

calculatorsRouter.post("/minutes-late", (req, res) => {
  const s = new Date(req.body?.scheduledAt);
  const a = new Date(req.body?.arrivedAt ?? Date.now());
  if (Number.isNaN(s.getTime()) || Number.isNaN(a.getTime())) {
    return res.status(400).json({ error: "scheduledAt and arrivedAt must be valid dates" });
  }
  res.json({ minutesLate: minutesLate(s, a) });
});

/** Compact payload for an Apple Watch complication or widget: small, flat, and cacheable. */
export const watchRouter = Router();

watchRouter.get(
  "/appointment",
  requireAuth,
  requireRole("patient"),
  handle(async (req, res) => {
    const a = await svc.myNextAppointment(req.user!.id);
    const body = a
      ? {
          t: a.expectedAppointment,
          late: a.delayMinutes,
          in: a.checkedIn,
          dr: a.doctorName,
          u: a.lastUpdated,
        }
      : null;
    sendCached(req, res, body, { lastUpdated: a?.lastUpdated, cacheControl: POLL_CACHE });
  })
);
