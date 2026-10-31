import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { listDoctors, listPatients } from "../auth/users.js";
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

/**
 * Gives each demo patient a slot within clinic hours: upcoming slots first (one hour
 * from now onward), then earlier ones today. After closing, it uses tomorrow.
 */
async function seedDemoAppointments() {
  const soon = Date.now() + 60 * 60_000;
  let day = new Date().toISOString().slice(0, 10);
  let slots = daySlots(day);
  if (!slots.some((s) => Date.parse(s) >= soon)) {
    day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    slots = daySlots(day);
  }
  const upcoming = slots.filter((s) => Date.parse(s) >= soon);
  const earlier = slots.filter((s) => Date.parse(s) < soon).reverse();
  const order = [...upcoming, ...earlier];
  const patients = listPatients();
  for (const [i, p] of patients.entries()) {
    if (await repo.nextForPatient(p.id)) continue;
    const at = order[i % order.length];
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

// ---------- Demo admin ----------
// Lets a demo viewer see every patient's time and move them around. Moves go through
// the same slot claims as patient reschedules, so the no-double-booking rule still holds.

function daySlots(day: string) {
  const slots: string[] = [];
  for (let h = OPEN_HOUR_UTC; h < CLOSE_HOUR_UTC; h++) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      slots.push(new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`).toISOString());
    }
  }
  return slots;
}

/** Every patient's appointment on `day`, each doctor's delay, and the slot grid. */
export async function demoSchedule(day: string) {
  const doctors = listDoctors();
  const doctorInfo = await Promise.all(
    doctors.map(async (d) => ({ id: d.id, name: d.name, delayMinutes: (await repo.getDelay(d.id, day)).minutes }))
  );
  const byPatient = new Map<string, Awaited<ReturnType<typeof describe>> & { doctorId: string }>();
  const taken: string[] = [];
  for (const d of doctors) {
    for (const { slotStart, appointmentId } of await repo.slotHolders(d.id, day)) {
      const appt = await repo.get(appointmentId);
      if (!appt || appt.status === "cancelled" || appt.scheduledAt !== slotStart) continue;
      taken.push(slotStart);
      byPatient.set(appt.patientId, { ...(await describe(appt)), doctorId: appt.doctorId });
    }
  }
  const patients = listPatients()
    .map((p) => ({ id: p.id, name: p.name, appointment: byPatient.get(p.id) ?? null }))
    .sort((a, b) => (a.appointment?.actualAppointment ?? "~").localeCompare(b.appointment?.actualAppointment ?? "~") || a.name.localeCompare(b.name));
  return {
    day,
    slotMinutes: SLOT_MIN,
    openUtc: `${day}T${String(OPEN_HOUR_UTC).padStart(2, "0")}:00:00.000Z`,
    closeUtc: `${day}T${String(CLOSE_HOUR_UTC).padStart(2, "0")}:00:00.000Z`,
    doctors: doctorInfo,
    slots: daySlots(day),
    taken,
    patients,
  };
}

/** Sets a patient's appointment time, creating an appointment if they don't have one that day. */
export async function demoSetTime(patientId: string, startIso: string) {
  const patient = listPatients().find((p) => p.id === patientId);
  if (!patient) throw new HttpError(404, "Patient not found");
  const start = slotFloor(new Date(startIso));
  if (Number.isNaN(start.getTime())) throw new HttpError(400, "Pick a valid time");
  const newStart = start.toISOString();
  const doctor = listDoctors()[0];
  if (!doctor) throw new HttpError(500, "No doctors configured");

  // The patient's appointment on that day, if any.
  const schedule = await demoSchedule(dayOf(newStart));
  const existingId = schedule.patients.find((p) => p.id === patientId)?.appointment?.id;
  const existing = existingId ? await repo.get(existingId) : undefined;

  if (existing) {
    if (existing.scheduledAt === newStart) return describe(existing);
    if (!(await repo.claimSlot(existing.doctorId, newStart, existing.id))) {
      throw new HttpError(409, "That time is already taken. Use Switch to trade times with that patient.");
    }
    const moved: Appointment = { ...existing, scheduledAt: newStart, updatedAt: new Date().toISOString(), version: existing.version + 1 };
    if (!(await repo.update(moved, existing.version))) {
      await repo.releaseSlot(existing.doctorId, newStart, existing.id);
      throw new HttpError(409, "That appointment just changed, try again");
    }
    await repo.releaseSlot(existing.doctorId, existing.scheduledAt, existing.id);
    return describe(moved);
  }

  const appt: Appointment = {
    id: randomUUID(),
    patientId,
    doctorId: doctor.id,
    doctorName: doctor.name,
    scheduledAt: newStart,
    durationMin: SLOT_MIN,
    status: "scheduled",
    updatedAt: new Date().toISOString(),
    version: 1,
  };
  if (!(await repo.claimSlot(doctor.id, newStart, appt.id))) {
    throw new HttpError(409, "That time is already taken. Use Switch to trade times with that patient.");
  }
  await repo.insert(appt);
  return describe(appt);
}

/** Switches two appointments' times. Each keeps its own doctor. */
export async function demoSwap(aId: string, bId: string) {
  if (aId === bId) throw new HttpError(400, "Pick two different patients");
  const [a, b] = await Promise.all([repo.get(aId), repo.get(bId)]);
  if (!a || !b) throw new HttpError(404, "Appointment not found");
  const aStart = a.scheduledAt;
  const bStart = b.scheduledAt;

  // Free both slots, then each appointment claims the other's time.
  await repo.releaseSlot(a.doctorId, aStart, a.id);
  await repo.releaseSlot(b.doctorId, bStart, b.id);
  const aOk = await repo.claimSlot(a.doctorId, bStart, a.id);
  const bOk = await repo.claimSlot(b.doctorId, aStart, b.id);
  if (!aOk || !bOk) {
    // Someone grabbed a slot in between: put everything back.
    if (aOk) await repo.releaseSlot(a.doctorId, bStart, a.id);
    if (bOk) await repo.releaseSlot(b.doctorId, aStart, b.id);
    await repo.claimSlot(a.doctorId, aStart, a.id);
    await repo.claimSlot(b.doctorId, bStart, b.id);
    throw new HttpError(409, "One of those times was just taken, try again");
  }
  const now = new Date().toISOString();
  await repo.update({ ...a, scheduledAt: bStart, updatedAt: now, version: a.version + 1 }, a.version);
  await repo.update({ ...b, scheduledAt: aStart, updatedAt: now, version: b.version + 1 }, b.version);
  return { a: await describe((await repo.get(a.id))!), b: await describe((await repo.get(b.id))!) };
}
