/** @typedef {{profile: import('@job-agent/shared-schemas').CandidateProfile, resumeText:string, job:{description:string,title?:string,company?:string}}} JobAnalysisInput */
/** @typedef {{profile: import('@job-agent/shared-schemas').CandidateProfile, resumeText:string, job:{description:string,title?:string,company?:string}}} ResumeGenerationInput */
/** @typedef {{profile: import('@job-agent/shared-schemas').CandidateProfile, resumeText:string, job:{description:string}, question:string}} AnswerGenerationInput */
/** @typedef {Object} LLMProvider
 * @property {(input: JobAnalysisInput) => Promise<import('@job-agent/shared-schemas').JobMatchResult>} analyzeJob
 * @property {(input: ResumeGenerationInput) => Promise<import('@job-agent/shared-schemas').GeneratedContent>} generateResume
 * @property {(input: AnswerGenerationInput) => Promise<import('@job-agent/shared-schemas').ApplicationAnswer>} generateAnswer
 */
export {};
