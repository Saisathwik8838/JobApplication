import { LLMValidationError } from './errors.js';

/** @param {string} raw @returns {unknown} */
export function parseJsonResponse(raw) {
  const candidate = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(candidate);
}

/** Bounded structured-output retry. @param {{request:(prompt:string)=>Promise<{text:string,usage?:object}>, schema:import('zod').ZodTypeAny, prompt:string, logger:import('pino').Logger, event:string}} input */
export async function requestStructured({ request, schema, prompt, logger, event }) {
  let finalError;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      const strictness = attempt ? '\nReturn only valid JSON matching the required schema. Do not add prose or markdown.' : '';
      const response = await request(`${prompt}${strictness}`);
      const value = schema.parse(parseJsonResponse(response.text));
      logger.info({ event, attempt, usage: response.usage }, 'Structured LLM response accepted');
      return { value, usage: response.usage ?? null };
    } catch (error) {
      finalError = error;
      if (
        error?.code === 'LLM_AUTH_ERROR' ||
        error?.code === 'LLM_RATE_LIMIT' ||
        error?.status === 401 ||
        error?.status === 429
      ) {
        throw error;
      }
      logger.warn({ event, attempt, error: error.message }, 'Invalid structured LLM response');
    }
  }
  const rootReason = finalError?.message ? `: ${finalError.message}` : '';
  throw new LLMValidationError(`Model returned invalid structured output after three attempts${rootReason}`, finalError);
}
