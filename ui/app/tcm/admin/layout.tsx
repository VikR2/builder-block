import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AdminNav } from './admin-nav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Check authentication and admin status
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/tcm/admin');
  }

  if (!user.isAdmin) {
    // Non-admin users get redirected to the main TCM page
    redirect('/tcm');
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
