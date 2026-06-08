import { UserTable } from '@/components/admin';
import { getAuthDb } from '@/lib/auth';
import { Users, Crown, UserCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface UserRow {
  id: number;
  email: string;
  email_verified: number;
  role: string;
  manual_premium: number;
  created_at: string;
  updated_at: string;
  subscription_status: string | null;
  subscription_end: string | null;
}

export default function AdminUsersPage() {
  const db = getAuthDb();

  // Get stats
  const totalUsers = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  const premiumUsers = (db.prepare(`
    SELECT COUNT(DISTINCT u.id) as count
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing')
    WHERE u.manual_premium = 1 OR s.id IS NOT NULL
  `).get() as { count: number }).count;
  const verifiedUsers = (db.prepare('SELECT COUNT(*) as count FROM users WHERE email_verified = 1').get() as { count: number }).count;

  // Get initial users
  const users = db.prepare(`
    SELECT
      u.id,
      u.email,
      u.email_verified,
      u.role,
      u.manual_premium,
      u.created_at,
      u.updated_at,
      s.status as subscription_status,
      s.current_period_end as subscription_end
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status IN ('active', 'trialing')
    ORDER BY u.created_at DESC
    LIMIT 20
  `).all() as UserRow[];

  const transformedUsers = users.map(u => ({
    id: u.id,
    email: u.email,
    emailVerified: u.email_verified === 1,
    role: u.role,
    manualPremium: u.manual_premium === 1,
    hasPaidSubscription: u.subscription_status === 'active' || u.subscription_status === 'trialing',
    subscriptionStatus: u.subscription_status,
    subscriptionEnd: u.subscription_end,
    isPremium: u.manual_premium === 1 || u.subscription_status === 'active' || u.subscription_status === 'trialing',
    createdAt: u.created_at,
    updatedAt: u.updated_at
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-muted-foreground">
          Manage user accounts and premium access
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Total Users"
          value={totalUsers}
          color="text-sky-500"
          bgColor="bg-sky-500/10"
        />
        <StatCard
          icon={<Crown className="h-5 w-5" />}
          label="Premium Users"
          value={premiumUsers}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />
        <StatCard
          icon={<UserCheck className="h-5 w-5" />}
          label="Verified Emails"
          value={verifiedUsers}
          color="text-emerald-500"
          bgColor="bg-emerald-500/10"
        />
      </div>

      {/* User Table */}
      <UserTable
        initialUsers={transformedUsers}
        initialPagination={{
          page: 1,
          limit: 20,
          total: totalUsers,
          totalPages: Math.ceil(totalUsers / 20)
        }}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
  bgColor
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bgColor}`}>
          <span className={color}>{icon}</span>
        </div>
        <div>
          <p className="text-2xl font-bold">{value.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
