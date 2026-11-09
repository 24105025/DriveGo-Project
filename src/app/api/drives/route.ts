import { NextRequest, NextResponse } from "next/server";
import { driveSchema, driveFilterSchema } from "@/lib/validators";
import { getCurrentUser } from "@/lib/auth";
import { Category, Status } from "@/lib/types";
import { execute, newId, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { validateSafeUrl } from "@/lib/security";

// GET /api/drives - List drives with filtering
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Build filter from query params
  const filter = driveFilterSchema.safeParse({
    category: searchParams.get("category") || undefined,
    status: searchParams.get("status") || "ACTIVE",
    query: searchParams.get("query") || undefined,
    lat: searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined,
    lng: searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined,
    radiusKm: searchParams.get("radiusKm") ? Number(searchParams.get("radiusKm")) : undefined,
    sortBy: searchParams.get("sortBy") || "createdAt",
    sortOrder: searchParams.get("sortOrder") || "desc",
    page: Number(searchParams.get("page")) || 1,
    pageSize: Number(searchParams.get("pageSize")) || 12,
  });

  if (!filter.success) {
    return NextResponse.json({ error: filter.error.flatten() }, { status: 400 });
  }

  const { category, status, query: searchTerm, lat, lng, radiusKm, sortBy, sortOrder, page, pageSize } = filter.data;

  const clauses = ["d.status = ?"];
  const values: unknown[] = [status ?? Status.ACTIVE];
  if (category) {
    clauses.push("d.category = ?");
    values.push(category);
  }

  if (searchTerm) {
    clauses.push("(d.title LIKE ? OR d.description LIKE ?)");
    values.push(`%${searchTerm}%`, `%${searchTerm}%`);
  }

  if (lat !== undefined && lng !== undefined && radiusKm !== undefined) {
    const radiusDeg = radiusKm / 111;
    clauses.push("d.locationLat BETWEEN ? AND ?", "d.locationLng BETWEEN ? AND ?");
    values.push(lat - radiusDeg, lat + radiusDeg, lng - radiusDeg, lng + radiusDeg);
  }

  const orderColumn = { createdAt: "d.createdAt", endsAt: "d.endsAt", progress: "d.progress" }[sortBy];
  values.push(pageSize, (page - 1) * pageSize);
  const drives = await query<RowDataPacket[]>(
    `SELECT d.id, d.title, d.summary, d.imageUrl, d.category, d.status, d.location,
            d.endsAt, d.progress, d.donorsCount, d.trueVotesCount, d.falseVotesCount,
            JSON_OBJECT('displayName', p.displayName, 'avatarUrl', p.avatarUrl) AS creator,
            IF(o.id IS NULL, NULL, JSON_OBJECT('name', o.name, 'slug', o.slug, 'verified', o.verified)) AS organization
     FROM drives d
     JOIN profiles p ON p.id = d.creatorId
     LEFT JOIN organizations o ON o.id = d.orgId
     WHERE ${clauses.join(" AND ")}
     ORDER BY ${orderColumn} ${sortOrder === "asc" ? "ASC" : "DESC"}
     LIMIT ? OFFSET ?`,
    values
  );
  const parsedDrives = drives.map((drive) => ({
    ...drive,
    creator: typeof drive.creator === "string" ? JSON.parse(drive.creator) : drive.creator,
    organization: typeof drive.organization === "string" ? JSON.parse(drive.organization) : drive.organization,
  }));
  return NextResponse.json({ drives: parsedDrives, page, pageSize });
}

// POST /api/drives - Create a new drive
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = driveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Security Check: Validate media link against shorteners, direct IPs, and dangerous schemes
  if (parsed.data.mediaUrl) {
    const urlValidation = validateSafeUrl(parsed.data.mediaUrl);
    if (!urlValidation.isValid) {
      return NextResponse.json({ error: urlValidation.error }, { status: 400 });
    }
  }

  try {
    const id = newId();
    const drive = parsed.data;
    await execute(
      `INSERT INTO drives
       (id, title, description, summary, mediaUrl, imageUrl, category, location,
        locationLat, locationLng, creatorId, status, startsAt, endsAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, drive.title, drive.description, drive.summary || null, drive.mediaUrl || null,
        drive.imageUrl || null, drive.category || Category.MONETARY, drive.location || null,
        drive.locationLat ?? null, drive.locationLng ?? null, user.id, Status.ACTIVE,
        drive.startsAt ? new Date(drive.startsAt) : null,
        drive.endsAt ? new Date(drive.endsAt) : null,
      ]
    );
    return NextResponse.json({ id, ...drive, creatorId: user.id, status: Status.ACTIVE }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create drive";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
