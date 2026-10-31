import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ErrorNote, IconArrow, IconChevron, Meter, Spinner, Stat } from "../components";
import { PersonalCatalog } from "./PersonalCatalog";

type Slot = "breakfast" | "lunch" | "dinner" | "snack";
interface N {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  potassium: number;
  calcium: number;
  iron: number;
  vitaminC: number;
}
interface Meal {
  slot: Slot;
  name: string;
  eaten?: boolean;
  nutrients: N;
  cost: number;
  items: Array<{ itemId: string; name: string; servings: number; servingSize: string }>;
}
interface Day {
  date: string;
  meals: Meal[];
  nutrients: N;
  cost: number;
}
interface MonthPlan {
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD
  days: Record<string, Day>;
  settings: { dailyCalories: number; weeklyBudget: number; preferences: string; tags: string[] };
  notes?: string;
  generatedBy: "claude" | "heuristic";
  monthTotals: { daysFilled: number; cost: number };
}
interface Report {
  range: { from: string; to: string };
  daysFilled: number;
  dailyAverage: N | null;
  percentOfDailyValue: Record<keyof N, number> | null;
  macroSplit: { protein: number; carbs: number; fat: number } | null;
  weekCost?: number;
  insights: string[];
}
interface Habits {
  mealsLogged: number;
  adherencePercent: number | null;
  avgEatenCaloriesPerDay: number | null;
  mostSkippedSlot: string | null;
  summary: string;
}

