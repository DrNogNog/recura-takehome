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
- Recent innovations popup via Google Programmable Search (`GOOGLE_API_KEY`, `GOOGLE_CSE_ID`)
- Mobile shopping list: Expo app in `mobile/` (`cd mobile && npm install && npx expo start`)

### 3. Food recommendations (staff)
- Scrapes local market pages (`FOOD_MARKET_URLS`, schema.org JSON-LD) through a job queue
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

## Configuration

See `.env.example`. Set `APPOINTMENTS_STORE`, `SUPPLIES_STORE`, and `FOOD_STORE` to `external`
to use the real datastores.

## Scripts

- `npm run dev`: API and portal with hot reload
- `npm run build` / `npm run build:web`: compile the API / portal (the API serves `web/dist`)
- `npm start`: run the compiled API
- `npm test`: unit tests (calculators, calorie tuning, link-safety checks)
- `npm run test:e2e`: builds, then runs the end-to-end regression suite in Microsoft Edge
  (`e2e/regression.spec.ts`) against its own server on port 3100 with in-memory data
- `npm run typecheck`: type-check API and portal

## Code layout (web)

- `web/src/components/`: reusable UI (dialogs, tabs, fields, MUI dropdowns, feedback,
  crash guard, icons), all imported from `./components`
- `web/src/hooks.ts`: `useAction` (busy / error / success state) and `usePolling`
- `web/src/workflows/`: one file per workflow screen
