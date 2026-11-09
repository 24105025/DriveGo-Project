import { MapPin, ShieldCheck, Users } from "lucide-react";
import { PageShell } from "@/components/layout/header-wrapper";
import { DriveCard } from "@/components/drive/drive-card";
import { query } from "@/lib/db";
import { listDrives } from "@/lib/queries";
import { notFound } from "next/navigation";
import { Tag } from "@/components/ui/tag";
import type { RowDataPacket } from "mysql2";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function OrgProfilePage({ params }: Props) {
  const { slug } = await params;

  const orgs = await query<(RowDataPacket & {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    location: string | null;
    description: string | null;
  })[]>(
    "SELECT id, name, slug, verified, location, description FROM organizations WHERE slug = ? LIMIT 1",
    [slug]
  );
  const org = orgs[0];

  if (!org) {
    notFound();
  }

  const drives = await listDrives("d.orgId = ? AND d.status = 'ACTIVE'", [org.id], 100);
  const counts = await query<(RowDataPacket & { followersCount: number })[]>(
    "SELECT COUNT(*) AS followersCount FROM follows WHERE orgId = ?",
    [org.id]
  );
  const followersCount = counts[0]?.followersCount ?? 0;

  return (
    <PageShell>
      <section className="border-b border-gray-100 bg-gradient-to-br from-blue-50 to-white pt-20 pb-10 sm:pt-24">
        <div className="mx-auto max-w-7xl px-4 lg:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl font-bold text-primary shadow-md">
              {org.name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold text-gray-900">{org.name}</h1>
                {org.verified && (
                  <Tag className="gap-1">
                    <ShieldCheck size={11} /> Verified
                  </Tag>
                )}
              </div>
              {org.location && (
                <p className="flex items-center gap-1 text-gray-600">
                  <MapPin size={14} /> {org.location}
                </p>
              )}
              <p className="mt-2 flex items-center gap-1 text-sm text-gray-500">
                <Users size={13} />
                {followersCount} follower{followersCount !== 1 ? "s" : ""} ·{" "}
                {drives.length} active drive
                {drives.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
        {org.description && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="font-bold text-gray-900">About</h2>
            <p className="mt-2 text-gray-700">{org.description}</p>
          </div>
        )}

        <h2 className="mt-8 text-2xl font-bold text-gray-900">Active Drives</h2>
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {drives.map((d: typeof drives[number]) => (
            <DriveCard
              key={d.id}
              {...d}
              endsAt={d.endsAt?.toISOString()}
            />
          ))}
        </div>

        {drives.length === 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-white p-12 text-center">
            <p className="text-gray-500">
              No active drives yet from this organization.
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
