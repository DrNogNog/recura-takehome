/** A time as the clinic reads it (US Eastern), e.g. "Tue 2:30 PM", for messages and notifications. */
export const clinicTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" });
