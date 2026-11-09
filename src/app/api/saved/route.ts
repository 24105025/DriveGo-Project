import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { execute, newId } from "@/lib/db";
import { listSavedDrives } from "@/lib/queries";

// GET /api/saved - List user's saved drives
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const saved = await listSavedDrives(user.id);

  return NextResponse.json({ saved });
}

// POST /api/saved - Save a drive
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { driveId } = await request.json();

  if (!driveId) {
    return NextResponse.json({ error: "driveId is required" }, { status: 400 });
  }

  try {
    const id = newId();
    await execute(
      "INSERT INTO saved_drives (id, userId, driveId) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
      [id, user.id, driveId]
    );
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save drive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/saved?driveId=xxx - Unsave a drive
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const driveId = searchParams.get("driveId");

  if (!driveId) {
    return NextResponse.json({ error: "driveId is required" }, { status: 400 });
  }

  try {
    await execute("DELETE FROM saved_drives WHERE userId = ? AND driveId = ?", [user.id, driveId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove saved drive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}