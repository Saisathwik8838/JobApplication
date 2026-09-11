/** @param {import('express').Request} _request @param {import('express').Response} response */
export function notFound(_request, response) { response.status(404).json({ error: 'NOT_FOUND' }); }
