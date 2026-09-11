import Anthropic from '@anthropic-ai/sdk';
import { jobMatchResultSchema, generatedContentSchema, applicationAnswerSchema } from '@job-agent/shared-schemas';
import { requestStructured } from './baseProvider.js';

const promptVersion = '2026-09-08.1';
/** @implements {import('./types.js').LLMProvider} */
export class ClaudeProvider {
  /** @param {{apiKey:string, model:string, logger:import('pino').Logger}} config */
  constructor({ apiKey, model, logger }) { this.client = new Anthropic({ apiKey }); this.model = model; this.logger = logger; this.name = 'anthropic'; }
  /** @param {string} prompt */
  async #request(prompt) { const response = await this.client.messages.create({ model: this.model, max_tokens: 1400, system: 'You are a truthful job-application assistant. Return valid JSON only.', messages: [{ role: 'user', content: prompt }] }); const block = response.content.find((item) => item.type === 'text'); return { text: block?.text ?? '', usage: response.usage }; }
  /** @param {import('./types.js').JobAnalysisInput} input */
  async analyzeJob(input) { const prompt = `PROMPT_VERSION=${promptVersion}\nAssess this candidate/job match. Use only facts. Return JSON: matchScore, technicalMatch, experienceMatch, educationMatch, roleMatch (0-100), skillMatches, missingSkills, strengths, concerns, recommendation apply|review|reject, explanation.\nCANDIDATE=${JSON.stringify(input.profile)}\nRESUME=${input.resumeText}\nJOB=${input.job.description}`; const result = await requestStructured({ request: this.#request.bind(this), schema: jobMatchResultSchema, prompt, logger: this.logger, event: 'analyze_job' }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
  /** @param {import('./types.js').ResumeGenerationInput} input */
  async generateResume(input) { const result = await requestStructured({ request: this.#request.bind(this), schema: generatedContentSchema, logger: this.logger, event: 'generate_resume', prompt: `PROMPT_VERSION=${promptVersion}\nGenerate a tailored resume only from this source. Cite exact source snippets. JSON required.\n${JSON.stringify(input)}` }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
  /** @param {import('./types.js').AnswerGenerationInput} input */
  async generateAnswer(input) { const result = await requestStructured({ request: this.#request.bind(this), schema: applicationAnswerSchema, logger: this.logger, event: 'generate_answer', prompt: `PROMPT_VERSION=${promptVersion}\nAnswer only if supported by sources; otherwise NEEDS_USER_INPUT. JSON required.\n${JSON.stringify(input)}` }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
}
