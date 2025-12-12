const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let getTokenFn: (() => Promise<string | null>) | null = null;

export function setAuthTokenFn(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

export async function api<T>(
  endpoint: string,
  options: RequestInit & { params?: Record<string, string | number | boolean | undefined | null> } = {}
): Promise<T> {
  const { params, ...init } = options;

  // Build URL with query params
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
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

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `API Error: ${response.status}`);
  }

  return response.json();
}

export const apiClient = {
  get: <T>(endpoint: string, params?: Record<string, string | number | boolean | undefined | null>) =>
    api<T>(endpoint, { method: 'GET', params }),
  post: <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: unknown) =>
    api<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) =>
    api<T>(endpoint, { method: 'DELETE' }),
};
