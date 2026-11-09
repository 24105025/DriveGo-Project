import "server-only";
import type { RowDataPacket } from "mysql2";
import { query } from "./db";
import type { Category, Status } from "./types";

type DriveRow = RowDataPacket & {
  id: string;
  title: string;
  description: string;
  summary: string | null;
  mediaUrl: string | null;
  imageUrl: string | null;
  category: Category;
  status: Status;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  creatorId: string;
  orgId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  progress: number;
  donorsCount: number;
  trueVotesCount: number;
  falseVotesCount: number;
  adminReviewed: boolean;
  createdAt: Date;
  updatedAt: Date;
  creator: unknown;
  organization: unknown;
};

export type DriveRecord = {
  id: string;
  title: string;
  description: string;
  summary: string | null;
  mediaUrl: string | null;
  imageUrl: string | null;
  category: Category;
  status: Status;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  creatorId: string;
  orgId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  progress: number;
  donorsCount: number;
  trueVotesCount: number;
  falseVotesCount: number;
  adminReviewed: boolean;
  createdAt: Date;
  updatedAt: Date;
  creator: { id?: string; displayName?: string | null; email?: string | null; avatarUrl?: string | null };
  organization: { id?: string; name?: string; slug?: string; verified?: boolean } | null;
};

function parseJson(value: unknown) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function mapDrive(row: DriveRow): DriveRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    summary: row.summary,
    mediaUrl: row.mediaUrl,
    imageUrl: row.imageUrl,
    category: row.category,
    status: row.status,
    location: row.location,
    locationLat: row.locationLat,
    locationLng: row.locationLng,
    creatorId: row.creatorId,
    orgId: row.orgId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    progress: row.progress,
    donorsCount: row.donorsCount,
    trueVotesCount: row.trueVotesCount,
    falseVotesCount: row.falseVotesCount,
    adminReviewed: row.adminReviewed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    creator: parseJson(row.creator) as DriveRecord["creator"],
    organization: parseJson(row.organization) as DriveRecord["organization"],
  };
}

export async function listDrives(
  whereSql: string,
  values: unknown[] = [],
  limit = 50
) {
  const rows = await query<DriveRow[]>(
    `SELECT d.*,
            JSON_OBJECT('id', p.id, 'displayName', p.displayName, 'email', p.email, 'avatarUrl', p.avatarUrl) AS creator,
            IF(o.id IS NULL, NULL, JSON_OBJECT('id', o.id, 'name', o.name, 'slug', o.slug, 'verified', o.verified)) AS organization
     FROM drives d
     JOIN profiles p ON p.id = d.creatorId
     LEFT JOIN organizations o ON o.id = d.orgId
     WHERE ${whereSql}
     ORDER BY d.createdAt DESC
     LIMIT ?`,
    [...values, limit]
  );
  return rows.map(mapDrive);
}

export async function listSavedDrives(
  userId: string
): Promise<Array<{ id: string; createdAt: Date; drive: DriveRecord }>> {
  const rows = await query<(DriveRow & { savedId: string; savedAt: Date })[]>(
    `SELECT s.id AS savedId, s.createdAt AS savedAt, d.*,
            JSON_OBJECT('displayName', p.displayName) AS creator,
            IF(o.id IS NULL, NULL, JSON_OBJECT('name', o.name, 'slug', o.slug, 'verified', o.verified)) AS organization
     FROM saved_drives s
     JOIN drives d ON d.id = s.driveId
     JOIN profiles p ON p.id = d.creatorId
     LEFT JOIN organizations o ON o.id = d.orgId
     WHERE s.userId = ?
     ORDER BY s.createdAt DESC`,
    [userId]
  );
  return rows.map((row) => {
    return {
      id: row.savedId,
      createdAt: row.savedAt,
      drive: mapDrive(row),
    };
  });
}
