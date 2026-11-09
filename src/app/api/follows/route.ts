import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { execute, newId } from "@/lib/db";

// POST /api/follows - Follow an org or drive
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId, driveId } = await request.json();

  if (!orgId && !driveId) {
    return NextResponse.json({ error: "orgId or driveId is required" }, { status: 400 });
  }

  try {
    const id = newId();
    const targetColumn = orgId ? "orgId" : "driveId";
    const targetId = orgId || driveId;
    await execute(
      `INSERT INTO follows (id, followerId, ${targetColumn}) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [id, user.id, targetId]
    );
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to follow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/follows?orgId=xxx or ?driveId=xxx - Unfollow
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");
  const driveId = searchParams.get("driveId");

  try {
    if (orgId) {
      await execute("DELETE FROM follows WHERE followerId = ? AND orgId = ?", [user.id, orgId]);
    }

    if (driveId) {
      await execute("DELETE FROM follows WHERE followerId = ? AND driveId = ?", [user.id, driveId]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unfollow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}