const base = import.meta.env.VITE_API_BASE_URL ?? '';
/** @param {string} path @param {RequestInit} [init] */
export async function api(path, init = {}) { const response = await fetch(`${base}${path}`, { headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }, ...init }); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message ?? body.error ?? `Request failed (${response.status})`); } return response.status === 204 ? null : response.json(); }
export const get = (path) => api(path); export const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) }); export const patch = (path, body = {}) => api(path, { method: 'PATCH', body: JSON.stringify(body) });
