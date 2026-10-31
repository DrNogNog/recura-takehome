const MINUTE = 60_000;

export type ArrivalStatus = "too_early" | "early" | "on_time" | "late";

export interface ArrivalResult {
  withinWindow: boolean;
  status: ArrivalStatus;
  minutesLate: number;
  minutesEarly: number;
  windowStart: string;
  windowEnd: string;
}

/** Whole minutes a patient arrived after the scheduled time; 0 if on time or early. */
export function minutesLate(scheduledAt: Date, arrivedAt: Date): number {
  return Math.max(0, Math.floor((arrivedAt.getTime() - scheduledAt.getTime()) / MINUTE));
}

/**
 * Whether the patient arrived inside the accepted window:
 * from `earlyMinutes` before the appointment to `graceMinutes` after it.
 */
export function checkArrivalWindow(
  scheduledAt: Date,
  arrivedAt: Date,
  earlyMinutes = 30,
  graceMinutes = 10
): ArrivalResult {
  const windowStart = new Date(scheduledAt.getTime() - earlyMinutes * MINUTE);
  const windowEnd = new Date(scheduledAt.getTime() + graceMinutes * MINUTE);
  const diffMin = (arrivedAt.getTime() - scheduledAt.getTime()) / MINUTE;

  let status: ArrivalStatus;
  if (arrivedAt < windowStart) status = "too_early";
  else if (diffMin < 0) status = "early";
  else if (arrivedAt <= windowEnd) status = "on_time";
  else status = "late";

  return {
    withinWindow: status === "early" || status === "on_time",
    status,
    minutesLate: minutesLate(scheduledAt, arrivedAt),
    minutesEarly: Math.max(0, Math.floor(-diffMin)),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  };
}

/** Appointment time once the doctor's running delay is applied. */
export function expectedStart(scheduledAt: Date, delayMinutes: number): Date {
  return new Date(scheduledAt.getTime() + Math.max(0, delayMinutes) * MINUTE);
}
