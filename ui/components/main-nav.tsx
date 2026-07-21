'use client';

import Link from 'next/link';
import { useAuth, useAdmin } from '@/lib/auth/context';

export function MainNav() {
  const { user, loading } = useAuth();
  const { isAdmin } = useAdmin();

  const isAuthenticated = !!user;
  const logoHref = isAuthenticated ? '/home' : '/';

  return (
    <div className="flex items-center gap-8">
      {/* Logo */}
      <Link href={logoHref} className="flex items-center space-x-3 group">
        <div className="relative">
          <div className="absolute inset-0 bg-amber-500/20 blur-xl group-hover:bg-amber-500/30 transition-all"></div>
          <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <span className="text-background font-bold text-sm">TCM</span>
          </div>
        </div>
        <span className="font-semibold text-lg tracking-tight">
          <span className="text-amber-500">The Currency Merchant</span>
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex items-center space-x-1">
        {/* Home - only for authenticated users */}
        {isAuthenticated && (
          <Link
            href="/home"
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-amber-500/10 rounded-lg transition-all"
          >
            <span className="text-amber-500 mr-1.5">&#9679;</span>
            Home
          </Link>
        )}

        <Link
          href="/pricing"
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-amber-500/10 rounded-lg transition-all"
        >
          <span className="text-emerald-500 mr-1.5">&#9679;</span>
          Indicator Access
        </Link>

        {/* Admin - only for admin users */}
        {isAdmin && (
          <Link
            href="/tcm/admin"
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-amber-500/10 rounded-lg transition-all"
          >
            <span className="text-red-500 mr-1.5">&#9881;</span>
            Admin
          </Link>
        )}
      </nav>
    </div>
  );
}
