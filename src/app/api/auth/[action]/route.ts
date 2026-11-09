import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import {
  authCookieName,
  createSession,
  getCurrentUser,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/auth";
import { execute, newId, query, transaction } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

type RouteParams = { params: Promise<{ action: string }> };
type AccountRow = RowDataPacket & {
  id: string;
  email: string;
  passwordHash: string;
};
type ResetRecipient = RowDataPacket & { id: string; email: string };

const credentialsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(10).max(128),
});

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(authCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function GET() {
  return NextResponse.json({ user: await getCurrentUser() });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { action } = await params;
  const body: unknown = await request.json().catch(() => null);

  if (action === "logout") {
    const token = request.cookies.get(authCookieName)?.value;
    if (token) {
      await execute("DELETE FROM sessions WHERE tokenHash = ?", [hashToken(token)]);
    }
    const response = NextResponse.json({ success: true });
    response.cookies.delete(authCookieName);
    return response;
  }

  if (action === "signup" || action === "login") {
    const parsed = credentialsSchema.extend({
      displayName: z.string().trim().min(1).max(80).optional(),
    }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.trim().toLowerCase();
    if (action === "signup") {
      if (!parsed.data.displayName) {
        return NextResponse.json({ error: "Display name is required" }, { status: 400 });
      }
      const id = newId();
      const passwordHash = await hashPassword(parsed.data.password);
      try {
        await execute(
          "INSERT INTO profiles (id, email, passwordHash, displayName, role) VALUES (?, ?, ?, ?, 'ORGANIZER')",
          [id, email, passwordHash, parsed.data.displayName]
        );
        const token = await createSession(id);
        const response = NextResponse.json({ success: true });
        setSessionCookie(response, token);
        return response;
      } catch (error) {
        if ((error as { code?: string })?.code === "ER_DUP_ENTRY") {
          return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
        }
        throw error;
      }
    }

    const accounts = await query<AccountRow[]>(
      "SELECT id, email, passwordHash FROM profiles WHERE email = ? LIMIT 1",
      [email]
    );
    const account = accounts[0];
    if (!account || !(await verifyPassword(parsed.data.password, account.passwordHash))) {
      return NextResponse.json({ error: "Email or password is incorrect" }, { status: 401 });
    }
    const token = await createSession(account.id);
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, token);
    return response;
  }

  if (action === "request-reset") {
    const parsed = z.object({ email: z.string().email().max(255) }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const requiredSmtp = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"];
    if (requiredSmtp.some((key) => !process.env[key])) {
      return NextResponse.json(
        { error: "Password reset email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM in .env." },
        { status: 503 }
      );
    }
    const accounts = await query<ResetRecipient[]>(
      "SELECT id, email, displayName FROM profiles WHERE email = ? LIMIT 1",
      [parsed.data.email.trim().toLowerCase()]
    );
    const account = accounts[0];
    if (account) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = hashToken(token);
      await execute("DELETE FROM password_resets WHERE userId = ?", [account.id]);
      await execute(
        "INSERT INTO password_resets (tokenHash, userId, expiresAt) VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 1 HOUR))",
        [tokenHash, account.id]
      );
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      });
      const resetUrl = new URL("/reset-password", request.nextUrl.origin);
      resetUrl.searchParams.set("token", token);
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: account.email,
        subject: "Reset your DriveGo password",
        text: `Use this link within one hour to reset your password: ${resetUrl.toString()}`,
      });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "reset") {
    const parsed = z.object({
      token: z.string().min(32).max(128),
      password: z.string().min(10).max(128),
    }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const resetUserId = await transaction(async (connection) => {
      const tokenHash = hashToken(parsed.data.token);
      const [resetRows] = await connection.execute<(RowDataPacket & { userId: string })[]>(
        "SELECT userId FROM password_resets WHERE tokenHash = ? AND expiresAt > NOW(3) FOR UPDATE",
        [tokenHash]
      );
      const userId = resetRows[0]?.userId;
      if (!userId) return null;
      await connection.execute("UPDATE profiles SET passwordHash = ? WHERE id = ?", [passwordHash, userId]);
      await connection.execute("DELETE FROM password_resets WHERE tokenHash = ?", [tokenHash]);
      await connection.execute("DELETE FROM sessions WHERE userId = ?", [userId]);
      return userId;
    });
    if (!resetUserId) {
      return NextResponse.json({ error: "This password reset link is invalid or expired" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown authentication action" }, { status: 404 });
}
