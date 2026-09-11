import { ZodError } from 'zod';

/** @param {Error & {status?:number, code?:string}} error @param {import('express').Request} _request @param {import('express').Response} response @param {import('express').NextFunction} _next */
export function errorHandler(error, _request, response, _next) {
  if (error instanceof ZodError) return response.status(400).json({ error: 'VALIDATION_ERROR', details: error.flatten() });
  const status = error.status ?? 500;
  response.status(status).json({ error: error.code ?? 'INTERNAL_ERROR', message: status < 500 ? error.message : 'An unexpected error occurred.' });
}
