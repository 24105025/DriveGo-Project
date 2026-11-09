import { NextRequest, NextResponse } from "next/server";
import { profileUpdateSchema } from "@/lib/validators";
import { getCurrentUser } from "@/lib/auth";
import { execute, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

// GET /api/profile - Get current user profile
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await query<(RowDataPacket & { organization: unknown })[]>(
    `SELECT p.*, IF(o.id IS NULL, NULL, JSON_OBJECT(
       'id', o.id, 'name', o.name, 'slug', o.slug, 'description', o.description,
       'website', o.website, 'logoUrl', o.logoUrl, 'verified', o.verified, 'location', o.location
     )) AS organization
     FROM profiles p LEFT JOIN organizations o ON o.ownerId = p.id
     WHERE p.id = ? LIMIT 1`,
    [user.id]
  );
  const profile = profiles[0];

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { passwordHash, ...profileData } = profile;
  const organization = typeof profileData.organization === "string"
    ? JSON.parse(profileData.organization)
    : profileData.organization;
  return NextResponse.json({ ...profileData, organization });
}

// PATCH /api/profile - Update profile
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = profileUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updates = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  if (updates.length === 0) return NextResponse.json({ success: true });
  const assignments = updates.map(([key]) => `\`${key}\` = ?`).join(", ");
  await execute(
    `UPDATE profiles SET ${assignments} WHERE id = ?`,
    [...updates.map(([, value]) => value === "" ? null : value), user.id]
  );
  const rows = await query<RowDataPacket[]>(
    "SELECT id, email, displayName, avatarUrl, bio, location, role, createdAt, updatedAt FROM profiles WHERE id = ?",
    [user.id]
  );
  return NextResponse.json(rows[0]);
}