import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type Role = "patient" | "doctor" | "manager" | "boss";

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  passwordHash: string;
}

interface SeedUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  password: string;
}

// Demo accounts live in seed/users.json so they stay out of the code.
const seed: SeedUser[] = JSON.parse(readFileSync("seed/users.json", "utf8"));

// Accounts created through Sign Up are kept in data/users.json (hashes only, not in git).
const SIGNUPS_FILE = "data/users.json";
const signups: User[] = existsSync(SIGNUPS_FILE) ? JSON.parse(readFileSync(SIGNUPS_FILE, "utf8")) : [];

const users: User[] = [
  ...seed.map(({ password, ...u }) => ({ ...u, passwordHash: bcrypt.hashSync(password, 10) })),
  ...signups,
];

export function findUserByUsername(username: string): User | undefined {
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

export function findUserById(id: string): User | undefined {
  return users.find((u) => u.id === id);
}

export function listPatients(): User[] {
  return users.filter((u) => u.role === "patient");
}

export function listDoctors(): User[] {
  return users.filter((u) => u.role === "doctor");
}

/** Account types anyone can pick on the Sign Up page. */
export const SIGNUP_ROLES = ["patient", "manager"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export async function createUser(input: { name: string; username: string; password: string; role: SignupRole }): Promise<User> {
  const user: User = {
    id: `u-${randomUUID()}`,
    username: input.username,
    name: input.name,
    role: input.role,
    passwordHash: await bcrypt.hash(input.password, 10),
  };
  users.push(user);
  signups.push(user);
  mkdirSync("data", { recursive: true });
  writeFileSync(SIGNUPS_FILE, JSON.stringify(signups, null, 2));
  return user;
}
