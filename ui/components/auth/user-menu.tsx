'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-white/10"></div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm text-neutral-400 transition-colors hover:text-white"
        >
          Sign In
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-[#c9974f] px-4 py-2 text-sm font-semibold text-[#15171a] transition-colors hover:bg-[#dfb36e]"
        >
          Sign Up
        </Link>
      </div>
    );
  }

  // Get initials for avatar
  const initials = user.email.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center gap-3">
        {/* Upgrade button for non-premium users */}
        {!user.isPremium && (
          <Link
            href="/pricing"
            className="hidden rounded-full border border-[#c9974f]/40 bg-[#c9974f]/10 px-3.5 py-2 text-xs font-semibold text-[#e0b56d] transition-colors hover:bg-[#c9974f]/20 md:inline-flex"
          >
            Get indicator access
          </Link>
        )}

        {/* Avatar button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex min-h-11 items-center gap-2 rounded-full px-1.5 focus:outline-none"
          aria-expanded={isOpen}
          aria-label="Open account menu"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-sm font-semibold text-[#e0b56d]">
            {initials}
          </div>
          <svg
            className={`h-4 w-4 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#121418] py-2 shadow-2xl shadow-black/40">
          {/* User info */}
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-medium text-white truncate">{user.email}</p>
            <div className="flex items-center gap-2 mt-1">
              {user.isPremium ? (
                <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded-full">
                  Indicator active
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded-full">
                  Free
                </span>
              )}
              {user.isAdmin && (
                <span className="text-xs px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-full">
                  Admin
                </span>
              )}
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              href="/account"
              onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-white/[0.05]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Account
            </Link>

            {user.hasPaidSubscription && (
              <Link
                href="/account/subscription"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-white/[0.05]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Subscription
              </Link>
            )}

            {user.isAdmin && (
              <Link
                href="/tcm/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-300 transition-colors hover:bg-white/[0.05]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin Panel
              </Link>
            )}
          </div>

          {/* Logout */}
          <div className="border-t border-white/10 pt-1">
            <button
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-white/[0.05]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
