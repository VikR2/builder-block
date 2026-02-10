import { requireAuth } from "@/lib/auth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requireAuth('/account');
  return <>{children}</>;
}
