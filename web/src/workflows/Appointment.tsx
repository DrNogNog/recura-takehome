import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, fmtDateTime, fmtTime, timeAgo } from "../api";
import { ErrorNote, Spinner, Stat } from "../components";

interface Appointment {
  id: string;
  doctorName: string;
  status: string;
  checkedIn: boolean;
  checkedInAt?: string;
  actualAppointment: string;
  expectedAppointment: string;
  delayMinutes: number;
  lastUpdated: string;
}

interface Arrival {
  withinWindow: boolean;
  status: "too_early" | "early" | "on_time" | "late";
  minutesLate: number;
  minutesEarly: number;
  windowStart: string;
  windowEnd: string;
}

const STATUS_TEXT: Record<Arrival["status"], string> = {
  too_early: "Too early for the check-in window",
  early: "Early (within the window)",
  on_time: "On time",
  late: "Late (outside the grace period)",
};

const REFRESH_MS = 30_000;
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Loads the patient's next appointment and keeps it fresh. Patients tend to check
 * repeatedly; polling hits a 15s browser cache and ETag 304s on the server.
 */
function useMyAppointment(onReady: () => void) {
  const [appt, setAppt] = useState<Appointment | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ appointment: Appointment | null }>("/api/appointments/me");
      setAppt(r.appointment);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setAppt((a) => a ?? null);
    }
  }, []);

  useEffect(() => {
    load().finally(onReady);
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, onReady]);

  return { appt, setAppt, error, setError, load };
}

function NoAppointment({ title, error }: { title: string; error: string | null }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">You have no upcoming appointments.</p>
      <ErrorNote error={error} />
    </section>
  );
}

function Freshness({ appt, onRefresh }: { appt: Appointment; onRefresh: () => void }) {
  return (
    <span className="row gap muted small" aria-live="polite">
      Updated {timeAgo(appt.lastUpdated)}
      <button className="btn small ghost" onClick={onRefresh}>
        Refresh
      </button>
    </span>
  );
}

/** Workflow: actual appointment and expected appointment after delays. */
export function AppointmentWorkflow({ onReady }: { onReady: () => void }) {
  const { appt, error, load } = useMyAppointment(onReady);
  if (appt === undefined) return null;
  if (appt === null) return <NoAppointment title="My appointment" error={error} />;
  const delayed = appt.delayMinutes > 0;

  return (
    <section className="card" aria-labelledby="appt-title">
      <div className="card-head">
        <h2 id="appt-title">My appointment</h2>
        <Freshness appt={appt} onRefresh={load} />
      </div>
      <p className="muted">with {appt.doctorName}</p>
      <div className="stats">
        <Stat label="Booked for" value={fmtTime(appt.actualAppointment)} sub={fmtDateTime(appt.actualAppointment)} />
        <Stat
          label="Expected start"
          value={<span className={delayed ? "warn-text" : "ok-text"}>{fmtTime(appt.expectedAppointment)}</span>}
          sub={delayed ? `Running ${appt.delayMinutes} min behind` : "On schedule"}
        />
        <Stat label="Checked in" value={appt.checkedIn ? "Yes" : "No"} sub={appt.checkedIn ? `at ${fmtTime(appt.checkedInAt)}` : appt.status} />
      </div>
      <ErrorNote error={error} />
    </section>
  );
}

/** Workflow: check-in button and checked-in status. */
export function CheckInWorkflow({ onReady }: { onReady: () => void }) {
  const { appt, setAppt, error, setError, load } = useMyAppointment(onReady);
  const [busy, setBusy] = useState(false);
  const [arrival, setArrival] = useState<Arrival | null>(null);

  async function checkIn() {
    if (!appt) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ appointment: Appointment; arrival: Arrival | null }>(`/api/appointments/${appt.id}/check-in`, { method: "POST" });
      setAppt(r.appointment);
      setArrival(r.arrival);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (appt === undefined) return null;
  if (appt === null) return <NoAppointment title="Check in" error={error} />;

  return (
    <section className="card" aria-labelledby="checkin-title">
      <div className="card-head">
        <h2 id="checkin-title">Check in</h2>
        <Freshness appt={appt} onRefresh={load} />
      </div>
      <p className="muted">
        {fmtDateTime(appt.actualAppointment)} with {appt.doctorName}
      </p>
      <div className={`checkin ${appt.checkedIn ? "done" : ""}`} aria-live="polite">
        {appt.checkedIn ? (
          <>
            <span className="check-icon" aria-hidden="true">✓</span>
            <div>
              <strong>You're checked in</strong>
              <p className="muted small">at {fmtTime(appt.checkedInAt)}</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <strong>Not checked in yet</strong>
              <p className="muted small">Check-in opens 30 minutes before your appointment.</p>
            </div>
            <button className="btn primary" onClick={checkIn} disabled={busy}>
              {busy && <Spinner />} Check in
            </button>
          </>
        )}
      </div>
      {arrival && (
        <p className={`badge ${arrival.withinWindow ? "ok" : "warn"}`}>
          {STATUS_TEXT[arrival.status]}
          {arrival.minutesLate > 0 && `, ${arrival.minutesLate} min late`}
        </p>
      )}
      <ErrorNote error={error} />
    </section>
  );
}

