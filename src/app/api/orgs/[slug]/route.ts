import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { listDrives } from "@/lib/queries";
import type { RowDataPacket } from "mysql2";

type RouteParams = { params: Promise<{ slug: string }> };

// GET /api/orgs/[slug] - Get organization by slug
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params;
  const rows = await query<(RowDataPacket & { owner: unknown })[]>(
    `SELECT o.*, JSON_OBJECT('displayName', p.displayName, 'avatarUrl', p.avatarUrl) AS owner
     FROM organizations o JOIN profiles p ON p.id = o.ownerId
     WHERE o.slug = ? LIMIT 1`,
    [slug]
  );
  const org = rows[0];

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const drives = await listDrives("d.orgId = ?", [org.id], 100);
  const counts = await query<(RowDataPacket & { followersCount: number })[]>(
    "SELECT COUNT(*) AS followersCount FROM follows WHERE orgId = ?",
    [org.id]
  );
  const owner = typeof org.owner === "string" ? JSON.parse(org.owner) : org.owner;

  return NextResponse.json({ ...org, owner, drives, followersCount: counts[0]?.followersCount ?? 0 });
}