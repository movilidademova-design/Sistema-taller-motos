import { authStorage } from './auth-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        authStorage.setSession(data.accessToken, data.refreshToken, data.user);
        return data.accessToken as string;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  isFormData?: boolean;
  skipAuthRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, isFormData, skipAuthRetry, headers, ...rest } = options;
  const token = authStorage.getAccessToken();
  const branchId = authStorage.getBranchId();

  const finalHeaders: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { 'X-Branch-Id': branchId } : {}),
    ...(headers as Record<string, string>),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body ? (isFormData ? (body as FormData) : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401 && !skipAuthRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
    authStorage.clear();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError('Sesión expirada', 401);
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const errBody = await res.json();
      message = Array.isArray(errBody.message) ? errBody.message.join(', ') : errBody.message ?? message;
    } catch {
      // ignore parse errors, keep statusText
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: formData, isFormData: true }),
};

export function apiFileUrl(path: string) {
  return `${API_URL}${path}`;
}

export async function fetchAuthedBlob(path: string): Promise<Blob> {
  const token = authStorage.getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  return res.blob();
}

export function openAuthedBlobInNewTab(path: string) {
  return fetchAuthedBlob(path).then((blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  });
}

/** Lee el nombre de archivo que propone el servidor en Content-Disposition. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^"]+)"?/.exec(header);
  return match ? match[1] : null;
}

/**
 * Descarga un archivo generado por el backend (Excel, PDF) respetando la sesión
 * y la sucursal activa, y disparando el "Guardar como" del navegador.
 *
 * No reutiliza `request()` porque ese parsea la respuesta como JSON; aquí el
 * cuerpo es binario. Sí replica su manejo de 401 y de mensajes de error.
 */
export async function downloadFile(
  path: string,
  fallbackFilename: string,
  options: { skipAuthRetry?: boolean } = {},
): Promise<void> {
  const token = authStorage.getAccessToken();
  const branchId = authStorage.getBranchId();

  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(branchId ? { 'X-Branch-Id': branchId } : {}),
    },
  });

  if (res.status === 401 && !options.skipAuthRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return downloadFile(path, fallbackFilename, { skipAuthRetry: true });
    }
    authStorage.clear();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError('Sesión expirada', 401);
  }

  if (!res.ok) {
    // El backend responde JSON en los errores aunque la ruta devuelva binario
    // en el camino feliz — de ahí sale el aviso del tope de filas.
    let message = res.statusText;
    try {
      const errBody = await res.json();
      message = Array.isArray(errBody.message)
        ? errBody.message.join(', ')
        : (errBody.message ?? message);
    } catch {
      // ignore parse errors, keep statusText
    }
    throw new ApiError(message, res.status);
  }

  const blob = await res.blob();
  const filename =
    filenameFromDisposition(res.headers.get('Content-Disposition')) ??
    fallbackFilename;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
