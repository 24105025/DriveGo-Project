import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { query, type Role } from "./db";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "drivego_session";
const SESSION_DAYS = 14;

export type AppUser = {
  id: string;
  email: string;
  user_metadata: { display_name: string | null };
};

type AuthRow = RowDataPacket & {
  id: string;
  email: string;
  displayName: string | null;
  role: Role;
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, keyHex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO sessions (tokenHash, userId, expiresAt) VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL ? DAY))",
    [hashToken(token), userId, SESSION_DAYS]
  );
  return token;
}

export async function getCurrentUser(): Promise<AuthRow | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await query<AuthRow[]>(
    `SELECT p.id, p.email, p.displayName, p.role
     FROM sessions s
     JOIN profiles p ON p.id = s.userId
     WHERE s.tokenHash = ? AND s.expiresAt > NOW(3)
     LIMIT 1`,
    [hashToken(token)]
  );

  const profile = rows[0];
  if (!profile) return null;
  return {
    ...profile,
    user_metadata: { display_name: profile.displayName },
  };
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  const rows = await query<(RowDataPacket & { role: Role })[]>(
    "SELECT role FROM profiles WHERE id = ? LIMIT 1",
    [user.id]
  );
  const profile = rows[0];
  if (!profile || profile.role !== "ADMIN") redirect("/");
  return { user, profile };
}

export async function requireOrganizer() {
  const user = await requireAuth();
  const rows = await query<(RowDataPacket & { role: Role })[]>(
    "SELECT role FROM profiles WHERE id = ? LIMIT 1",
    [user.id]
  );
  const profile = rows[0];
  if (!profile || (profile.role !== "ORGANIZER" && profile.role !== "ADMIN")) redirect("/");
  return { user, profile };
}

export const authCookieName = SESSION_COOKIE;
