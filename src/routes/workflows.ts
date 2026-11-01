import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";

export interface Workflow {
  id: string;
  label: string;
  description: string;
}

/** The dropdown for patient accounts. */
const PATIENT_WORKFLOWS: Workflow[] = [
  {
    id: "appointment",
    label: "View my appointment",
    description: "Your booked time and the expected time after any delays.",
  },
  {
    id: "checkin",
    label: "Check in",
    description: "Let the clinic know you've arrived and see whether you're checked in.",
  },
  {
    id: "reschedule",
    label: "Reschedule appointment",
    description: "Pick a new open time. Times can't be double booked.",
  },
  {
    id: "calculator",
    label: "Arrival calculator",
    description: "Check whether an arrival was in the timeframe and how late it was.",
  },
  {
    id: "automations",
    label: "Automations",
    description: "When something happens, run actions automatically, including AI steps written by Claude.",
  },
];

/** The dropdown for clinic staff accounts. */
const STAFF_WORKFLOWS: Workflow[] = [
  {
    id: "restock",
    label: "Restock medical supplies",
    description: "Supply list, reorder dates, sterilization, consumption, and accounting export.",
  },
  {
    id: "food",
    label: "Get food recommendations",
    description: "AI meal planning from local market items with calories, budget, and nutrients.",
  },
  {
    id: "automations",
    label: "Automations",
    description: "When something happens, run actions automatically, including AI steps written by Claude.",
  },
];

export const workflowsRouter = Router();

workflowsRouter.get("/", requireAuth, (req, res) => {
  res.json(req.user!.portal === "staff" ? STAFF_WORKFLOWS : PATIENT_WORKFLOWS);
});
