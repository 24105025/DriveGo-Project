import { NextRequest, NextResponse } from "next/server";
import { driveStatusSchema } from "@/lib/validators";
import { getCurrentUser } from "@/lib/auth";
import { execute, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

// Admin-only: moderate drives
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check admin role
  const profiles = await query<(RowDataPacket & { role: string })[]>(
    "SELECT role FROM profiles WHERE id = ? LIMIT 1",
    [user.id]
  );
  const profile = profiles[0];

  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
  }

  const { driveId, status } = await request.json();
  const parsedStatus = driveStatusSchema.safeParse(status);

  if (!parsedStatus.success || !driveId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await execute("UPDATE drives SET status = ?, updatedAt = NOW(3) WHERE id = ?", [parsedStatus.data, driveId]);
    const updated = await query<RowDataPacket[]>("SELECT * FROM drives WHERE id = ? LIMIT 1", [driveId]);
    if (!updated[0]) return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    return NextResponse.json(updated[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update drive status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/admin/pending - List pending drives for moderation
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await query<(RowDataPacket & { role: string })[]>(
    "SELECT role FROM profiles WHERE id = ? LIMIT 1",
    [user.id]
  );
  const profile = profiles[0];

  if (profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden - Admin only" }, { status: 403 });
  }

  const drives = await query<(RowDataPacket & { creator: unknown; organization: unknown })[]>(
    `SELECT d.*,
            JSON_OBJECT('displayName', p.displayName, 'email', p.email) AS creator,
            IF(o.id IS NULL, NULL, JSON_OBJECT('name', o.name)) AS organization
     FROM drives d JOIN profiles p ON p.id = d.creatorId
     LEFT JOIN organizations o ON o.id = d.orgId
     WHERE d.status IN ('DRAFT', 'REJECTED') ORDER BY d.createdAt DESC`
  );

  return NextResponse.json({
    drives: drives.map((drive) => ({
      ...drive,
      creator: typeof drive.creator === "string" ? JSON.parse(drive.creator) : drive.creator,
      organization: typeof drive.organization === "string" ? JSON.parse(drive.organization) : drive.organization,
    })),
  });
}