import { ZodError } from 'zod';
import { logger } from '../logger.js';

/** @param {Error & {status?:number, code?:string}} error @param {import('express').Request} _request @param {import('express').Response} response @param {import('express').NextFunction} _next */
export function errorHandler(error, _request, response, _next) {
  if (error instanceof ZodError) {
    const flattened = error.flatten();
    const fieldMsg = Object.entries(flattened.fieldErrors || {})
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('; ');
    const msg = fieldMsg ? `Validation failed: ${fieldMsg}` : 'Validation failed';
    return response.status(400).json({ error: 'VALIDATION_ERROR', message: msg, details: flattened });
  }
  const status = error.status ?? 500;
  if (status >= 500) {
    logger.error({ err: error }, 'Unhandled server error');
  }
  response.status(status).json({ error: error.code ?? 'INTERNAL_ERROR', message: status < 500 ? error.message : 'An unexpected error occurred.' });
}
