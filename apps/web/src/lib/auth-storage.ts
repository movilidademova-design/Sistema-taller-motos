export interface StoredUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'TECHNICIAN' | 'CLIENT' | null;
  posRole: 'ADMIN' | 'CASHIER' | null;
}

const ACCESS_TOKEN_KEY = 'taller_access_token';
const REFRESH_TOKEN_KEY = 'taller_refresh_token';
const USER_KEY = 'taller_user';
const BRANCH_ID_KEY = 'taller_branch_id';

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
  getBranchId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(BRANCH_ID_KEY);
  },
  setBranchId(branchId: string) {
    localStorage.setItem(BRANCH_ID_KEY, branchId);
  },
  clearBranchId() {
    localStorage.removeItem(BRANCH_ID_KEY);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(BRANCH_ID_KEY);
  },
};
