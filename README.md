# Recura

Clinic portal built on **P**ostgreSQL, **E**xpress, **T**ypeScript, and **N**ode.js, with a React web portal.
Patients and staff (doctor, manager, boss) sign in, pick a workflow from a dropdown, and click **Run workflow**.

## Quick start (no databases needed)

```bash
npm install
npm --prefix web install
npm run dev          # API on :3000, portal on http://localhost:5173
```

Every workflow runs on in-memory storage by default. Demo accounts are in `seed/users.json`.

## Full stack (Docker)

```bash
docker compose up --build   # portal at http://localhost:8080
```

This starts 3 API instances behind an nginx load balancer, plus Postgres, Cassandra, DynamoDB Local,
and Elasticsearch, with every workflow switched to its real datastore.

## Workflows

| Portal | Workflow | Storage |
|---|---|---|
| Patient | My appointment | Cassandra |
| Staff | Restock medical supplies | Postgres + CDN cache headers + leader election |
| Staff | Get food recommendations | DynamoDB + Elasticsearch + queue + cache, Claude for AI |

### 1. My appointment (patient)
- Arrival calculator (inside the timeframe?) and minutes-late calculator: `POST /api/calculators/arrival`, `/minutes-late`
- Actual appointment `GET /api/appointments/:id/actual`, expected after delays `.../expected`
- Check-in `POST .../check-in`, status `GET .../status`
- Reschedule with no double booking: slots are claimed atomically (Cassandra `IF NOT EXISTS`)
- Read-heavy polling: ETag + `Last-Modified` + 15s private cache, so repeat checks return 304
- Apple Watch: compact payload at `GET /api/watch/appointment`
- Staff report a doctor running late with `POST /api/appointments/delays`

#### Demo admin (patient menu ☰ → Demo admin)
- Gantt chart of every patient's booked and expected time for a day, with a live "now" line
- Set any patient's time, switch two patients' times, and set the doctor's running delay
- Uses the same slot claims as patient reschedules, so it can't double book
- API under `/api/demo` (`GET /schedule`, `POST /patients/:id/time`, `POST /swap`, `POST /delay`).
  Any signed-in account can use it; set `DEMO_ADMIN=off` to disable it outside demos

### 2. Restock medical supplies (staff)
- Supply list with supplier, lifespan, usage date, reorder date, last sterilized, and "sterilize after every appointment"
- Expense label (defaults to business expense), estimate and unorganized flags
- Consumption rate per location, shopping list, full update history
- Export to accounting (CSV)
- Recent innovations popup: Claude searches the web (web search tool) and summarizes recent
  findings, each linked to the page it cited. Cached 6 hours per item. Without
  `ANTHROPIC_API_KEY` (or if a search fails) it shows plain search links instead
- Mobile shopping list: Expo app in `mobile/` (`cd mobile && npm install && npx expo start`)

### 3. Food recommendations (staff)
- Shared sample market catalog (`seed/food-market.json`), plus each user's personal catalog
  scraped from store pages they paste (schema.org JSON-LD products)
- RAG: market items are retrieved from search, Claude picks meals from only those items,
  then the app computes calories, cost, macros, and micronutrients from stored item data
- Month calendar that follows today's date (past days greyed out): plan one day, or fill the
  rest of the month in one click
- Log meals as eaten or skipped to estimate real eating habits; future plans adapt to them
- Without `ANTHROPIC_API_KEY`, an offline planner is used; either way each day is tuned to
  within about 1% of the calorie target
- Personal catalog: paste a store page link and click "Scrape link, and add food to local
  personal catalog". Foods are visible only to you and used in your meal plans. The server
  only fetches public http(s) pages (no private/local addresses), with a timeout and size cap

### 4. Automations (every account)
A user defines a trigger and optional conditions, adds one or more actions, and the system runs them
when the trigger happens. Open **Automations** from the workflow dropdown.

| Part | Triggers | Actions |
|---|---|---|
| Patient appointments | doctor running late, I check in, appointment rescheduled | Ask Claude (AI), notify |
| Restock supplies (clinic-wide) | supply runs low, equipment needs sterilizing | Ask Claude, notify, order more stock |
| Food recommendations | meal skipped, plan over budget | Ask Claude, notify, re-plan tomorrow |

- **Ask Claude** is the AI step: Claude writes a note, summary, or suggestion from the event. The
  next step can use its reply as `{{previous}}`; messages can also use event fields like `{{itemName}}`
- Conditions (e.g. `delay ≥ 15`, `item contains "glove"`) and a per-item cooldown decide when a rule fires
- **Test run** fires a rule with sample data; steps that change things only say what they would do
- Every run is recorded in **Activity** with each step's result

How it's built (`src/automations/`):
- `events.ts`: in-process event bus. Workflow services only call `emit(...)`; they don't know
  automations exist
- `engine.ts`: subscribes to the bus, matches rules (`conditions.ts`), applies cooldowns, runs the
  actions in order, and records the run. Changes made by actions don't trigger more rules (no loops)
- `triggers.ts`: each trigger's fields, sample data, and summary
- `actions/`: one file per action. Add a new kind of step by adding a handler to `actions/index.ts`
- `validate.ts`: checks rules from the browser. `repos.ts`: storage. `service.ts`: CRUD and test runs
- Storage is `data/automations.json` by default, or Postgres with `AUTOMATIONS_STORE=external`

## Configuration

See `.env.example`. Set `APPOINTMENTS_STORE`, `SUPPLIES_STORE`, and `FOOD_STORE` to `external`
to use the real datastores.

## Scripts

- `npm run dev`: API and portal with hot reload
- `npm run build` / `npm run build:web`: compile the API / portal (the API serves `web/dist`)
- `npm start`: run the compiled API
- `npm test`: unit tests (calculators, calorie tuning, link-safety checks, automations)
- `npm run test:e2e`: builds, then runs the end-to-end regression suite in Microsoft Edge
  (`e2e/regression.spec.ts`) against its own server on port 3100 with in-memory data
- `npm run typecheck`: type-check API and portal

## Code layout (web)

- `web/src/components/`: reusable UI (dialogs, tabs, fields, MUI dropdowns, feedback,
  crash guard, icons), all imported from `./components`
- `web/src/hooks.ts`: `useAction` (busy / error / success state) and `usePolling`
- `web/src/workflows/`: one file per workflow screen
