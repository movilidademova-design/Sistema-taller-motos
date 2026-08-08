'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { authStorage, StoredUser } from '@/lib/auth-storage';
import type { Branch } from '@/lib/types';

interface AuthContextValue {
  user: StoredUser | null;
  isLoading: boolean;
  branches: Branch[];
  currentBranchId: string | null;
  setCurrentBranchId: (branchId: string) => void;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<StoredUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    // One-time hydration from localStorage, which only exists client-side.
    const stored = authStorage.getUser();
    const token = authStorage.getAccessToken();
    if (stored && token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUser(stored);
    }
    setIsLoading(false);
  }, []);

  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchIdState] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) {
      setBranches([]);
      setCurrentBranchIdState(null);
      return;
    }
    let ignore = false;
    api
      .get<Branch[]>('/users/me/branches')
      .then((fetched) => {
        if (ignore) return;
        setBranches(fetched);
        const stored = authStorage.getBranchId();
        const validStored = stored && fetched.some((b) => b.id === stored) ? stored : null;
        const resolved = validStored ?? (fetched.length > 0 ? fetched[0].id : null);
        if (resolved) {
          authStorage.setBranchId(resolved);
          setCurrentBranchIdState(resolved);
        } else {
          authStorage.clearBranchId();
          setCurrentBranchIdState(null);
        }
      })
      .catch(() => {
        // Best-effort: leave branches/currentBranchId as-is on failure. A branch-scoped
        // page hitting a stale/missing X-Branch-Id will surface its own clear error.
      });
    return () => {
      ignore = true;
    };
  }, [user]);

  const setCurrentBranchId = React.useCallback((branchId: string) => {
    authStorage.setBranchId(branchId);
    setCurrentBranchIdState(branchId);
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const data = await api.post<AuthResponse>('/auth/login', { email, password });
      authStorage.setSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
      // A la raíz, no al panel del taller: `/` decide según los accesos que
      // tenga esta persona, y un cajero no tiene nada que hacer en /dashboard.
      router.push('/');
    },
    [router],
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
      setUser(data.user);
      // A la raíz, no al panel del taller: `/` decide según los accesos que
      // tenga esta persona, y un cajero no tiene nada que hacer en /dashboard.
      router.push('/');
    },
    [router],
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
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        branches,
        currentBranchId,
        setCurrentBranchId,
        login,
        registerTenant,
        logout,
      }}
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
