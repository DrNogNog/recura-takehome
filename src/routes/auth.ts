import { Router } from "express";
import bcrypt from "bcryptjs";
import { createUser, findUserByUsername, SIGNUP_ROLES } from "../auth/users.js";
import { requireAuth, signToken, STAFF_ROLES } from "../auth/middleware.js";

export const authRouter = Router();

/**
 * One login for the Access Portal. The account decides what it opens:
 * patients get the appointment workflows, doctors/managers/bosses get supplies and food.
 */
authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const user = findUserByUsername(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const portal = STAFF_ROLES.includes(user.role) ? "staff" : "patient";
  const profile = { id: user.id, name: user.name, role: user.role, portal } as const;
  res.json({ token: signToken(profile), user: profile });
});

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

/** Sign Up: create a patient or manager account, then sign straight in. */
authRouter.post("/signup", async (req, res) => {
  const { name, username, password, role } = req.body ?? {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
    return res.status(400).json({ error: "Enter your full name (up to 60 characters)" });
  }
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Username must be 3–32 letters, numbers, dots, dashes, or underscores" });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!SIGNUP_ROLES.includes(role)) {
    return res.status(400).json({ error: "Choose a Patient or Manager account" });
  }
  if (findUserByUsername(username)) {
    return res.status(409).json({ error: "That username is taken" });
  }
  const user = await createUser({ name: name.trim(), username, password, role });
  const portal = STAFF_ROLES.includes(user.role) ? "staff" : "patient";
  const profile = { id: user.id, name: user.name, role: user.role, portal } as const;
  res.status(201).json({ token: signToken(profile), user: profile });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});
