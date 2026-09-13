import Anthropic from '@anthropic-ai/sdk';
import { jobMatchResultSchema, generatedContentSchema, applicationAnswerSchema } from '@job-agent/shared-schemas';
import { requestStructured } from './baseProvider.js';
import { LLMAuthError, LLMRateLimitError } from './errors.js';

const promptVersion = '2026-09-08.1';
/** @implements {import('./types.js').LLMProvider} */
export class ClaudeProvider {
  /** @param {{apiKey:string, model:string, logger:import('pino').Logger}} config */
  constructor({ apiKey, model, logger }) { this.client = new Anthropic({ apiKey }); this.model = model; this.logger = logger; this.name = 'anthropic'; }
  /** @param {string} prompt */
  async #request(prompt) {
    try {
      const response = await this.client.messages.create({ model: this.model, max_tokens: 1400, system: 'You are a truthful job-application assistant. Return valid JSON only.', messages: [{ role: 'user', content: prompt }] });
      const block = response.content.find((item) => item.type === 'text');
      return { text: block?.text ?? '', usage: response.usage };
    } catch (err) {
      if (err?.status === 401 || err?.message?.toLowerCase().includes('api key') || err?.message?.toLowerCase().includes('unauthorized')) {
        throw new LLMAuthError(`Invalid Anthropic API key: ${err.message}`, err);
      }
      if (err?.status === 429 || err?.message?.includes('credits') || err?.message?.includes('rate limit')) {
        throw new LLMRateLimitError(`Anthropic rate limit or quota exceeded: ${err.message}`, err);
      }
      throw err;
    }
  }
  /** @param {import('./types.js').JobAnalysisInput} input */
  async analyzeJob(input) {
    let prompt = `PROMPT_VERSION=${promptVersion}\nAssess this candidate/job match. Use only facts. Return JSON: matchScore, technicalMatch, experienceMatch, educationMatch, roleMatch (0-100), skillMatches, missingSkills, strengths, concerns, recommendation apply|review|reject, explanation.\nCANDIDATE=${JSON.stringify(input.profile)}\nRESUME=${input.resumeText}\nJOB=Title: ${input.job.title || 'N/A'}\nCompany: ${input.job.company || 'N/A'}\nEmployment Type: ${input.job.employmentType ?? 'N/A'}\nDescription: ${input.job.description}`;
    if (input.strictRetry) {
      prompt += `\n\nCRITICAL: Your previous response was invalid. You MUST return a valid JSON object matching the exact schema with all fields: matchScore, technicalMatch, experienceMatch, educationMatch, roleMatch (numbers 0-100), skillMatches, missingSkills, strengths, concerns, recommendation (apply, review, or reject), and explanation.`;
    }
    const result = await requestStructured({ request: this.#request.bind(this), schema: jobMatchResultSchema, prompt, logger: this.logger, event: 'analyze_job' });
    return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } };
  }
  /** @param {import('./types.js').ResumeGenerationInput} input */
  async generateResume(input) { const result = await requestStructured({ request: this.#request.bind(this), schema: generatedContentSchema, logger: this.logger, event: 'generate_resume', prompt: `PROMPT_VERSION=${promptVersion}\nGenerate a tailored resume only from this source. Cite exact source snippets. Every item in sourceReferences must be copied VERBATIM from the candidate facts or master resume text without paraphrasing or expanding abbreviations. JSON required.\n${JSON.stringify(input)}` }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
  /** @param {import('./types.js').AnswerGenerationInput} input */
  async generateAnswer(input) { const result = await requestStructured({ request: this.#request.bind(this), schema: applicationAnswerSchema, logger: this.logger, event: 'generate_answer', prompt: `PROMPT_VERSION=${promptVersion}\nAnswer only if supported by sources; otherwise NEEDS_USER_INPUT. Every item in sourceReferences must be copied VERBATIM from source facts. JSON required.\n${JSON.stringify(input)}` }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
}
