import { PageShell } from "@/components/layout/header-wrapper";
import { requireAdmin } from "@/lib/auth";
import { listDrives } from "@/lib/queries";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata = {
  title: "Admin Dashboard — DriveGo",
  description: "Moderation and tracking dashboard for community donation drives.",
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, profile } = await requireAdmin();

  // Load all drives with creator and organization details
  const drives = await listDrives("1 = 1", [], 500);

  return (
    <PageShell>
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
