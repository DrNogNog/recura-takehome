import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { HttpError } from "./lib/http.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { workflowsRouter } from "./routes/workflows.js";
import { appointmentsRouter, calculatorsRouter, watchRouter } from "./routes/appointments.js";
import { suppliesRouter } from "./routes/supplies.js";
import { foodRouter } from "./routes/food.js";
import { demoRouter } from "./routes/demo.js";
import { automationsRouter } from "./routes/automations.js";

export const app = express();

app.set("trust proxy", true); // behind the nginx load balancer
app.use(cors({ exposedHeaders: ["ETag", "Last-Modified", "X-Instance"] }));
app.use(express.json({ limit: "100kb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Instance", config.instanceId); // shows which instance the balancer picked
  next();
});

app.use("/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/calculators", calculatorsRouter);
app.use("/api/watch", watchRouter);
app.use("/api/supplies", suppliesRouter);
app.use("/api/food", foodRouter);
app.use("/api/demo", demoRouter);
app.use("/api/automations", automationsRouter);

// Serve the built web portal when it exists (npm run build:web).
const webDist = path.resolve("web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist, { maxAge: "1h", index: false }));
  app.get(/^\/(?!api\/|health).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error & { type?: string; status?: number }, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // Errors from the JSON body parser: say what's wrong instead of a generic 500.
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "The request body isn't valid JSON" });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "The request is too large" });
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  // Never leak internals to the browser.
  res.status(500).json({ error: "Something went wrong on the server. Try again." });
});