/** Workflow: reschedule into an open slot (the server prevents double booking). */
export function RescheduleWorkflow({ onReady }: { onReady: () => void }) {
  const { appt, setAppt, error: loadError } = useMyAppointment(onReady);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const shownDay = day ?? appt?.actualAppointment.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const apptId = appt?.id;

  const loadSlots = useCallback(() => {
    if (!apptId) return;
    setSlots(null);
    api<{ slots: string[] }>(`/api/appointments/${apptId}/slots?day=${shownDay}`)
      .then((r) => setSlots(r.slots))
      .catch((e) => setError(e.message));
  }, [apptId, shownDay]);

  useEffect(() => {
    setPick("");
    loadSlots();
  }, [loadSlots]);

  async function confirm() {
    if (!appt) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ appointment: Appointment }>(`/api/appointments/${appt.id}/reschedule`, {
        method: "POST",
        json: { newStart: pick },
      });
      setAppt(r.appointment);
      setDone(true);
      loadSlots();
    } catch (e) {
      setError((e as Error).message);
      loadSlots(); // someone may have just taken the slot
    } finally {
      setSaving(false);
    }
  }

  if (appt === undefined) return null;
  if (appt === null) return <NoAppointment title="Reschedule appointment" error={loadError} />;
  const locked = appt.checkedIn || appt.status !== "scheduled";

  return (
    <section className="card" aria-labelledby="resched-title">
      <h2 id="resched-title">Reschedule appointment</h2>
      <p className="muted">
        Currently booked for <strong>{fmtDateTime(appt.actualAppointment)}</strong>
      </p>
      {done && <p className="badge ok">Moved to {fmtDateTime(appt.actualAppointment)}</p>}
      {locked ? (
        <p className="muted">You're already checked in, so this appointment can't be moved.</p>
      ) : (
        <>
          <label>
            Day
            <input type="date" value={shownDay} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDay(e.target.value)} />
          </label>
          <fieldset className="slots">
            <legend>Open times</legend>
            {!slots && <Spinner />}
            {slots?.length === 0 && <p className="muted small">No open times this day.</p>}
            {slots?.map((s) => (
              <label key={s} className={`slot ${pick === s ? "active" : ""}`}>
                <input type="radio" name="slot" value={s} checked={pick === s} onChange={() => setPick(s)} />
                {fmtTime(s)}
              </label>
            ))}
          </fieldset>
          <ErrorNote error={error} />
          <button className="btn primary" disabled={!pick || saving} onClick={confirm}>
            {saving && <Spinner />} Move to {pick ? fmtTime(pick) : "…"}
          </button>
        </>
      )}
    </section>
  );
}

/** Workflow: arrival-in-timeframe and minutes-late calculators. */
export function CalculatorWorkflow({ onReady }: { onReady: () => void }) {
  const [scheduled, setScheduled] = useState("");
  const [arrived, setArrived] = useState(toLocalInput(new Date().toISOString()));
  const [grace, setGrace] = useState(10);
  const [result, setResult] = useState<Arrival | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Prefill with the patient's own appointment when there is one.
    api<{ appointment: Appointment | null }>("/api/appointments/me")
      .then((r) => setScheduled(toLocalInput(r.appointment?.actualAppointment ?? new Date().toISOString())))
      .catch(() => setScheduled(toLocalInput(new Date().toISOString())))
      .finally(onReady);
  }, [onReady]);

  async function calc(e: FormEvent) {
    e.preventDefault();
    try {
      setResult(
        await api<Arrival>("/api/calculators/arrival", {
          method: "POST",
          json: { scheduledAt: new Date(scheduled).toISOString(), arrivedAt: new Date(arrived).toISOString(), graceMinutes: grace },
        })
      );
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="card" aria-labelledby="calc-title">
      <h2 id="calc-title">Arrival calculator</h2>
      <form onSubmit={calc} className="stack">
        <label>
          Appointment time
          <input type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} required />
        </label>
        <label>
          Arrival time
          <input type="datetime-local" value={arrived} onChange={(e) => setArrived(e.target.value)} required />
        </label>
        <label>
          Grace period (minutes)
          <input type="number" min={0} max={120} value={grace} onChange={(e) => setGrace(Number(e.target.value))} />
        </label>
        <button className="btn primary">Calculate</button>
      </form>
      <ErrorNote error={error} />
      {result && (
        <div className="stats" aria-live="polite">
          <Stat label="In timeframe?" value={result.withinWindow ? "Yes" : "No"} sub={STATUS_TEXT[result.status]} />
          <Stat
            label="Late by"
            value={`${result.minutesLate} min`}
            sub={result.minutesEarly ? `${result.minutesEarly} min early` : `Window ${fmtTime(result.windowStart)}–${fmtTime(result.windowEnd)}`}
          />
        </div>
      )}
    </section>
  );
}
