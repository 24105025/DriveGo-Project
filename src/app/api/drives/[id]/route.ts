import { NextRequest, NextResponse } from "next/server";
import { driveUpdateSchema } from "@/lib/validators";
import { getCurrentUser } from "@/lib/auth";
import { execute, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/drives/[id] - Get a single drive
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const drives = await query<(RowDataPacket & { creator: unknown; organization: unknown })[]>(
    `SELECT d.*,
            JSON_OBJECT('id', p.id, 'displayName', p.displayName, 'avatarUrl', p.avatarUrl) AS creator,
            IF(o.id IS NULL, NULL, JSON_OBJECT('name', o.name, 'slug', o.slug, 'verified', o.verified)) AS organization
     FROM drives d JOIN profiles p ON p.id = d.creatorId
     LEFT JOIN organizations o ON o.id = d.orgId WHERE d.id = ? LIMIT 1`,
    [id]
  );
  const drive = drives[0];

  if (!drive) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  const [items, updates] = await Promise.all([
    query<RowDataPacket[]>("SELECT * FROM drive_items WHERE driveId = ? ORDER BY createdAt", [id]),
    query<(RowDataPacket & { author: unknown })[]>(
      `SELECT u.*, JSON_OBJECT('displayName', p.displayName, 'avatarUrl', p.avatarUrl) AS author
       FROM updates u JOIN profiles p ON p.id = u.authorId
       WHERE u.driveId = ? ORDER BY u.createdAt DESC`,
      [id]
    ),
  ]);
  return NextResponse.json({
    ...drive,
    creator: typeof drive.creator === "string" ? JSON.parse(drive.creator) : drive.creator,
    organization: typeof drive.organization === "string" ? JSON.parse(drive.organization) : drive.organization,
    items,
    updates: updates.map((update) => ({
      ...update,
      author: typeof update.author === "string" ? JSON.parse(update.author) : update.author,
    })),
  });
}

// PATCH /api/drives/[id] - Update a drive
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check ownership
  const existingRows = await query<(RowDataPacket & { creatorId: string })[]>(
    "SELECT creatorId FROM drives WHERE id = ? LIMIT 1",
    [id]
  );
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  if (existing.creatorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = driveUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updateData = {
    ...parsed.data,
    startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : parsed.data.startsAt,
    endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : parsed.data.endsAt,
  };
  const allowed = new Set([
    "title", "description", "summary", "mediaUrl", "imageUrl", "category",
    "location", "locationLat", "locationLng", "startsAt", "endsAt",
  ]);
  const fields = Object.entries(updateData).filter(([key, value]) => allowed.has(key) && value !== undefined);
  if (fields.length === 0) return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  const assignments = fields.map(([key]) => `\`${key}\` = ?`).join(", ");
  await execute(
    `UPDATE drives SET ${assignments}, updatedAt = NOW(3) WHERE id = ?`,
    [...fields.map(([, value]) => value), id]
  );
  const updated = await query<RowDataPacket[]>("SELECT * FROM drives WHERE id = ? LIMIT 1", [id]);
  return NextResponse.json(updated[0]);
}

// DELETE /api/drives/[id]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check ownership or admin
  const existingRows = await query<(RowDataPacket & { creatorId: string })[]>(
    "SELECT creatorId FROM drives WHERE id = ? LIMIT 1",
    [id]
  );
  const existing = existingRows[0];

  if (!existing) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  const profiles = await query<(RowDataPacket & { role: string })[]>(
    "SELECT role FROM profiles WHERE id = ? LIMIT 1",
    [user.id]
  );
  const profile = profiles[0];

  if (existing.creatorId !== user.id && profile?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await execute("DELETE FROM drives WHERE id = ?", [id]);

  return NextResponse.json({ success: true });
}