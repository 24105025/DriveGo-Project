import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { execute, newId, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

const updateSchema = z.object({
  driveId: z.string().cuid(),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(5000),
});

// POST /api/updates - Post a drive update
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const id = newId();
    await execute(
      "INSERT INTO updates (id, driveId, authorId, title, body) VALUES (?, ?, ?, ?, ?)",
      [id, parsed.data.driveId, user.id, parsed.data.title, parsed.data.body]
    );
    const rows = await query<RowDataPacket[]>("SELECT * FROM updates WHERE id = ?", [id]);
    const update = rows[0];
    return NextResponse.json(update, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/updates?driveId=xxx - Get updates for a drive
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const driveId = searchParams.get("driveId");

  if (!driveId) {
    return NextResponse.json({ error: "driveId is required" }, { status: 400 });
  }

  const updates = await query<RowDataPacket[]>(
    `SELECT u.*, JSON_OBJECT('displayName', p.displayName, 'avatarUrl', p.avatarUrl) AS author
     FROM updates u JOIN profiles p ON p.id = u.authorId
     WHERE u.driveId = ? ORDER BY u.createdAt DESC`,
    [driveId]
  );

  return NextResponse.json({
    updates: updates.map((update) => ({
      ...update,
      author: typeof update.author === "string" ? JSON.parse(update.author) : update.author,
    })),
  });
}