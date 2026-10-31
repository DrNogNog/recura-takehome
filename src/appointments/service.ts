import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { listPatients } from "../auth/users.js";
import { checkArrivalWindow, expectedStart } from "./calculators.js";
import { CassandraAppointmentRepo } from "./cassandraRepo.js";
import { MemoryAppointmentRepo } from "./memoryRepo.js";
import { dayOf, type Appointment, type AppointmentRepo } from "./types.js";

const SLOT_MIN = 30;
const OPEN_HOUR_UTC = 13; // 9am US Eastern
const CLOSE_HOUR_UTC = 22;

let repo: AppointmentRepo;

export async function initAppointments() {
  repo =
    config.appointmentsStore === "external"
      ? await CassandraAppointmentRepo.connect()
      : new MemoryAppointmentRepo();
  await seedDemoAppointments();
}

/** Rounds to the slot boundary so every booking lands on the same slot grid. */
function slotFloor(d: Date): Date {
  const ms = SLOT_MIN * 60_000;
  return new Date(Math.floor(d.getTime() / ms) * ms);
}

async function seedDemoAppointments() {
  const base = slotFloor(new Date(Date.now() + 60 * 60_000));
  const patients = listPatients();
  for (const [i, p] of patients.entries()) {
    if (await repo.nextForPatient(p.id)) continue;
    const at = new Date(base.getTime() + i * SLOT_MIN * 60_000).toISOString();
    const appt: Appointment = {
      id: randomUUID(),
      patientId: p.id,
      doctorId: "d1",
      doctorName: "Dr. Morgan Lee",
      scheduledAt: at,
      durationMin: SLOT_MIN,
      status: "scheduled",
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    if (await repo.claimSlot(appt.doctorId, at, appt.id)) await repo.insert(appt);
  }
}

async function loadOwned(id: string, patientId: string): Promise<Appointment> {
  const appt = await repo.get(id);
  if (!appt || appt.patientId !== patientId) throw new HttpError(404, "Appointment not found");
  return appt;
}

/** Appointment as the patient sees it: actual time, expected time after delays, and freshness. */
export async function describe(appt: Appointment) {
  const delay = await repo.getDelay(appt.doctorId, dayOf(appt.scheduledAt));
  const expected = expectedStart(new Date(appt.scheduledAt), delay.minutes);
  const lastUpdated = [appt.updatedAt, delay.updatedAt].filter(Boolean).sort().at(-1)!;
  return {
    id: appt.id,
    doctorName: appt.doctorName,
    status: appt.status,
    checkedIn: appt.status === "checked_in",
    checkedInAt: appt.checkedInAt,
    actualAppointment: appt.scheduledAt,
    expectedAppointment: expected.toISOString(),
    delayMinutes: delay.minutes,
    durationMin: appt.durationMin,
    lastUpdated,
  };
}

export async function myNextAppointment(patientId: string) {
  const appt = await repo.nextForPatient(patientId);
  return appt ? describe(appt) : null;
}

export async function getForPatient(id: string, patientId: string) {
  return describe(await loadOwned(id, patientId));
}

export async function checkIn(id: string, patientId: string) {
  const appt = await loadOwned(id, patientId);
  if (appt.status === "checked_in") {
    return { alreadyCheckedIn: true, appointment: await describe(appt), arrival: null };
  }
  if (appt.status !== "scheduled") throw new HttpError(409, `Can't check in a ${appt.status} appointment`);

  const now = new Date();
  const arrival = checkArrivalWindow(new Date(appt.scheduledAt), now);
  if (arrival.status === "too_early") {
    throw new HttpError(409, "Check-in opens 30 minutes before your appointment");
  }
  const updated: Appointment = {
    ...appt,
    status: "checked_in",
    checkedInAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: appt.version + 1,
  };
  if (!(await repo.update(updated, appt.version))) {
    throw new HttpError(409, "Appointment changed while checking in, try again");
  }
  return { alreadyCheckedIn: false, appointment: await describe(updated), arrival };
}

export async function availableSlots(id: string, patientId: string, day: string) {
  const appt = await loadOwned(id, patientId);
  const taken = new Set(await repo.takenSlots(appt.doctorId, day));
  const slots: string[] = [];
  const now = Date.now();
  for (let h = OPEN_HOUR_UTC; h < CLOSE_HOUR_UTC; h++) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      const iso = new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`).toISOString();
      if (new Date(iso).getTime() > now && !taken.has(iso)) slots.push(iso);
    }
  }
  return slots;
}

/**
 * Claims the new slot first (atomic, so two patients can never both win it),
 * then moves the appointment, then releases the old slot.
 */
export async function reschedule(id: string, patientId: string, newStartIso: string) {
  const appt = await loadOwned(id, patientId);
  if (appt.status !== "scheduled") throw new HttpError(409, `Can't reschedule a ${appt.status} appointment`);
  const start = slotFloor(new Date(newStartIso));
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    throw new HttpError(400, "Pick a time in the future");
  }
  const newStart = start.toISOString();
  if (newStart === appt.scheduledAt) return describe(appt);

  if (!(await repo.claimSlot(appt.doctorId, newStart, appt.id))) {
    throw new HttpError(409, "That time was just booked by someone else, pick another");
  }
  const updated: Appointment = {
    ...appt,
    scheduledAt: newStart,
    updatedAt: new Date().toISOString(),
    version: appt.version + 1,
  };
  if (!(await repo.update(updated, appt.version))) {
    await repo.releaseSlot(appt.doctorId, newStart, appt.id);
    throw new HttpError(409, "Appointment changed while rescheduling, try again");
  }
  await repo.releaseSlot(appt.doctorId, appt.scheduledAt, appt.id);
  return describe(updated);
}

export async function setDoctorDelay(doctorId: string, day: string, minutes: number) {
  await repo.setDelay(doctorId, day, Math.max(0, Math.round(minutes)));
  return repo.getDelay(doctorId, day);
}
