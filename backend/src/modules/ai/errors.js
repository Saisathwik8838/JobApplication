export class LLMValidationError extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) { super(message, { cause }); this.name = 'LLMValidationError'; this.code = 'LLM_VALIDATION_ERROR'; }
}
