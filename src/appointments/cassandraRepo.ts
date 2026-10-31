import cassandra from "cassandra-driver";
import { config } from "../config.js";
import { dayOf, type Appointment, type AppointmentRepo } from "./types.js";

/**
 * Cassandra store, partitioned for the read paths patients hit most:
 * - appointments_by_id:      lookups and status polls
 * - appointments_by_patient: "my next appointment"
 * - doctor_slots:            one row per (doctor, day, slot); INSERT ... IF NOT EXISTS
 *                            (a lightweight transaction) is what prevents double booking
 *                            across every API instance behind the load balancer.
 * Writes use LOCAL_QUORUM so reads at LOCAL_QUORUM always see them.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS appointments_by_id (
     id text PRIMARY KEY, patient_id text, doctor_id text, doctor_name text,
     scheduled_at timestamp, duration_min int, status text, checked_in_at timestamp,
     updated_at timestamp, version int)`,
  `CREATE TABLE IF NOT EXISTS appointments_by_patient (
     patient_id text, scheduled_at timestamp, id text,
     PRIMARY KEY ((patient_id), scheduled_at, id)) WITH CLUSTERING ORDER BY (scheduled_at ASC, id ASC)`,
  `CREATE TABLE IF NOT EXISTS doctor_slots (
     doctor_id text, day text, slot_start timestamp, appointment_id text,
     PRIMARY KEY ((doctor_id, day), slot_start))`,
  `CREATE TABLE IF NOT EXISTS doctor_delays (
     doctor_id text, day text, delay_min int, updated_at timestamp,
     PRIMARY KEY ((doctor_id, day)))`,
];

const opts = { prepare: true, consistency: cassandra.types.consistencies.localQuorum };

export class CassandraAppointmentRepo implements AppointmentRepo {
  private client: cassandra.Client;

  private constructor(client: cassandra.Client) {
    this.client = client;
  }

  static async connect(): Promise<CassandraAppointmentRepo> {
    const { contactPoints, localDataCenter, keyspace } = config.cassandra;
    const boot = new cassandra.Client({ contactPoints, localDataCenter });
    await boot.connect();
    await boot.execute(
      `CREATE KEYSPACE IF NOT EXISTS ${keyspace} WITH replication = {'class':'SimpleStrategy','replication_factor':1}`
    );
    await boot.shutdown();
    const client = new cassandra.Client({ contactPoints, localDataCenter, keyspace });
    await client.connect();
    for (const stmt of SCHEMA) await client.execute(stmt);
    return new CassandraAppointmentRepo(client);
  }

  private toAppt(row: cassandra.types.Row): Appointment {
    return {
      id: row.id,
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      doctorName: row.doctor_name,
      scheduledAt: row.scheduled_at.toISOString(),
      durationMin: row.duration_min,
      status: row.status,
      checkedInAt: row.checked_in_at?.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      version: row.version,
    };
  }

  async get(id: string) {
    const r = await this.client.execute("SELECT * FROM appointments_by_id WHERE id = ?", [id], opts);
    return r.first() ? this.toAppt(r.first()) : undefined;
  }

  async nextForPatient(patientId: string) {
    const since = new Date(Date.now() - 2 * 60 * 60_000);
    const r = await this.client.execute(
      "SELECT id FROM appointments_by_patient WHERE patient_id = ? AND scheduled_at > ?",
      [patientId, since],
      opts
    );
    for (const row of r.rows) {
      const appt = await this.get(row.id);
      if (appt && appt.status !== "cancelled") return appt;
    }
    return undefined;
  }

  async update(appt: Appointment, expectedVersion: number) {
    const before = await this.get(appt.id);
    const r = await this.client.execute(
      `UPDATE appointments_by_id SET scheduled_at = ?, status = ?, checked_in_at = ?, updated_at = ?, version = ?
       WHERE id = ? IF version = ?`,
      [
        new Date(appt.scheduledAt),
        appt.status,
        appt.checkedInAt ? new Date(appt.checkedInAt) : null,
        new Date(appt.updatedAt),
        appt.version,
        appt.id,
        expectedVersion,
      ],
      opts
    );
    const applied = r.first()?.["[applied]"] === true;
    if (applied && before && before.scheduledAt !== appt.scheduledAt) {
      await this.client.batch(
        [
          {
            query: "DELETE FROM appointments_by_patient WHERE patient_id = ? AND scheduled_at = ? AND id = ?",
            params: [appt.patientId, new Date(before.scheduledAt), appt.id],
          },
          {
            query: "INSERT INTO appointments_by_patient (patient_id, scheduled_at, id) VALUES (?, ?, ?)",
            params: [appt.patientId, new Date(appt.scheduledAt), appt.id],
          },
        ],
        opts
      );
    }
    return applied;
  }

  async insert(a: Appointment) {
    await this.client.batch(
      [
        {
          query: `INSERT INTO appointments_by_id (id, patient_id, doctor_id, doctor_name, scheduled_at, duration_min,
                  status, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [a.id, a.patientId, a.doctorId, a.doctorName, new Date(a.scheduledAt), a.durationMin, a.status, new Date(a.updatedAt), a.version],
        },
        {
          query: "INSERT INTO appointments_by_patient (patient_id, scheduled_at, id) VALUES (?, ?, ?)",
          params: [a.patientId, new Date(a.scheduledAt), a.id],
        },
      ],
      opts
    );
  }

  async claimSlot(doctorId: string, slotStart: string, appointmentId: string) {
    const r = await this.client.execute(
      "INSERT INTO doctor_slots (doctor_id, day, slot_start, appointment_id) VALUES (?, ?, ?, ?) IF NOT EXISTS",
      [doctorId, dayOf(slotStart), new Date(slotStart), appointmentId],
      opts
    );
    const row = r.first();
    return row["[applied]"] === true || row.appointment_id === appointmentId;
  }

  async releaseSlot(doctorId: string, slotStart: string, appointmentId: string) {
    await this.client.execute(
      "DELETE FROM doctor_slots WHERE doctor_id = ? AND day = ? AND slot_start = ? IF appointment_id = ?",
      [doctorId, dayOf(slotStart), new Date(slotStart), appointmentId],
      opts
    );
  }

  async takenSlots(doctorId: string, day: string) {
    const r = await this.client.execute(
      "SELECT slot_start FROM doctor_slots WHERE doctor_id = ? AND day = ?",
      [doctorId, day],
      opts
    );
    return r.rows.map((row) => row.slot_start.toISOString());
  }

  async slotHolders(doctorId: string, day: string) {
    const r = await this.client.execute(
      "SELECT slot_start, appointment_id FROM doctor_slots WHERE doctor_id = ? AND day = ?",
      [doctorId, day],
      opts
    );
    return r.rows.map((row) => ({ slotStart: row.slot_start.toISOString(), appointmentId: row.appointment_id }));
  }

  async getDelay(doctorId: string, day: string) {
    const r = await this.client.execute(
      "SELECT delay_min, updated_at FROM doctor_delays WHERE doctor_id = ? AND day = ?",
      [doctorId, day],
      opts
    );
    const row = r.first();
    return row ? { minutes: row.delay_min, updatedAt: row.updated_at.toISOString() } : { minutes: 0 };
  }

  async setDelay(doctorId: string, day: string, minutes: number) {
    await this.client.execute(
      "INSERT INTO doctor_delays (doctor_id, day, delay_min, updated_at) VALUES (?, ?, ?, ?)",
      [doctorId, day, minutes, new Date()],
      opts
    );
  }
}
