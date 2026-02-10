'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Upload,
  Video,
  ListOrdered,
  ArrowLeft,
  Settings,
  Users
} from 'lucide-react';

const navItems = [
  { href: '/tcm/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tcm/admin/upload', label: 'Upload', icon: Upload },
  { href: '/tcm/admin/videos', label: 'Videos', icon: Video },
  { href: '/tcm/admin/queue', label: 'Queue', icon: ListOrdered },
  { href: '/tcm/admin/users', label: 'Users', icon: Users }
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <Link
          href="/tcm"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mr-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to TCM
        </Link>

        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Settings className="h-4 w-4 text-amber-500" />
          </div>
          <span className="font-semibold">TCM Admin</span>
        </div>

        <nav className="flex items-center gap-1 ml-8">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/tcm/admin' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-500 font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <Link
            href="/tcm/library"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            View Library
          </Link>
        </div>
      </div>
    </header>
  );
}
