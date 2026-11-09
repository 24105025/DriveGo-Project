"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { Status, Category, Role } from "@/lib/types";
import { execute, newId, query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

// ==========================================
// DRIVES MANAGEMENT ACTIONS
// ==========================================

export async function updateDriveStatus(driveId: string, status: Status) {
  await requireAdmin();

  await execute("UPDATE drives SET status = ?, updatedAt = NOW(3) WHERE id = ?", [status, driveId]);
  const [updated] = await query<RowDataPacket[]>("SELECT * FROM drives WHERE id = ?", [driveId]);

  revalidatePath("/admin");
  revalidatePath("/drives/" + driveId);
  revalidatePath("/category/all");
  return { success: true, drive: updated };
}

export async function putBackUpDriveAdmin(driveId: string) {
  await requireAdmin();

  // Reset false reports and restore status to ACTIVE with adminReviewed = true
  await execute("DELETE FROM drive_votes WHERE driveId = ? AND type = 'FALSE_INFO'", [driveId]);
  await execute(
    "UPDATE drives SET status = ?, falseVotesCount = 0, adminReviewed = TRUE, updatedAt = NOW(3) WHERE id = ?",
    [Status.ACTIVE, driveId]
  );
  const [updated] = await query<RowDataPacket[]>("SELECT * FROM drives WHERE id = ?", [driveId]);

  revalidatePath("/admin");
  revalidatePath("/drives/" + driveId);
  revalidatePath("/category/all");
  revalidatePath("/");
  return { success: true, drive: updated };
}

export async function updateDriveDetails(
  driveId: string,
  data: {
    title?: string;
    description?: string;
    summary?: string;
    category?: Category;
    status?: Status;
    location?: string;
    imageUrl?: string;
    mediaUrl?: string;
    progress?: number;
    donorsCount?: number;
  }
) {
  await requireAdmin();

  const allowedFields = new Set([
    "title", "description", "summary", "category", "status", "location",
    "imageUrl", "mediaUrl", "progress", "donorsCount",
  ]);
  const fields = Object.entries(data).filter(([field, value]) => allowedFields.has(field) && value !== undefined);
  if (fields.length === 0) return { success: true };
  const assignments = fields.map(([field]) => `\`${field}\` = ?`).join(", ");
  await execute(
    `UPDATE drives SET ${assignments}, updatedAt = NOW(3) WHERE id = ?`,
    [...fields.map(([field, value]) => field === "progress" || field === "donorsCount" ? Number(value) : value), driveId]
  );
  const [updated] = await query<RowDataPacket[]>("SELECT * FROM drives WHERE id = ?", [driveId]);

  revalidatePath("/admin");
  revalidatePath("/drives/" + driveId);
  return { success: true, drive: updated };
}

export async function deleteDrive(driveId: string) {
  await requireAdmin();

  await execute("DELETE FROM drives WHERE id = ?", [driveId]);

  revalidatePath("/admin");
  revalidatePath("/category/all");
  return { success: true };
}

export async function createDriveAdmin(data: {
  title: string;
  description: string;
  category: Category;
  summary?: string;
  location?: string;
  imageUrl?: string;
  mediaUrl?: string;
  status?: Status;
}) {
  const { user } = await requireAdmin();

  const id = newId();
  await execute(
    `INSERT INTO drives (id, title, description, summary, category, location, imageUrl, mediaUrl, status, creatorId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.title, data.description, data.summary || null, data.category, data.location || null,
      data.imageUrl || null, data.mediaUrl || null, data.status || Status.ACTIVE, user.id]
  );
  const [created] = await query<RowDataPacket[]>("SELECT * FROM drives WHERE id = ?", [id]);

  revalidatePath("/admin");
  revalidatePath("/category/all");
  return { success: true, drive: created };
}

// ==========================================
// ORGANIZATIONS MANAGEMENT ACTIONS
// ==========================================

export async function toggleOrgVerification(orgId: string, verified: boolean) {
  await requireAdmin();

  await execute("UPDATE organizations SET verified = ?, updatedAt = NOW(3) WHERE id = ?", [verified, orgId]);
  const [updated] = await query<(RowDataPacket & { slug: string })[]>(
    "SELECT * FROM organizations WHERE id = ?",
    [orgId]
  );
  if (!updated) throw new Error("Organization not found");

  revalidatePath("/admin");
  revalidatePath("/orgs/" + updated.slug);
  return { success: true, organization: updated };
}

export async function updateOrganization(
  orgId: string,
  data: {
    name?: string;
    description?: string;
    website?: string;
    location?: string;
    verified?: boolean;
  }
) {
  await requireAdmin();

  const allowedFields = new Set(["name", "description", "website", "location", "verified"]);
  const fields = Object.entries(data).filter(([field, value]) => allowedFields.has(field) && value !== undefined);
  if (fields.length === 0) return { success: true };
  const assignments = fields.map(([field]) => `\`${field}\` = ?`).join(", ");
  await execute(
    `UPDATE organizations SET ${assignments}, updatedAt = NOW(3) WHERE id = ?`,
    [...fields.map(([, value]) => value), orgId]
  );
  const [updated] = await query<(RowDataPacket & { slug: string })[]>(
    "SELECT * FROM organizations WHERE id = ?",
    [orgId]
  );
  if (!updated) throw new Error("Organization not found");

  revalidatePath("/admin");
  revalidatePath("/orgs/" + updated.slug);
  return { success: true, organization: updated };
}

export async function deleteOrganization(orgId: string) {
  await requireAdmin();

  await execute("DELETE FROM organizations WHERE id = ?", [orgId]);

  revalidatePath("/admin");
  return { success: true };
}

export async function createOrganizationAdmin(data: {
  name: string;
  slug: string;
  description?: string;
  website?: string;
  location?: string;
  verified?: boolean;
}) {
  const { user } = await requireAdmin();

  const id = newId();
  await execute(
    `INSERT INTO organizations (id, name, slug, description, website, location, verified, ownerId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-"),
      data.description || null, data.website || null, data.location || null, data.verified ?? false, user.id]
  );
  const [created] = await query<RowDataPacket[]>("SELECT * FROM organizations WHERE id = ?", [id]);

  revalidatePath("/admin");
  return { success: true, organization: created };
}

// ==========================================
// USERS & ROLES MANAGEMENT ACTIONS
// ==========================================

export async function updateUserRole(userId: string, role: Role) {
  await requireAdmin();

  await execute("UPDATE profiles SET role = ?, updatedAt = NOW(3) WHERE id = ?", [role, userId]);
  const [updated] = await query<RowDataPacket[]>(
    "SELECT id, email, displayName, role FROM profiles WHERE id = ?",
    [userId]
  );

  revalidatePath("/admin");
  return { success: true, profile: updated };
}

// ==========================================
// UPDATES / FEED MANAGEMENT ACTIONS
// ==========================================

export async function deleteDriveUpdate(updateId: string) {
  await requireAdmin();

  await execute("DELETE FROM updates WHERE id = ?", [updateId]);

  revalidatePath("/admin");
  return { success: true };
}
