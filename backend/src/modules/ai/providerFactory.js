import { OpenAIProvider } from './openAIProvider.js';
import { ClaudeProvider } from './claudeProvider.js';

/** @param {{LLM_PROVIDER:'openai'|'anthropic', OPENAI_API_KEY?:string, ANTHROPIC_API_KEY?:string, LLM_MODEL:string, logger:import('pino').Logger}} config */
export function getLLMProvider(config) {
  if (config.LLM_PROVIDER === 'openai') return new OpenAIProvider({ apiKey: config.OPENAI_API_KEY, model: config.LLM_MODEL, logger: config.logger });
  if (config.LLM_PROVIDER === 'anthropic') return new ClaudeProvider({ apiKey: config.ANTHROPIC_API_KEY, model: config.LLM_MODEL, logger: config.logger });
  throw new Error(`Unsupported LLM provider: ${config.LLM_PROVIDER}`);
}
