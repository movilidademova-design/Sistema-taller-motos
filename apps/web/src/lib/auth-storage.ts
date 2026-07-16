export interface StoredStore {
  id: string;
  name: string;
  code: string;
}

export interface StoredUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'TECHNICIAN' | 'VIEWER';
  stores: StoredStore[];
  /** Calculado por el backend (rol + overrides individuales) — nunca se recalcula en el frontend. */
  permissions: Record<string, boolean>;
}

const ACCESS_TOKEN_KEY = 'taller_access_token';
const REFRESH_TOKEN_KEY = 'taller_refresh_token';
const USER_KEY = 'taller_user';
const ACTIVE_STORE_KEY = 'taller_active_store';

export const authStorage = {
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  getUser(): StoredUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  },
  setSession(accessToken: string, refreshToken: string, user: StoredUser) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  setAccessToken(accessToken: string) {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  },
  getActiveStoreId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_STORE_KEY);
  },
  setActiveStoreId(storeId: string | null) {
    if (storeId === null) {
      localStorage.setItem(ACTIVE_STORE_KEY, 'all');
    } else {
      localStorage.setItem(ACTIVE_STORE_KEY, storeId);
    }
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACTIVE_STORE_KEY);
  },
};
