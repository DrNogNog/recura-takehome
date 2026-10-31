import { Router } from "express";
import { config } from "../config.js";
import { isLeader } from "../lib/leader.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    instance: config.instanceId,
    leader: isLeader(),
    stores: {
      appointments: config.appointmentsStore === "external" ? "cassandra" : "memory",
      supplies: config.suppliesStore === "external" ? "postgres" : "memory",
      food: config.foodStore === "external" ? "dynamodb+elasticsearch" : "memory",
    },
    ai: config.anthropicEnabled ? "claude" : "offline-heuristics",
  });
});
