import { useCallback, useState } from "react";
import { api, fmtTime } from "../api";
import { ErrorNote, MenuSelect, Spinner, StatusMessage } from "../components";
import { useAction, usePolling } from "../hooks";

interface Appt {
  id: string;
  doctorId: string;
  doctorName: string;
  status: string;
  checkedIn: boolean;
  checkedInAt?: string;
  actualAppointment: string;
  expectedAppointment: string;
  delayMinutes: number;
  durationMin: number;
  lastUpdated: string;
}
interface Schedule {
  day: string;
  slotMinutes: number;
  openUtc: string;
  closeUtc: string;
  doctors: Array<{ id: string; name: string; delayMinutes: number }>;
  slots: string[];
  taken: string[];
  patients: Array<{ id: string; name: string; appointment: Appt | null }>;
}

const REFRESH_MS = 15_000;
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Demo admin: see every patient's time on a Gantt chart, and set or switch their times. */
export function DemoAdminWorkflow({ onReady }: { onReady: () => void }) {
  const [day, setDay] = useState(localDay);
  const [data, setData] = useState<Schedule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [delayDraft, setDelayDraft] = useState<Record<string, number>>({});
  const { busy, error, notice, run } = useAction();

  const load = useCallback(async () => {
    try {
      const s = await api<Schedule>(`/api/demo/schedule?day=${day}`);
      setData(s);
      setDelayDraft(Object.fromEntries(s.doctors.map((d) => [d.id, d.delayMinutes])));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [day]);

  const reload = usePolling(load, onReady, REFRESH_MS);

  async function act(key: string, fn: () => Promise<unknown>, done: string) {
    if ((await run(key, fn, done)) !== undefined) await reload();
  }

  const setTime = (patientId: string, name: string, start: string) =>
    act(`time-${patientId}`, () => api(`/api/demo/patients/${patientId}/time`, { method: "POST", json: { start } }), `${name} moved to ${fmtTime(start)}.`);

  const swap = (a: { id: string; name: string }, bApptId: string, bName: string) =>
    act(`swap-${a.id}`, () => api("/api/demo/swap", { method: "POST", json: { a: a.id, b: bApptId } }), `Switched times: ${a.name} ⇄ ${bName}.`);

  const applyDelay = (doctorId: string, name: string) => {
    const minutes = Math.round(delayDraft[doctorId] ?? 0);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 240) return run(`delay-${doctorId}`, () => Promise.reject(new Error("Delay must be between 0 and 240 minutes")));
    return act(`delay-${doctorId}`, () => api("/api/demo/delay", { method: "POST", json: { doctorId, day, minutes } }), `${name} is now running ${minutes} min behind.`);
  };

  if (!data) return <ErrorNote error={loadError} />;

  const holderBySlot = new Map(data.patients.filter((p) => p.appointment).map((p) => [p.appointment!.actualAppointment, p.name]));
  const booked = data.patients.filter((p) => p.appointment);

  return (
    <div className="stack-lg">
      <section className="card admin-controls" aria-label="Day and delay">
        <label className="admin-day">
          Day
          <span className="row gap">
            <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
            {day !== localDay() && (
              <button className="btn small" onClick={() => setDay(localDay())}>
                Today
              </button>
            )}
          </span>
        </label>
        {data.doctors.map((d) => (
          <div key={d.id} className="admin-delay">
            <label htmlFor={`delay-${d.id}`}>{d.name} is running behind by</label>
            <span className="row gap">
              <input
                id={`delay-${d.id}`}
                type="number"
                min={0}
                max={240}
                step={5}
                value={delayDraft[d.id] ?? 0}
                onChange={(e) => setDelayDraft({ ...delayDraft, [d.id]: Math.max(0, Number(e.target.value)) })}
              />
              <span className="muted">min</span>
              <button className="btn primary small" disabled={busy !== null} onClick={() => applyDelay(d.id, d.name)}>
                {busy === `delay-${d.id}` && <Spinner />} Apply
              </button>
            </span>
          </div>
        ))}
        <p className="muted small admin-note">Demo tools: changes here update every patient's own screens right away.</p>
      </section>

      <StatusMessage notice={notice} error={error ?? loadError} />

      <Gantt data={data} />

      <section className="card" aria-labelledby="admin-patients">
        <div className="card-head">
          <h2 id="admin-patients">Patients</h2>
          <span className="muted small">
            {booked.length} of {data.patients.length} booked on this day
          </span>
        </div>
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Patient</th>
                <th scope="col">Booked</th>
                <th scope="col">Expected</th>
                <th scope="col">Status</th>
                <th scope="col">Set time</th>
                <th scope="col">Switch with</th>
              </tr>
            </thead>
            <tbody>
              {data.patients.map((p) => {
                const a = p.appointment;
                const timeOptions = data.slots.map((s) => {
                  const holder = holderBySlot.get(s);
                  const mine = a?.actualAppointment === s;
                  return { id: s, label: fmtTime(s), description: holder && !mine ? `Taken by ${holder}` : undefined, disabled: Boolean(holder) && !mine };
                });
                const swapOptions = booked
                  .filter((o) => o.id !== p.id)
                  .map((o) => ({ id: o.appointment!.id, label: o.name, description: fmtTime(o.appointment!.actualAppointment) }));
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                    </td>
                    <td className="num">{a ? fmtTime(a.actualAppointment) : <span className="muted">No appointment</span>}</td>
                    <td className="num">
                      {a ? (
                        <span className={a.delayMinutes ? "warn-text" : ""}>
                          {fmtTime(a.expectedAppointment)}
                          {a.delayMinutes ? ` (+${a.delayMinutes})` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{a ? <span className={`badge ${a.checkedIn ? "ok" : ""}`}>{a.checkedIn ? `Checked in ${fmtTime(a.checkedInAt)}` : a.status}</span> : "—"}</td>
                    <td>
                      <MenuSelect
                        size="sm"
                        ariaLabel={`Set time for ${p.name}`}
                        placeholder={busy === `time-${p.id}` ? "Saving…" : "Pick a time"}
                        value={a?.actualAppointment ?? ""}
                        options={timeOptions}
                        onChange={(start) => start !== a?.actualAppointment && setTime(p.id, p.name, start)}
                      />
                    </td>
                    <td>
                      {a && swapOptions.length ? (
                        <MenuSelect
                          size="sm"
                          ariaLabel={`Switch ${p.name}'s time with another patient`}
                          placeholder={busy === `swap-${a.id}` ? "Switching…" : "Switch with…"}
                          value=""
                          options={swapOptions}
                          onChange={(bId) => swap({ id: a.id, name: p.name }, bId, booked.find((o) => o.appointment!.id === bId)!.name)}
                        />
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Timeline of the clinic day: one row per patient, booked bar plus expected-after-delay bar. */
function Gantt({ data }: { data: Schedule }) {
  const open = Date.parse(data.openUtc);
  const close = Date.parse(data.closeUtc);
  const span = close - open;
  const pct = (t: number) => `${Math.min(100, Math.max(0, ((t - open) / span) * 100))}%`;
  const width = (ms: number) => `${(ms / span) * 100}%`;
  const hours: number[] = [];
  for (let t = open; t <= close; t += 3_600_000) hours.push(t);
  const now = Date.now();
  const showNow = now >= open && now <= close;

  return (
    <section className="card" aria-labelledby="gantt-title">
      <div className="card-head">
        <h2 id="gantt-title">All patient times</h2>
        <span className="gantt-legend small">
          <span className="lg booked" /> Booked
          <span className="lg expected" /> Expected after delay
          <span className="lg checked" /> Checked in
          {showNow && (
            <>
              <span className="lg now" /> Now
            </>
          )}
        </span>
      </div>

      <div className="gantt" role="table" aria-label="Patient schedule">
        <div className="gantt-row gantt-axis" role="row">
          <span className="gantt-name" role="columnheader">
            Patient
          </span>
          <div className="gantt-track" role="columnheader" aria-label="Time of day">
            {hours.map((t) => (
              <span key={t} className="gantt-hour" style={{ left: pct(t) }}>
                {new Date(t).toLocaleTimeString([], { hour: "numeric" })}
              </span>
            ))}
          </div>
        </div>

        {data.patients.map((p) => {
          const a = p.appointment;
          const start = a ? Date.parse(a.actualAppointment) : 0;
          const exp = a ? Date.parse(a.expectedAppointment) : 0;
          const dur = (a?.durationMin ?? data.slotMinutes) * 60_000;
          return (
            <div key={p.id} className="gantt-row" role="row">
              <span className="gantt-name" role="rowheader">
                {p.name}
              </span>
              <div className="gantt-track" role="cell">
                {hours.map((t) => (
                  <span key={t} className="gantt-grid" style={{ left: pct(t) }} />
                ))}
                {showNow && <span className="gantt-now" style={{ left: pct(now) }} aria-hidden="true" />}
                {a ? (
                  <>
                    {a.delayMinutes > 0 && (
                      <span
                        className="gantt-bar expected"
                        style={{ left: pct(exp), width: width(dur) }}
                        title={`${p.name} expected ${fmtTime(a.expectedAppointment)} (${a.delayMinutes} min late)`}
                      />
                    )}
                    <span
                      className={`gantt-bar booked ${a.checkedIn ? "checked" : ""}`}
                      style={{ left: pct(start), width: width(dur) }}
                      title={`${p.name}: booked ${fmtTime(a.actualAppointment)}${a.checkedIn ? ", checked in" : ""}`}
                    >
                      <span className="gantt-label">{fmtTime(a.actualAppointment)}</span>
                    </span>
                  </>
                ) : (
                  <span className="gantt-empty">No appointment this day</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
