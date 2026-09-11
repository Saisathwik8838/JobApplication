/** @param {import('zod').ZodTypeAny} schema @param {'body'|'query'|'params'} [target] */
export function validate(schema, target = 'body') {
  return (request, _response, next) => {
    try { request[target] = schema.parse(request[target]); next(); } catch (error) { next(error); }
  };
}
