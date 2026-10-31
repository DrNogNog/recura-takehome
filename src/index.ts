import { app } from "./app.js";
import { config } from "./config.js";
import { closePool } from "./db/pool.js";
import { startLeaderElection } from "./lib/leader.js";
import { initAppointments } from "./appointments/service.js";
import { initSupplies } from "./supplies/service.js";
import { initFood } from "./food/service.js";

await initAppointments();
await initSupplies();
await initFood();
startLeaderElection();

const server = app.listen(config.port, () => {
  console.log(`Recura API (${config.instanceId}) listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await closePool();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
