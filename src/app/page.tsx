import { PageShell } from "@/components/layout/header-wrapper";
import { Hero } from "@/components/layout/hero";
import { AboutSection } from "@/components/home/about-section";
import { CategoryGrid } from "@/components/category/category-grid";
import { getCurrentUser } from "@/lib/auth";
import { listDrives, listSavedDrives } from "@/lib/queries";
import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  // If user is authenticated
  if (user) {
    const profiles = await query<(RowDataPacket & {
      id: string;
      email: string;
      displayName: string | null;
      role: string;
    })[]>(
      "SELECT id, email, displayName, role FROM profiles WHERE id = ? LIMIT 1",
      [user.id]
    );
    const profile = profiles[0];
    if (!profile) throw new Error("The signed-in account does not have a MySQL profile");

    // =========================================================================
    // ADMIN DASHBOARD: Dedicated moderation portal for admins only
    // =========================================================================
    if (profile.role === "ADMIN") {
      const drives = await listDrives("1 = 1", [], 500);

      return (
        <PageShell hideHeader={true}>
          <AdminDashboard
            initialDrives={drives as any}
            currentUser={{
              email: user.email,
              role: profile.role,
            }}
          />
        </PageShell>
      );
    }

    // =========================================================================
    // REGULAR USER DASHBOARD: For organizers and donors
    // =========================================================================
    const [userDrives, savedResults, recentDrives] = await Promise.all([
      listDrives("d.creatorId = ?", [user.id], 100),
      listSavedDrives(user.id),
      listDrives("d.status = 'ACTIVE'", [], 6),
    ]);

    const serializedUserDrives = userDrives.map((d) => ({
      ...d,
      endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    }));

    const serializedSavedDrives = savedResults.map((s) => ({
      ...s.drive,
      endsAt: s.drive.endsAt ? new Date(s.drive.endsAt).toISOString() : null,
    }));

    const serializedRecentDrives = recentDrives.map((d) => ({
      ...d,
      endsAt: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    }));

    return (
      <PageShell hideHeader={true}>
        <UserDashboard
          user={user}
          profile={profile}
          userDrives={serializedUserDrives}
          savedDrives={serializedSavedDrives}
          recentDrives={serializedRecentDrives}
        />
      </PageShell>
    );
  }

  // If visitor is unauthenticated, show the public landing page
  return (
    <PageShell>
      <Hero />
      <AboutSection />
      <CategoryGrid />
    </PageShell>
  );
}