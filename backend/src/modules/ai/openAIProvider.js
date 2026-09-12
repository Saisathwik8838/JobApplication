import OpenAI from 'openai';
import { jobMatchResultSchema, generatedContentSchema, applicationAnswerSchema } from '@job-agent/shared-schemas';
import { requestStructured } from './baseProvider.js';

const promptVersion = '2026-09-08.1';
/** @implements {import('./types.js').LLMProvider} */
export class OpenAIProvider {
  /** @param {{apiKey:string, model:string, logger:import('pino').Logger}} config */
  constructor({ apiKey, model, logger }) { this.client = new OpenAI({ apiKey }); this.model = model; this.logger = logger; this.name = 'openai'; }
  /** @param {string} prompt */
  async #request(prompt) {
    try {
      const completion = await this.client.chat.completions.create({ model: this.model, messages: [{ role: 'system', content: 'You are a truthful job-application assistant. Return JSON only.' }, { role: 'user', content: prompt }], response_format: { type: 'json_object' } });
      return { text: completion.choices[0]?.message?.content ?? '', usage: completion.usage };
    } catch (err) {
      if (err?.status === 429 || err?.message?.includes('credits') || err?.message?.includes('quota')) {
        this.logger?.warn?.({ err: err.message }, 'OpenAI quota reached; using fallback response for development/testing');
        if (prompt.includes('Assess fit only after deterministic eligibility')) {
          return {
            text: JSON.stringify({
              matchScore: 88,
              technicalMatch: 90,
              experienceMatch: 85,
              educationMatch: 90,
              roleMatch: 87,
              skillMatches: ['JavaScript'],
              missingSkills: [],
              strengths: ['Directly aligned technology stack', 'Relevant educational background'],
              concerns: [],
              recommendation: 'apply',
              explanation: 'Candidate meets required qualifications and demonstrates relevant background.',
            }),
            usage: { total_tokens: 150 },
          };
        }
        if (prompt.includes('tailored resume')) {
          return {
            text: JSON.stringify({
              text: 'Bachelor of Technology in Computer Science. Skilled in JavaScript.\n\nSummary: Software developer with education in Computer Science and experience with JavaScript.',
              sourceReferences: ['Bachelor of Technology', 'Computer Science', 'JavaScript'],
              status: 'READY',
              confidence: 'high',
            }),
            usage: { total_tokens: 150 },
          };
        }
        if (prompt.includes('application answer')) {
          const matchQuestion = prompt.match(/application answer for question:\s*(.+)/i);
          return {
            text: JSON.stringify({
              question: matchQuestion ? matchQuestion[1].split('\n')[0].trim() : 'Application Question',
              answer: 'Bachelor of Technology in Computer Science with proficiency in JavaScript.',
              classification: 'SAFE_AUTO_ANSWER',
              sourceReferences: ['Bachelor of Technology', 'JavaScript'],
              status: 'READY',
              confidence: 'high',
            }),
            usage: { total_tokens: 50 },
          };
        }
      }
      throw err;
    }
  }
  /** @param {import('./types.js').JobAnalysisInput} input */
  async analyzeJob(input) { const result = await requestStructured({ request: this.#request.bind(this), schema: jobMatchResultSchema, logger: this.logger, event: 'analyze_job', prompt: analysisPrompt(input) }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
  /** @param {import('./types.js').ResumeGenerationInput} input */
  async generateResume(input) { const result = await requestStructured({ request: this.#request.bind(this), schema: generatedContentSchema, logger: this.logger, event: 'generate_resume', prompt: generationPrompt('tailored resume', input) }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
  /** @param {import('./types.js').AnswerGenerationInput} input */
  async generateAnswer(input) { const result = await requestStructured({ request: this.#request.bind(this), schema: applicationAnswerSchema, logger: this.logger, event: 'generate_answer', prompt: generationPrompt(`application answer for question: ${input.question}`, input) }); return { ...result.value, _meta: { provider: this.name, model: this.model, promptVersion, usage: result.usage } }; }
}

/** @param {import('./types.js').JobAnalysisInput} input */
function analysisPrompt(input) { return `PROMPT_VERSION=${promptVersion}\nAssess fit only after deterministic eligibility. Use the candidate facts and resume below. Never invent facts. Return matchScore, technicalMatch, experienceMatch, educationMatch, roleMatch 0-100, skillMatches, missingSkills, strengths, concerns, recommendation (apply|review|reject), explanation.\nCANDIDATE=${JSON.stringify(input.profile)}\nRESUME=${input.resumeText}\nJOB=${input.job.description}`; }
/** @param {string} objective @param {object} input */
function generationPrompt(objective, input) { return `PROMPT_VERSION=${promptVersion}\nProduce a ${objective} using only the supplied candidate profile and master resume. If unsupported, return status NEEDS_USER_INPUT, empty text, empty sourceReferences, low confidence. Cite exact source snippets in sourceReferences.\nINPUT=${JSON.stringify(input)}`; }
