'use client';

import { AuthProvider, type ClientUser } from '@/lib/auth/context';
import { type ReactNode } from 'react';

interface AuthProviderWrapperProps {
  children: ReactNode;
  initialUser?: ClientUser | null;
}

export function AuthProviderWrapper({ children, initialUser }: AuthProviderWrapperProps) {
  return (
    <AuthProvider initialUser={initialUser}>
      {children}
    </AuthProvider>
  );
}
