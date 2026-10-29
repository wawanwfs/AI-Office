/* ============================================================
 * dbg project — Auth Store (Zustand + Persist)
 * Path : store/authStore.ts
 * Deps : npm i zustand
 *
 * Konfigurasi environment variable — simpan di .env.local:
 *   NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
 *   NEXT_PUBLIC_APP_NAME=dbg
 * ============================================================ */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ---------- Konfigurasi ----------
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

// ---------- Types ----------
export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'admin' | 'editor' | 'user';
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  status: AuthStatus;
  error: string | null;
  /** false sampai persist selesai rehydrate — WAJIB dicek di protected route (SSR-safe) */
  hasHydrated: boolean;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  setHasHydrated: (value: boolean) => void;
  clearError: () => void;
}

// ---------- HTTP helper ----------
async function apiRequest<T>(
  path: string,
  init?: RequestInit & { token?: string | null }
): Promise<T> {
  const { token, headers, ...rest } = init ?? {};

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let message = `Request gagal (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* response bukan JSON */
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

// ---------- Store ----------
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      status: 'idle',
      error: null,
      hasHydrated: false,

      setHasHydrated: (value) => set({ hasHydrated: value }),
      clearError: () => set({ error: null }),

      // Dipakai di halaman login:
      // const login = useAuthStore((s) => s.login);
      // const ok = await login(email, password); if (ok) router.replace('/dashboard');
      login: async (email, password) => {
        set({ status: 'loading', error: null });
        try {
          const data = await apiRequest<LoginResponse>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            status: 'authenticated',
            error: null,
          });
          return true;
        } catch (err) {
          set({
            status: 'unauthenticated',
            error: err instanceof Error ? err.message : 'Email atau password salah.',
          });
          return false;
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          if (refreshToken) {
            await apiRequest('/auth/logout', {
              method: 'POST',
              body: JSON.stringify({ refreshToken }),
            });
          }
        } catch {
          // tetap logout lokal walau API gagal / offline
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          status: 'unauthenticated',
          error: null,
        });
      },

      // Panggil sekali di dashboard layout (useEffect) untuk sinkron profil
      fetchProfile: async () => {
        const { accessToken } = get();
        if (!accessToken) return;
        try {
          const user = await apiRequest<User>('/auth/me', { token: accessToken });
          set({ user, status: 'authenticated' });
        } catch {
          // token expired -> coba refresh
          await get().refreshSession();
        }
      },

      refreshSession: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated' });
          return false;
        }
        try {
          const data = await apiRequest<LoginResponse>('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({ refreshToken }),
          });
          set({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            status: 'authenticated',
          });
          return true;
        } catch {
          set({ user: null, accessToken: null, refreshToken: null, status: 'unauthenticated' });
          return false;
        }
      },
    }),
    {
      name: 'dbg-auth',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

/* ============================================================
 * Selector & helper untuk protected route
 *
 * Contoh pemakaian (app/dashboard/layout.tsx):
 *
 *   'use client';
 *   import { useEffect } from 'react';
 *   import { useRouter } from 'next/navigation';
 *   import { useAuthStore, useIsAuthenticated } from '@/store/authStore';
 *
 *   export default function DashboardLayout({ children }: { children: React.ReactNode }) {
 *     const router = useRouter();
 *     const hasHydrated = useAuthStore((s) => s.hasHydrated);
 *     const isAuth = useIsAuthenticated();
 *
 *     useEffect(() => {
 *       if (hasHydrated && !isAuth) router.replace('/login');
 *     }, [hasHydrated, isAuth, router]);
 *
 *     if (!hasHydrated) return <p>Loading...</p>; // hindari hydration mismatch
 *     if (!isAuth) return null;
 *     return <main className='min-h-dvh'>{children}</main>;
 *   }
 * ============================================================ */

export const useIsAuthenticated = () =>
  useAuthStore((s) => s.hasHydrated && Boolean(s.accessToken) && Boolean(s.user));

export const useAuthUser = () => useAuthStore((s) => s.user);

export const getAccessToken = () => useAuthStore.getState().accessToken;

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
