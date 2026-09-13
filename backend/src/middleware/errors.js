import { ZodError } from 'zod';
import { logger } from '../logger.js';

const EXPOSED_ERROR_CODES = new Set([
  'LLM_AUTH_ERROR',
  'LLM_RATE_LIMIT',
  'LLM_VALIDATION_ERROR',
  'LLM_ERROR',
  'LLM_CONFIGURATION_ERROR',
  'VALIDATION_ERROR',
  'CONFIG_ERROR',
  'JOB_NOT_FOUND',
  'APPLICATION_NOT_FOUND',
  'INVALID_CREDENTIALS',
  'EMAIL_ALREADY_EXISTS',
  'PROFILE_NOT_FOUND',
]);

/**
 * @param {Error & {status?:number, code?:string, details?:any, expose?:boolean}} error
 * @param {import('express').Request} _request
 * @param {import('express').Response} response
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(error, _request, response, _next) {
  if (error instanceof ZodError) {
    const flattened = error.flatten();
    const fieldMsg = Object.entries(flattened.fieldErrors || {})
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('; ');
    const msg = fieldMsg ? `Validation failed: ${fieldMsg}` : 'Validation failed';
    return response.status(400).json({ error: 'VALIDATION_ERROR', message: msg, details: flattened });
  }

  const status = error.status ?? (error.code?.startsWith('LLM_') ? 502 : 500);
  if (status >= 500) {
    logger.error({ err: error }, 'Unhandled or gateway server error');
  }

  const isExposed =
    status < 500 ||
    error.expose ||
    (error.code && EXPOSED_ERROR_CODES.has(error.code)) ||
    error.code?.startsWith('LLM_');

  response.status(status).json({
    error: error.code ?? 'INTERNAL_ERROR',
    message: isExposed ? error.message : 'An unexpected error occurred.',
    details: error.details ?? undefined,
  });
}
