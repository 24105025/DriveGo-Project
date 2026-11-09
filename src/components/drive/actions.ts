"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { execute, newId, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import type { Status } from "@/lib/types";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const rows = await query<(RowDataPacket & { role: string })[]>(
    "SELECT role FROM profiles WHERE id = ? LIMIT 1",
    [user.id]
  );
  if (!rows[0]) redirect("/login");
  return { user, profile: rows[0] };
}

export async function saveDrive(driveId: string) {
  const { user } = await requireUser();
  await execute(
    "INSERT INTO saved_drives (id, userId, driveId) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
    [newId(), user.id, driveId]
  );
  return { ok: true };
}

export async function unsaveDrive(driveId: string) {
  const { user } = await requireUser();
  await execute("DELETE FROM saved_drives WHERE userId = ? AND driveId = ?", [user.id, driveId]);
  return { ok: true };
}

export async function followDrive(driveId: string) {
  const { user } = await requireUser();
  await execute(
    "INSERT INTO follows (id, followerId, driveId) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
    [newId(), user.id, driveId]
  );
  return { ok: true };
}

export async function unfollowDrive(driveId: string) {
  const { user } = await requireUser();
  await execute("DELETE FROM follows WHERE followerId = ? AND driveId = ?", [user.id, driveId]);
  return { ok: true };
}

export async function voteDrive(driveId: string, type: "TRUE_INFO" | "FALSE_INFO") {
  const { user } = await requireUser();
  const existingRows = await query<(RowDataPacket & { id: string; type: string })[]>(
    "SELECT id, type FROM drive_votes WHERE userId = ? AND driveId = ? LIMIT 1",
    [user.id, driveId]
  );
  const existing = existingRows[0];
  let newVoteType: "TRUE_INFO" | "FALSE_INFO" | null = type;

  if (existing?.type === type) {
    await execute("DELETE FROM drive_votes WHERE id = ?", [existing.id]);
    newVoteType = null;
  } else if (existing) {
    await execute(
      "UPDATE drive_votes SET type = ?, updatedAt = NOW(3) WHERE id = ?",
      [type, existing.id]
    );
  } else {
    await execute(
      "INSERT INTO drive_votes (id, userId, driveId, type) VALUES (?, ?, ?, ?)",
      [newId(), user.id, driveId, type]
    );
  }

  const counts = await query<(RowDataPacket & { type: string; voteCount: number })[]>(
    "SELECT type, COUNT(*) AS voteCount FROM drive_votes WHERE driveId = ? GROUP BY type",
    [driveId]
  );
  const trueVotesCount = counts.find((row) => row.type === "TRUE_INFO")?.voteCount ?? 0;
  const falseVotesCount = counts.find((row) => row.type === "FALSE_INFO")?.voteCount ?? 0;
  const isAutoRejected = falseVotesCount >= 8;

  await execute(
    `UPDATE drives
     SET trueVotesCount = ?, falseVotesCount = ?,
         status = IF(?, 'REJECTED', status),
         adminReviewed = IF(?, FALSE, adminReviewed),
         updatedAt = NOW(3)
     WHERE id = ?`,
    [trueVotesCount, falseVotesCount, isAutoRejected, isAutoRejected, driveId]
  );

  return { ok: true, userVote: newVoteType, trueVotesCount, falseVotesCount, isAutoRejected };
}

export async function getDriveVoteInfo(driveId: string) {
  const user = await getCurrentUser();
  const [driveRows, voteRows] = await Promise.all([
    query<(RowDataPacket & {
      trueVotesCount: number;
      falseVotesCount: number;
      status: Status;
      adminReviewed: boolean;
    })[]>(
      "SELECT trueVotesCount, falseVotesCount, status, adminReviewed FROM drives WHERE id = ? LIMIT 1",
      [driveId]
    ),
    user
      ? query<(RowDataPacket & { type: "TRUE_INFO" | "FALSE_INFO" })[]>(
          "SELECT type FROM drive_votes WHERE userId = ? AND driveId = ? LIMIT 1",
          [user.id, driveId]
        )
      : Promise.resolve([]),
  ]);
  const drive = driveRows[0];

  return {
    trueVotesCount: drive?.trueVotesCount ?? 0,
    falseVotesCount: drive?.falseVotesCount ?? 0,
    status: drive?.status ?? "ACTIVE",
    adminReviewed: drive?.adminReviewed ?? false,
    userVote: voteRows[0]?.type ?? null,
    isAuthenticated: !!user,
  };
}

export async function deleteDrive(driveId: string) {
  const { user, profile } = await requireUser();
  const drives = await query<(RowDataPacket & { creatorId: string; title: string })[]>(
    "SELECT creatorId, title FROM drives WHERE id = ? LIMIT 1",
    [driveId]
  );
  const drive = drives[0];
  if (!drive) throw new Error("Drive not found");
  if (drive.creatorId !== user.id && profile.role !== "ADMIN") {
    throw new Error("You are not authorized to delete this drive");
  }
  await execute("DELETE FROM drives WHERE id = ?", [driveId]);
  revalidatePath("/");
  revalidatePath("/category/all");
  return { ok: true };
}
