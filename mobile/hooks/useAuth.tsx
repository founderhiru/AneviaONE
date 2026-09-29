import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { authService } from '../services/auth/authService';
import type { User } from '../types';

/** Something the signed-out screens should explain to the person. */
export type AuthNotice = 'session_expired';

export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again to continue.';

export type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  /** Set when the session ended without the person signing out. */
  notice: AuthNotice | null;
  clearNotice: () => void;
  refreshUser: () => Promise<void>;
  completeOnboarding: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const userRef = useRef<User | null>(null);
  const signingOut = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshUser = useCallback(async () => {
    const current = await authService.getCurrentUser();
    setUser(current);
  }, []);

  // Restore the persisted session on launch. Failures (e.g. offline with no
  // usable session) resolve to signed-out rather than leaving the app stuck.
  useEffect(() => {
    let mounted = true;
    (async () => {
      let current: User | null = null;
      try {
        current = await authService.getCurrentUser();
      } catch (error) {
        if (__DEV__) console.warn('[auth] could not restore session', error);
      }
      if (mounted) {
        setUser(current);
        setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Session ended outside the person's control (refresh token expired or
  // revoked, signed out elsewhere). The auth client has already cleared the
  // stored session; drop back to Welcome and explain why. Never falls back
  // to demo/mock sign-in.
  useEffect(
    () =>
      authService.onSignedOut(() => {
        if (userRef.current && !signingOut.current) setNotice('session_expired');
        setUser(null);
      }),
    []
  );

  const clearNotice = useCallback(() => setNotice(null), []);

  const completeOnboarding = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, onboardingComplete: true } : prev));
    authService.completeOnboarding().catch((error) => {
      if (__DEV__) console.warn('[auth] could not persist onboarding', error);
    });
  }, []);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    try {
      await authService.signOut();
    } finally {
      signingOut.current = false;
      setNotice(null);
      setUser(null);
    }
  }, []);

  const refreshAndClear = useCallback(async () => {
    await refreshUser();
    setNotice(null);
  }, [refreshUser]);

  const value = useMemo(
    () => ({ user, isLoading, notice, clearNotice, refreshUser: refreshAndClear, completeOnboarding, signOut }),
    [user, isLoading, notice, clearNotice, refreshAndClear, completeOnboarding, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
