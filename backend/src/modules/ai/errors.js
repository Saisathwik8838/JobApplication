export class LLMValidationError extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'LLMValidationError';
    this.code = 'LLM_VALIDATION_ERROR';
    this.status = 422;
    this.expose = true;
  }
}

export class LLMAuthError extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'LLMAuthError';
    this.code = 'LLM_AUTH_ERROR';
    this.status = 502;
    this.expose = true;
  }
}

export class LLMRateLimitError extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'LLMRateLimitError';
    this.code = 'LLM_RATE_LIMIT';
    this.status = 429;
    this.expose = true;
  }
}

export class LLMConfigurationError extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'LLMConfigurationError';
    this.code = 'LLM_CONFIGURATION_ERROR';
    this.status = 500;
    this.expose = true;
  }
}

export class LLMResponseInvalidError extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'LLMResponseInvalidError';
    this.code = 'LLM_RESPONSE_INVALID';
    this.status = 422;
    this.expose = true;
  }
}

export class LLMProviderError extends Error {
  /** @param {string} message @param {unknown} [cause] */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'LLMProviderError';
    this.code = 'LLM_PROVIDER_ERROR';
    this.status = 502;
    this.expose = true;
  }
}
