import { app } from "./app.js";
import { config } from "./config.js";
import { closePool } from "./db/pool.js";
import { startLeaderElection } from "./lib/leader.js";
import { initAppointments } from "./appointments/service.js";
import { initSupplies } from "./supplies/service.js";
import { initFood } from "./food/service.js";

// Production must not run with the built-in demo signing key.
if (process.env.NODE_ENV === "production" && config.jwtSecret === "dev-only-change-me") {
  console.error("Refusing to start: set JWT_SECRET to a long random value in production.");
  process.exit(1);
}

// Each store can fail to connect (database down, wrong address); say which one, then exit cleanly.
const steps: Array<[string, () => Promise<unknown>]> = [
  [`appointments (${config.appointmentsStore === "external" ? "Cassandra" : "memory"})`, initAppointments],
  [`supplies (${config.suppliesStore === "external" ? "Postgres" : "memory"})`, initSupplies],
  [`food (${config.foodStore === "external" ? "DynamoDB + Elasticsearch" : "memory"})`, initFood],
];
for (const [name, init] of steps) {
  try {
    await init();
  } catch (e) {
    console.error(`Couldn't start ${name}: ${(e as Error).message}`);
    process.exit(1);
  }
}
startLeaderElection();

const server = app.listen(config.port, () => {
  console.log(`Recura API (${config.instanceId}) listening on http://localhost:${config.port}`);
});
server.on("error", (e: NodeJS.ErrnoException) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${config.port} is already in use. Stop the other server or set PORT.` : e);
  process.exit(1);
});

// Log anything that escapes a handler instead of dying silently.
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
