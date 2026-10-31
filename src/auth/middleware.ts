import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { Role } from "./users.js";

export type PortalName = "patient" | "staff";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  portal: PortalName; // which set of workflows the account opens (patient, or clinic staff)
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "8h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  try {
    const { id, name, role, portal } = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { id, name, role, portal };
    next();
  } catch {
    res.status(401).json({ error: "Session expired, sign in again" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Not allowed for your role" });
    }
    next();
  };
}

export const STAFF_ROLES: Role[] = ["doctor", "manager", "boss"];
