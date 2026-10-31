import { dayOf, type Appointment, type AppointmentRepo } from "./types.js";

/**
 * Single-process store. Slot claims are safe here because the check and the set
 * happen in one synchronous step; across several API instances use Cassandra.
 */
export class MemoryAppointmentRepo implements AppointmentRepo {
  private appts = new Map<string, Appointment>();
  private slots = new Map<string, string>(); // `${doctorId}|${slotStart}` -> appointmentId
  private delays = new Map<string, { minutes: number; updatedAt: string }>();

  async get(id: string) {
    const a = this.appts.get(id);
    return a && { ...a };
  }

  async nextForPatient(patientId: string) {
    const cutoff = Date.now() - 2 * 60 * 60_000;
    return [...this.appts.values()]
      .filter((a) => a.patientId === patientId && a.status !== "cancelled")
      .filter((a) => new Date(a.scheduledAt).getTime() > cutoff)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .map((a) => ({ ...a }))[0];
  }

  async update(appt: Appointment, expectedVersion: number) {
    const current = this.appts.get(appt.id);
    if (!current || current.version !== expectedVersion) return false;
    this.appts.set(appt.id, { ...appt });
    return true;
  }

  async insert(appt: Appointment) {
    this.appts.set(appt.id, { ...appt });
  }

  async claimSlot(doctorId: string, slotStart: string, appointmentId: string) {
    const key = `${doctorId}|${slotStart}`;
    const holder = this.slots.get(key);
    if (holder && holder !== appointmentId) return false;
    this.slots.set(key, appointmentId);
    return true;
  }

  async releaseSlot(doctorId: string, slotStart: string, appointmentId: string) {
    const key = `${doctorId}|${slotStart}`;
    if (this.slots.get(key) === appointmentId) this.slots.delete(key);
  }

  async takenSlots(doctorId: string, day: string) {
    return [...this.slots.keys()]
      .map((k) => k.split("|"))
      .filter(([d, start]) => d === doctorId && dayOf(start) === day)
      .map(([, start]) => start);
  }

  async getDelay(doctorId: string, day: string) {
    return this.delays.get(`${doctorId}|${day}`) ?? { minutes: 0 };
  }

  async setDelay(doctorId: string, day: string, minutes: number) {
    this.delays.set(`${doctorId}|${day}`, { minutes, updatedAt: new Date().toISOString() });
  }
}
