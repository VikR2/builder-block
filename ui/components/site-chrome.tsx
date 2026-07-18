'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/brand-mark';
import { UserMenu } from '@/components/auth/user-menu';

const publicRoutes = [
  '/pricing',
  '/login',
  '/signup',
  '/reset-password',
  '/verify-email',
];

const memberLinks = [
  { href: '/home', label: 'Home' },
  { href: '/tcm/library', label: 'Library' },
  { href: '/skills', label: 'Skills' },
  { href: '/tcm', label: 'Knowledge Bot' },
];

function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[#f7f3eb]/92 backdrop-blur-xl">
      <div className="site-container flex h-[76px] items-center justify-between gap-6">
        <BrandMark />

        <nav
          aria-label="Marketing navigation"
          className="hidden items-center gap-7 lg:flex"
        >
          {[
            ['Features', '/pricing#features'],
            ['Method', '/pricing#method'],
            ['Education', '/pricing#education'],
            ['Pricing', '/pricing#plans'],
            ['FAQ', '/pricing#faq'],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="text-sm font-medium text-[#5f5c56] transition-colors hover:text-[#17191d]"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2.5 text-sm font-semibold text-[#34363a] transition-colors hover:bg-black/5 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/pricing#plans"
            className="inline-flex min-h-11 items-center rounded-full bg-[#17191d] px-5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Get access
          </Link>
        </div>
      </div>
    </header>
  );
}

function MemberHeader({ pathname }: { pathname: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0b0d10]/92 backdrop-blur-xl">
      <div className="site-container flex min-h-[72px] items-center gap-6">
        <BrandMark href="/home" compact inverse />

        <nav
          aria-label="Member navigation"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
        >
          {memberLinks.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/home' && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/[0.09] text-[#f5efe5]'
                    : 'text-[#999da5] hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto shrink-0">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-black/10 bg-[#eee8dd] text-[#4e4d49]">
      <div className="site-container grid gap-8 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <BrandMark />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[#69665f]">
            Indicator tools and education for traders who want market context
            before execution.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8c5c20]">
            Explore
          </p>
          <div className="mt-3 grid gap-2 text-sm">
            <Link href="/pricing#features">Indicator features</Link>
            <Link href="/pricing#method">TCM method</Link>
            <Link href="/pricing#plans">Plans</Link>
          </div>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8c5c20]">
            Member access
          </p>
          <div className="mt-3 grid gap-2 text-sm">
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Create account</Link>
            <Link href="/account">Account</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-black/10">
        <div className="site-container flex flex-col gap-3 py-5 text-xs text-[#77726a] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} The Currency Merchant.</p>
          <p>Trading involves risk. Indicators do not guarantee future results.</p>
        </div>
      </div>
    </footer>
  );
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin =
    pathname === '/tcm/admin' || pathname.startsWith('/tcm/admin/');
  const isPublic =
    publicRoutes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    ) || pathname === '/';

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isPublic) {
    return (
      <div className="flex min-h-screen flex-col bg-[#f7f3eb] text-[#17191d]">
        <MarketingHeader />
        <main className="relative flex-1">{children}</main>
        <MarketingFooter />
      </div>
    );
  }

  return (
    <div className="member-shell flex min-h-screen flex-col bg-[#0b0d10] text-[#f4efe7]">
      <MemberHeader pathname={pathname} />
      <main className="relative flex-1">{children}</main>
    </div>
  );
}
