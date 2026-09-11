import { z } from 'zod';

/** @typedef {'DISCOVERED'|'ELIGIBLE'|'MATCHED'|'APPLICATION_PREPARED'|'AWAITING_APPROVAL'|'APPROVED'|'FILLING'|'FILLED_AWAITING_RECHECK'|'RESUBMIT_APPROVED'|'SUBMITTING'|'SUBMITTED'|'REJECTED'|'FAILED'|'NEEDS_USER_INPUT'|'MANUAL_INTERVENTION'} ApplicationStatus */
/** @typedef {{ id:string, company:string, title:string, description:string, location?:string|null, employmentType?:string|null, salary?:string|null, url:string, status:string }} Job */
/** @typedef {{ eligible:boolean, hardFailures:string[], warnings:string[] }} EligibilityResult */
/** @typedef {{ matchScore:number, technicalMatch:number, experienceMatch:number, educationMatch:number, roleMatch:number, skillMatches:string[], missingSkills:string[], strengths:string[], concerns:string[], recommendation:'apply'|'review'|'reject', explanation:string }} JobMatchResult */
/** @typedef {{ text:string, sourceReferences:string[], confidence:'high'|'medium'|'low', status:'READY'|'NEEDS_USER_INPUT' }} GeneratedContent */
/** @typedef {{ candidate: CandidateProfile['candidate'], education: CandidateProfile['education'], experience: CandidateProfile['experience'], skills: CandidateProfile['skills'], projects: CandidateProfile['projects'], preferences: CandidateProfile['preferences'], salary: CandidateProfile['salary'], rules: CandidateProfile['rules'] }} CandidateProfile */

export const applicationStatusSchema = z.enum(['DISCOVERED', 'ELIGIBLE', 'MATCHED', 'APPLICATION_PREPARED', 'AWAITING_APPROVAL', 'APPROVED', 'FILLING', 'FILLED_AWAITING_RECHECK', 'RESUBMIT_APPROVED', 'SUBMITTING', 'SUBMITTED', 'REJECTED', 'FAILED', 'NEEDS_USER_INPUT', 'MANUAL_INTERVENTION']);
export const candidateProfileSchema = z.object({
  candidate: z.object({ name: z.string().min(1), email: z.string().email(), phone: z.string().min(3), location: z.string().min(1) }),
  education: z.object({ degree: z.string().min(1), branch: z.string().min(1), college: z.string().min(1), cgpa: z.union([z.string(), z.number()]).optional(), graduation_year: z.coerce.number().int().min(1950).max(2100) }),
  experience: z.object({ years: z.coerce.number().min(0).max(80), level: z.string().min(1) }),
  skills: z.object({ programming: z.array(z.string()), backend: z.array(z.string()), cloud: z.array(z.string()), devops: z.array(z.string()), databases: z.array(z.string()), ai: z.array(z.string()), frontend: z.array(z.string()), core_cs: z.array(z.string()) }),
  projects: z.array(z.object({ name: z.string().min(1), description: z.string().min(1), technologies: z.array(z.string()).default([]), url: z.string().url().optional() })).default([]),
  preferences: z.object({ roles: z.array(z.string()), locations: z.array(z.string()), remote: z.boolean(), hybrid: z.boolean(), onsite: z.boolean(), employment_types: z.array(z.string()) }),
  salary: z.object({ target: z.union([z.string(), z.number()]).optional(), minimum: z.union([z.string(), z.number()]).optional() }),
  rules: z.object({ minimum_match_score: z.coerce.number().min(0).max(100), auto_prepare: z.boolean(), require_approval: z.literal(true) })
}).strict();

export const eligibilityResultSchema = z.object({ eligible: z.boolean(), hardFailures: z.array(z.string()), warnings: z.array(z.string()) });
export const jobMatchResultSchema = z.object({
  matchScore: z.number().min(0).max(100), technicalMatch: z.number().min(0).max(100), experienceMatch: z.number().min(0).max(100), educationMatch: z.number().min(0).max(100), roleMatch: z.number().min(0).max(100),
  skillMatches: z.array(z.string()), missingSkills: z.array(z.string()), strengths: z.array(z.string()), concerns: z.array(z.string()), recommendation: z.enum(['apply', 'review', 'reject']), explanation: z.string().min(1)
});
export const generatedContentSchema = z.object({ text: z.string(), sourceReferences: z.array(z.string()), confidence: z.enum(['high', 'medium', 'low']), status: z.enum(['READY', 'NEEDS_USER_INPUT']) });
export const jobCreateSchema = z.object({ source: z.string().min(1), sourceJobId: z.string().optional(), company: z.string().min(1), title: z.string().min(1), description: z.string().min(1), location: z.string().nullable().optional(), employmentType: z.string().nullable().optional(), salary: z.string().nullable().optional(), url: z.string().url(), postedAt: z.coerce.date().nullable().optional() });
export const jobsQuerySchema = z.object({ status: z.string().optional(), page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(25) });
export const applicationAnswerSchema = z.object({ question: z.string().min(1), answer: z.string().nullable(), classification: z.enum(['SAFE_AUTO_ANSWER', 'USER_PROFILE_REQUIRED', 'SENSITIVE', 'UNKNOWN']), status: z.enum(['READY', 'NEEDS_USER_INPUT']), confidence: z.enum(['high', 'medium', 'low']) });
