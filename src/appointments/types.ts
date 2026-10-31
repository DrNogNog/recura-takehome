export type AppointmentStatus = "scheduled" | "checked_in" | "completed" | "cancelled";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  scheduledAt: string; // ISO, UTC
  durationMin: number;
  status: AppointmentStatus;
  checkedInAt?: string;
  updatedAt: string;
  version: number; // optimistic concurrency guard
}

export interface AppointmentRepo {
  get(id: string): Promise<Appointment | undefined>;
  nextForPatient(patientId: string): Promise<Appointment | undefined>;
  /** Saves only if the stored version still equals `expectedVersion`. */
  update(appt: Appointment, expectedVersion: number): Promise<boolean>;
  insert(appt: Appointment): Promise<void>;
  /** Atomically claims a doctor's time slot. Returns false if someone else holds it. */
  claimSlot(doctorId: string, slotStart: string, appointmentId: string): Promise<boolean>;
  releaseSlot(doctorId: string, slotStart: string, appointmentId: string): Promise<void>;
  takenSlots(doctorId: string, day: string): Promise<string[]>;
  getDelay(doctorId: string, day: string): Promise<{ minutes: number; updatedAt?: string }>;
  setDelay(doctorId: string, day: string, minutes: number): Promise<void>;
}

export const dayOf = (iso: string) => iso.slice(0, 10);
