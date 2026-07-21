import { requireAuth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Require authentication for all dashboard pages
  await requireAuth('/home');

  // Dashboard layout just enforces auth, inherits header/footer from root layout
  return <>{children}</>;
}
