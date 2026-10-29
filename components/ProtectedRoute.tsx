'use client';

/**
 * components/ProtectedRoute.tsx
 *
 * Guard route untuk halaman yang hanya boleh diakses user yang sudah login.
 * File ini self-contained: berisi AuthProvider, hook useAuth, dan ProtectedRoute.
 *
 * Cara pakai:
 * 1. Bungkus aplikasi dengan <AuthProvider> di app/layout.tsx.
 * 2. Bungkus halaman privat (mis. dashboard) dengan <ProtectedRoute>.
 *
 * Contoh:
 *   <AuthProvider>
 *     <ProtectedRoute redirectTo='/login'>
 *       <Dashboard />
 *     </ProtectedRoute>
 *   </AuthProvider>
 *
 * Environment variable (.env.local):
 *   NEXT_PUBLIC_API_URL=http://localhost:3001
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

/* ============ Types ============ */

export interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

interface ProtectedRouteProps {
  children: ReactNode;
  /** Tujuan redirect jika user belum login. Default: /login */
  redirectTo?: string;
}

/* ============ Auth state (context + localStorage) ============ */

const TOKEN_KEY = 'dbg_token';
const USER_KEY = 'dbg_user';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Pulihkan sesi dari localStorage saat pertama kali mount (client-side).
  useEffect(() => {
    try {
      const token = window.localStorage.getItem(TOKEN_KEY);
      const rawUser = window.localStorage.getItem(USER_KEY);
      if (token && rawUser) {
        setUser(JSON.parse(rawUser) as User);
      }
    } catch {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      },
    );

    if (!res.ok) {
      throw new Error('Email atau password salah.');
    }

    const data = (await res.json()) as { token: string; user: User };

    window.localStorage.setItem(TOKEN_KEY, data.token);
    window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus dipakai di dalam <AuthProvider>.');
  }
  return ctx;
}

/* ============ ProtectedRoute ============ */

export default function ProtectedRoute({
  children,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(redirectTo);
    }
  }, [loading, user, router, redirectTo]);

  // Masih memuat sesi: tampilkan spinner agar tidak flash ke halaman login.
  if (loading) {
    return (
      <div style={S.overlay} role='status' aria-live='polite'>
        <style>{'@keyframes dbgSpin{to{transform:rotate(360deg)}}'}</style>
        <div style={S.spinner} />
        <p style={S.text}>Memuat…</p>
      </div>
    );
  }

  // Belum login: jangan render apa pun, biarkan redirect bekerja.
  if (!user) {
    return null;
  }

  return <>{children}</>;
}

/* ============ Styles (inline, mobile-first) ============ */

const S: Record<string, React.CSSProperties> = {
  overlay: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    backgroundColor: '#f8fafc',
    fontFamily: `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
  },
  spinner: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '3px solid #e2e8f0',
    borderTopColor: '#2563eb',
    animation: 'dbgSpin 0.8s linear infinite',
  },
  text: {
    margin: 0,
    fontSize: '14px',
    color: '#64748b',
  },
};
