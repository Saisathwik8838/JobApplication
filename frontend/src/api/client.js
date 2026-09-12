const base = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * @param {string} path
 * @param {RequestInit} [init]
 */
export async function api(path, init = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${base}${path}`, {
    headers: {
      'content-type': 'application/json',
      ...authHeaders,
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 401) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    if (
      typeof window !== 'undefined' &&
      window.location &&
      !window.location.pathname.startsWith('/login') &&
      !window.location.pathname.startsWith('/signup')
    ) {
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Request failed (${response.status})`);
  }

  return response.status === 204 ? null : response.json();
}

export const get = (path) => api(path);
export const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });
export const put = (path, body = {}) => api(path, { method: 'PUT', body: JSON.stringify(body) });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del = (path) => api(path, { method: 'DELETE' });

export function setAuth(token, user) {
  if (typeof localStorage !== 'undefined') {
    if (token) localStorage.setItem('token', token);
    if (user) localStorage.setItem('user', JSON.stringify(user));
  }
}

export function clearAuth() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}

export function getStoredUser() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

export function getToken() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('token');
}
