'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { clearTCMChatSessions } from '@/lib/tcm-chat-session';

export interface ClientUser {
  id: number;
  email: string;
  role: 'user' | 'admin';
  isPremium: boolean;
  creditBalance: number;
  hasChatAccess: boolean;
  hasStripeSubscription: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
}

interface AuthContextValue {
  user: ClientUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: ClientUser | null;
}

export function AuthProvider({ children, initialUser = null }: AuthProviderProps) {
  const [user, setUser] = useState<ClientUser | null>(initialUser);
  const [loading, setLoading] = useState(!initialUser);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/auth/me');

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
      setError('Failed to load user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      clearTCMChatSessions();
      setUser(null);
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to logout:', err);
    }
  }, []);

  useEffect(() => {
    if (!initialUser) {
      refresh();
    }
  }, [initialUser, refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook to check if user has premium access
 */
export function usePremium(): { isPremium: boolean; loading: boolean } {
  const { user, loading } = useAuth();

  return {
    isPremium: user?.isPremium ?? false,
    loading,
  };
}

/**
 * Hook to check if user is admin
 */
export function useAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user, loading } = useAuth();

  return {
    isAdmin: user?.isAdmin ?? false,
    loading,
  };
}
