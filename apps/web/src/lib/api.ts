const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let getTokenFn: (() => Promise<string | null>) | null = null;
let impersonateClientId: string | null = null;

export function setAuthTokenFn(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

export function setImpersonateClientId(clientId: string | null) {
  impersonateClientId = clientId;
}

export function getImpersonateClientId(): string | null {
  return impersonateClientId;
}

export async function api<T>(
  endpoint: string,
  options: RequestInit & {
    params?: Record<string, string | number | boolean | undefined | null>;
    responseType?: 'json' | 'blob';
    skipImpersonation?: boolean;
  } = {}
): Promise<T> {
  const { params, responseType = 'json', skipImpersonation, ...init } = options;

  // Build URL with query params.
  // v1.17.31: arrays serialize as repeated query params
  // (`?k=A&k=B`) instead of `String([A, B])` which produced CSV
  // (`?k=A,B`) and shredded any value containing a comma. See
  // docs/findings/splitcsv-comma-bug-2026-06-09.md.
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((v) => {
          if (v !== undefined && v !== null) searchParams.append(key, String(v));
        });
      } else {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  // Get auth token
  const token = getTokenFn ? await getTokenFn() : null;

  // Only set Content-Type for requests with a body (and not FormData)
  const headers: Record<string, string> = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(!skipImpersonation && impersonateClientId && { 'X-Impersonate-Client': impersonateClientId }),
  };
  if (init.body && typeof init.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  // Handle 204 No Content responses (common for DELETE operations)
  if (response.status === 204) {
    return undefined as T;
  }

  // Handle blob responses (for file downloads)
  if (responseType === 'blob') {
    const blob = await response.blob();
    return blob as T;
  }

  // Parse JSON response, with fallback for empty bodies
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid API response');
  }
}

export const apiClient = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined | null>, options?: { skipImpersonation?: boolean }) =>
    api<T>(endpoint, { method: 'GET', params, skipImpersonation: options?.skipImpersonation }),
  post: <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) =>
    api<T>(endpoint, { method: 'DELETE' }),
};