const TAGS = ["vegetarian", "vegan", "gluten-free", "high-protein", "high-fiber"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MICROS: Array<[keyof N, string]> = [
  ["fiber", "Fiber"],
  ["potassium", "Potassium"],
  ["calcium", "Calcium"],
  ["iron", "Iron"],
  ["vitaminC", "Vitamin C"],
  ["sodium", "Sodium (limit)"],
];

// ---------- Local-date helpers (the calendar follows the viewer's own clock) ----------
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localToday = () => ymd(new Date());
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthName = (month: string, opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) =>
  parseYmd(`${month}-01`).toLocaleDateString(undefined, opts);
const longDate = (s: string) => parseYmd(s).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortDate = (s: string) => parseYmd(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Whole weeks (Sunday first) covering the month, including neighbouring months' days. */
function monthGrid(month: string): string[] {
  const first = parseYmd(`${month}-01`);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((first.getDay() + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => ymd(new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay() + i)));
}

export function FoodWorkflow({ onReady }: { onReady: () => void }) {
  const [today, setToday] = useState(localToday);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [plan, setPlan] = useState<MonthPlan | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [habits, setHabits] = useState<Habits | null>(null);
  const [form, setForm] = useState({ dailyCalories: 2000, weeklyBudget: 75, preferences: "", tags: [] as string[] });
  const [filling, setFilling] = useState<string | null>(null); // a date, or "month"
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The settings card folds into a slim line after a whole-month fill; clicking the line reopens it.
  const [settingsOpen, setSettingsOpen] = useState(true);

  // Keep "today" real-time: roll over at midnight without a reload.
  useEffect(() => {
    const t = setInterval(() => setToday((prev) => (localToday() === prev ? prev : localToday())), 60_000);
    return () => clearInterval(t);
  }, []);

  const refreshInsights = useCallback(async () => {
    const [r, h] = await Promise.all([api<Report>(`/api/food/nutrition?today=${today}`), api<Habits>("/api/food/habits")]);
    setReport(r);
    setHabits(h);
  }, [today]);

  const loadMonth = useCallback(
    async (m: string) => {
      const r = await api<{ plan: MonthPlan }>(`/api/food/plan?month=${m}&today=${today}`);
      setPlan(r.plan);
      return r.plan;
    },
    [today]
  );

  // First load: settings come from the saved plan.
  useEffect(() => {
    loadMonth(month)
      .then((p) => {
        setForm(p.settings);
        return refreshInsights();
      })
      .catch((e) => setError(e.message))
      .finally(onReady);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToMonth(m: string) {
    setMonth(m);
    setOpenDate(null);
    loadMonth(m).catch((e) => setError(e.message));
  }

  async function fill(date?: string) {
    setFilling(date ?? "month");
    setError(null);
    try {
      const r = await api<{ plan: MonthPlan }>("/api/food/plan/fill", {
        method: "POST",
        json: { ...form, today, ...(date ? { date } : { month }) },
      });
      setPlan(r.plan);
      if (date) setOpenDate(date);
      else setSettingsOpen(false);
      await refreshInsights();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFilling(null);
    }
  }

  async function log(date: string, slot: Slot, eaten: boolean) {
    try {
      const r = await api<{ plan: MonthPlan }>("/api/food/plan/log", { method: "POST", json: { date, slot, eaten, today } });
      setPlan(r.plan);
      await refreshInsights();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const grid = useMemo(() => monthGrid(month), [month]);
  if (!plan) return <ErrorNote error={error} />;

  const currentMonth = today.slice(0, 7);
  const isCurrentMonth = month === currentMonth;
  const openDays = grid.filter((d) => d.startsWith(month) && d >= today && !plan.days[d]).length;
  const open = openDate ? plan.days[openDate] : null;

  return (
    <div className="stack-lg">
      {!settingsOpen ? (
        <button
          type="button"
          className="collapsed-line"
          aria-expanded={false}
          aria-controls="food-settings"
          onClick={() => setSettingsOpen(true)}
        >
          <span className="collapsed-rule" aria-hidden="true" />
          <span className="collapsed-label">
            <strong>Food recommendations</strong>
            <span className="muted">
              {form.dailyCalories.toLocaleString()} kcal/day · ${form.weeklyBudget}/week
              {form.tags.length ? ` · ${form.tags.join(", ")}` : ""}
            </span>
            <span className="collapsed-cta">
              Show settings <IconChevron size={14} />
            </span>
          </span>
          <span className="collapsed-rule" aria-hidden="true" />
        </button>
      ) : (
      <section className="card" id="food-settings" aria-labelledby="food-title">
        <div className="card-head">
          <h2 id="food-title">Food recommendations</h2>
          <span className="row gap">
            <span className="pill">{plan.generatedBy === "claude" ? "AI: Claude + market search" : "Offline planner"}</span>
            <button type="button" className="btn small ghost" aria-expanded={true} aria-controls="food-settings" onClick={() => setSettingsOpen(false)}>
              Collapse
            </button>
          </span>
        </div>
        <form
          className="food-form"
          onSubmit={(e) => {
            e.preventDefault();
            fill();
          }}
        >
          <label>
            Daily calories
            <input type="number" min={1000} max={5000} step={50} value={form.dailyCalories} onChange={(e) => setForm({ ...form, dailyCalories: Number(e.target.value) })} />
          </label>
          <label>
            Weekly budget ($)
            <input type="number" min={10} max={1000} value={form.weeklyBudget} onChange={(e) => setForm({ ...form, weeklyBudget: Number(e.target.value) })} />
          </label>
          <label className="span2">
            Preferences
            <input placeholder="e.g. quick lunches, more fish, no mushrooms" value={form.preferences} onChange={(e) => setForm({ ...form, preferences: e.target.value })} />
          </label>
          <fieldset className="span2 tags">
            <legend>Dietary needs</legend>
            {TAGS.map((t) => (
              <label key={t} className="check">
                <input
                  type="checkbox"
                  checked={form.tags.includes(t)}
                  onChange={(e) => setForm({ ...form, tags: e.target.checked ? [...form.tags, t] : form.tags.filter((x) => x !== t) })}
                />
                {t}
              </label>
            ))}
          </fieldset>
          <button className="btn primary span2" disabled={filling !== null || openDays === 0}>
            {filling === "month" && <Spinner />}
            {openDays === 0
              ? `Every day left in ${monthName(month, { month: "long" })} is planned`
              : `${isCurrentMonth ? "Fill the rest of" : "Fill all of"} ${monthName(month, { month: "long" })} (single click · ${openDays} days)`}
          </button>
        </form>
        <ErrorNote error={error} />
      </section>
      )}
      {!settingsOpen && <ErrorNote error={error} />}

      <section className="card" aria-labelledby="cal-title">
        <div className="cal-head">
          <button className="btn small ghost cal-nav" onClick={() => goToMonth(shiftMonth(month, -1))} disabled={month <= currentMonth} aria-label="Previous month">
            <span className="flip">
              <IconArrow size={16} />
            </span>
          </button>
          <div className="cal-title">
            <h2 id="cal-title">{monthName(month)}</h2>
            <span className="muted small">
              {plan.monthTotals.daysFilled} days planned · ${plan.monthTotals.cost.toFixed(2)}
            </span>
          </div>
          <button className="btn small ghost cal-nav" onClick={() => goToMonth(shiftMonth(month, 1))} disabled={month >= shiftMonth(currentMonth, 11)} aria-label="Next month">
            <IconArrow size={16} />
          </button>
        </div>
        {!isCurrentMonth && (
          <button className="btn small cal-today" onClick={() => goToMonth(currentMonth)}>
            Back to today
          </button>
        )}

        <div className="cal" role="grid" aria-labelledby="cal-title">
          <div className="cal-row cal-weekdays" role="row">
            {WEEKDAYS.map((w) => (
              <span key={w} role="columnheader">
                {w}
              </span>
            ))}
          </div>
          {Array.from({ length: grid.length / 7 }, (_, r) => (
            <div className="cal-row" role="row" key={r}>
              {grid.slice(r * 7, r * 7 + 7).map((date) => {
                const d = plan.days[date];
                const inMonth = date.startsWith(month);
                const past = date < today;
                const isToday = date === today;
                const disabled = filling !== null || (past && !d) || (!inMonth && past);
                const cls = [
                  "cal-day",
                  !inMonth && "other-month",
                  past && "past",
                  isToday && "today",
                  d && "filled",
                  openDate === date && "open",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={date}
                    role="gridcell"
                    className={cls}
                    disabled={disabled}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${longDate(date)}${isToday ? ", today" : ""}${past ? ", past" : ""}${
                      d ? `, ${Math.round(d.nutrients.calories)} calories, $${d.cost.toFixed(2)}` : past ? "" : ", tap to plan"
                    }`}
                    onClick={() => (d ? setOpenDate(openDate === date ? null : date) : fill(date))}
                  >
                    <span className="cal-num">{parseYmd(date).getDate()}</span>
                    {isToday && <span className="cal-badge">Today</span>}
                    {filling === date ? (
                      <Spinner />
                    ) : d ? (
                      <span className="cal-meta">
                        {Math.round(d.nutrients.calories)} kcal
                        <br />${d.cost.toFixed(2)}
                      </span>
                    ) : !past ? (
                      <span className="cal-meta add">+ Plan</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="cal-legend muted small">
          <span className="sw today" /> Today <span className="sw filled" /> Planned <span className="sw past" /> Past days and other months
        </p>

        {open && openDate && (
          <div className="day-detail" aria-live="polite">
            <div className="card-head">
              <h3>{longDate(openDate)}</h3>
              {openDate >= today && (
                <button className="btn small ghost" onClick={() => fill(openDate)} disabled={filling !== null}>
                  Regenerate day
                </button>
              )}
            </div>
            <ul className="meals">
              {open.meals.map((m) => (
                <li key={m.slot} className={m.eaten === true ? "eaten" : m.eaten === false ? "skipped" : ""}>
                  <div>
                    <span className="slot-label">{m.slot}</span>
                    <strong>{m.name}</strong>
                    <div className="muted small">{m.items.map((it) => `${it.servings}× ${it.name}`).join(" · ")}</div>
                    <div className="muted small num">
                      {Math.round(m.nutrients.calories)} kcal · P {Math.round(m.nutrients.protein)}g · C {Math.round(m.nutrients.carbs)}g · F{" "}
                      {Math.round(m.nutrients.fat)}g · ${m.cost.toFixed(2)}
                    </div>
                  </div>
                  <div className="actions">
                    <button className={`btn small ${m.eaten === true ? "primary" : ""}`} aria-pressed={m.eaten === true} onClick={() => log(openDate, m.slot, true)}>
                      Ate it
                    </button>
                    <button className={`btn small ${m.eaten === false ? "danger" : ""}`} aria-pressed={m.eaten === false} onClick={() => log(openDate, m.slot, false)}>
                      Skipped
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {plan.notes && <p className="note">{plan.notes}</p>}
      </section>

      <div className="grid two">
        <section className="card" aria-labelledby="nutri-title">
          <h2 id="nutri-title">This week's nutrients</h2>
          {report && (
            <p className="muted small">
              {shortDate(report.range.from)} – {shortDate(report.range.to)}
            </p>
          )}
          {report?.dailyAverage && report.percentOfDailyValue && report.macroSplit ? (
            <>
              <div className="stats">
                <Stat label="Avg calories" value={Math.round(report.dailyAverage.calories)} sub={`target ${plan.settings.dailyCalories}`} />
                <Stat label="Protein" value={`${Math.round(report.dailyAverage.protein)}g`} sub={`${report.macroSplit.protein}% of kcal`} />
                <Stat label="Carbs" value={`${Math.round(report.dailyAverage.carbs)}g`} sub={`${report.macroSplit.carbs}% of kcal`} />
                <Stat label="Fat" value={`${Math.round(report.dailyAverage.fat)}g`} sub={`${report.macroSplit.fat}% of kcal`} />
              </div>
              <h3 className="small-head">Micronutrients (daily avg, % of daily value)</h3>
              {MICROS.map(([k, l]) => (
                <Meter key={k} label={l} percent={report.percentOfDailyValue![k]} />
              ))}
            </>
          ) : null}
          <ul className="insights">
            {report?.insights.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section className="card" aria-labelledby="habits-title">
          <h2 id="habits-title">Eating habits</h2>
          {habits && habits.mealsLogged > 0 ? (
            <div className="stats">
              <Stat label="Plan followed" value={`${habits.adherencePercent}%`} sub={`${habits.mealsLogged} meals logged`} />
              <Stat label="Actually eaten" value={habits.avgEatenCaloriesPerDay ?? "—"} sub="kcal/day" />
              <Stat label="Most skipped" value={habits.mostSkippedSlot ?? "none"} />
            </div>
          ) : (
            <p className="muted">Mark meals as eaten or skipped to estimate your real habits. Future plans adapt to them.</p>
          )}
          <MarketSearch />
        </section>
      </div>

      <PersonalCatalog />
    </div>
  );
}

function MarketSearch() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Array<{ id: string; name: string; price: number; servingSize: string; market: string; nutrients: N }> | null>(null);
  const [busy, setBusy] = useState(false);
  async function search() {
    setBusy(true);
    try {
      const r = await api<{ items: NonNullable<typeof items> }>(`/api/food/items?q=${encodeURIComponent(q)}`);
      setItems(r.items.slice(0, 8));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="market">
      <h3 className="small-head">Local market</h3>
      <form
        className="row gap"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label className="sr-only" htmlFor="market-q">
          Search market items
        </label>
        <input id="market-q" placeholder="Search items, e.g. salmon" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={busy}>
          {busy ? <Spinner /> : "Search"}
        </button>
      </form>
      {items && (
        <ul className="market-list">
          {items.map((i) => (
            <li key={i.id}>
              <span>{i.name}</span>
              <span className="muted small num">
                ${i.price.toFixed(2)}/{i.servingSize} · {Math.round(i.nutrients.calories)} kcal
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
