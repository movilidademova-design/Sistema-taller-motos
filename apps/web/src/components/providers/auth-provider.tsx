'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { authStorage, StoredUser } from '@/lib/auth-storage';

interface AuthContextValue {
  user: StoredUser | null;
  isLoading: boolean;
  activeStoreId: string | null;
  setActiveStore: (storeId: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  registerTenant: (payload: {
    workshopName: string;
    slug: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

interface AuthResponse {
  user: StoredUser;
  accessToken: string;
  refreshToken: string;
}

/** `null` = "todas las tiendas" (solo válido para ADMIN). */
function resolveActiveStore(user: StoredUser): string | null {
  const stored = authStorage.getActiveStoreId();
  if (stored === 'all') return user.role === 'ADMIN' ? null : (user.stores[0]?.id ?? null);
  if (stored && user.stores.some((s) => s.id === stored)) return stored;
  if (user.role === 'ADMIN') return null;
  return user.stores[0]?.id ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeStoreId, setActiveStoreId] = React.useState<string | null>(null);
  const router = useRouter();

  const applySession = React.useCallback((sessionUser: StoredUser) => {
    setUser(sessionUser);
    const resolved = resolveActiveStore(sessionUser);
    authStorage.setActiveStoreId(resolved);
    setActiveStoreId(resolved);
  }, []);

  React.useEffect(() => {
    // One-time hydration from localStorage, which only exists client-side.
    const stored = authStorage.getUser();
    const token = authStorage.getAccessToken();
    if (stored && token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(stored);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveStoreId(resolveActiveStore(stored));
    }
    setIsLoading(false);
  }, []);

  const setActiveStore = React.useCallback((storeId: string | null) => {
    authStorage.setActiveStoreId(storeId);
    setActiveStoreId(storeId);
  }, []);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const data = await api.post<AuthResponse>('/auth/login', { email, password });
      authStorage.setSession(data.accessToken, data.refreshToken, data.user);
      applySession(data.user);
      router.push('/dashboard');
    },
    [router, applySession],
  );

  const registerTenant = React.useCallback(
    async (payload: {
      workshopName: string;
      slug: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }) => {
      const data = await api.post<AuthResponse>('/auth/register-tenant', payload);
      authStorage.setSession(data.accessToken, data.refreshToken, data.user);
      applySession(data.user);
      router.push('/dashboard');
    },
    [router, applySession],
  );

  const logout = React.useCallback(async () => {
    const refreshToken = authStorage.getRefreshToken();
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // best-effort revoke; proceed with local logout regardless
    }
    authStorage.clear();
    setUser(null);
    setActiveStoreId(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, activeStoreId, setActiveStore, login, registerTenant, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ocurrió un error inesperado';
}
