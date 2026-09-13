import { z } from 'zod';

/** @typedef {'DISCOVERED'|'ELIGIBLE'|'MATCHED'|'APPLICATION_PREPARED'|'AWAITING_APPROVAL'|'APPROVED'|'FILLING'|'FILLED_AWAITING_RECHECK'|'RESUBMIT_APPROVED'|'SUBMITTING'|'SUBMITTED'|'REJECTED'|'FAILED'|'NEEDS_USER_INPUT'|'MANUAL_INTERVENTION'} ApplicationStatus */
/** @typedef {{ id:string, company:string, title:string, description:string, location?:string|null, employmentType?:string|null, salary?:string|null, url:string, status:string }} Job */
/** @typedef {{ eligible:boolean, hardFailures:string[], warnings:string[] }} EligibilityResult */
/** @typedef {{ matchScore:number, technicalMatch:number, experienceMatch:number, educationMatch:number, roleMatch:number, skillMatches:string[], missingSkills:string[], strengths:string[], concerns:string[], recommendation:'apply'|'review'|'reject', explanation:string }} JobMatchResult */
/** @typedef {{ text:string, sourceReferences:string[], confidence:'high'|'medium'|'low', status:'READY'|'NEEDS_USER_INPUT' }} GeneratedContent */
/** @typedef {{ candidate: CandidateProfile['candidate'], education: CandidateProfile['education'], experience: CandidateProfile['experience'], skills: CandidateProfile['skills'], projects: CandidateProfile['projects'], preferences: CandidateProfile['preferences'], salary: CandidateProfile['salary'], rules: CandidateProfile['rules'] }} CandidateProfile */

export const applicationStatusSchema = z.enum(['DISCOVERED', 'ELIGIBLE', 'MATCHED', 'APPLICATION_PREPARED', 'AWAITING_APPROVAL', 'APPROVED', 'FILLING', 'FILLED_AWAITING_RECHECK', 'RESUBMIT_APPROVED', 'SUBMITTING', 'SUBMITTED', 'REJECTED', 'FAILED', 'NEEDS_USER_INPUT', 'MANUAL_INTERVENTION']);
export const candidateIdentitySchema = z.object({
  name: z.string().min(1, 'Full name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional().default(''),
  location: z.string().optional().default(''),
  portfolioUrl: z.string().url('Invalid URL').or(z.literal('')).optional().default(''),
  linkedInUrl: z.string().url('Invalid URL').or(z.literal('')).optional().default(''),
  githubUrl: z.string().url('Invalid URL').or(z.literal('')).optional().default(''),
});

export const candidateExperienceSchema = z.object({
  level: z.string().min(1).default('mid'),
  totalYears: z.coerce.number().min(0).max(80).default(0),
  years: z.coerce.number().min(0).max(80).optional(),
});

export const candidatePreferencesSchema = z.object({
  roles: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  minSalary: z.coerce.number().optional(),
  workAuthorization: z.string().optional().default('Indian citizen — no sponsorship required'),
  remote: z.boolean().optional(),
  hybrid: z.boolean().optional(),
  onsite: z.boolean().optional(),
  employment_types: z.array(z.string()).optional(),
});

export const candidateEducationSchema = z.object({
  degree: z.string().optional().default(''),
  branch: z.string().optional().default(''),
  college: z.string().optional().default(''),
  cgpa: z.union([z.string(), z.number()]).optional(),
  graduation_year: z.coerce.number().int().min(1950).max(2100).optional(),
});

export const candidateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  technologies: z.array(z.string()).default([]),
  url: z.string().url().or(z.literal('')).optional(),
});

export const candidateRulesSchema = z.object({
  minimum_match_score: z.coerce.number().min(0).max(100).default(75),
  auto_prepare: z.boolean().default(true),
  require_approval: z.literal(true).default(true),
});

export const candidateProfileSchema = z.object({
  identity: candidateIdentitySchema.optional(),
  candidate: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional().default(''),
    location: z.string().optional().default(''),
    portfolioUrl: z.string().url('Invalid URL').or(z.literal('')).optional().default(''),
    linkedInUrl: z.string().url('Invalid URL').or(z.literal('')).optional().default(''),
    githubUrl: z.string().url('Invalid URL').or(z.literal('')).optional().default(''),
  }).optional(),
  experience: candidateExperienceSchema.default({ level: 'mid', totalYears: 0 }),
  preferences: candidatePreferencesSchema.default({ roles: [], locations: [] }),
  skills: z.union([
    z.array(z.string()),
    z.record(z.string(), z.union([z.array(z.string()), z.string()]))
  ]).default([]),
  education: z.union([
    candidateEducationSchema,
    z.array(candidateEducationSchema)
  ]).optional(),
  projects: z.array(candidateProjectSchema).optional().default([]),
  salary: z.object({
    target: z.union([z.string(), z.number()]).optional(),
    minimum: z.union([z.string(), z.number()]).optional(),
  }).optional(),
  rules: candidateRulesSchema.optional(),
}).superRefine((val, ctx) => {
  if (!val.identity && !val.candidate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Candidate identity with name and email is required',
      path: ['identity'],
    });
  }
}).transform((val) => {
  const sourceIdentity = val.identity || val.candidate;
  const identity = {
    name: sourceIdentity?.name || '',
    email: sourceIdentity?.email || '',
    phone: sourceIdentity?.phone || '',
    location: sourceIdentity?.location || '',
    portfolioUrl: sourceIdentity?.portfolioUrl || '',
    linkedInUrl: sourceIdentity?.linkedInUrl || '',
    githubUrl: sourceIdentity?.githubUrl || '',
  };

  let flatSkills = [];
  if (Array.isArray(val.skills)) {
    flatSkills = val.skills.map((s) => (typeof s === 'string' ? s.trim() : String(s))).filter(Boolean);
  } else if (typeof val.skills === 'object' && val.skills !== null) {
    flatSkills = Object.values(val.skills)
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .map((s) => (typeof s === 'string' ? s.trim() : String(s)))
      .filter(Boolean);
  }

  const expTotalYears = val.experience.totalYears ?? val.experience.years ?? 0;
  const expYears = val.experience.years ?? val.experience.totalYears ?? 0;

  return {
    ...val,
    identity,
    candidate: {
      name: identity.name,
      email: identity.email,
      phone: identity.phone,
      location: identity.location,
      portfolioUrl: identity.portfolioUrl,
      linkedInUrl: identity.linkedInUrl,
      githubUrl: identity.githubUrl,
    },
    experience: {
      level: val.experience.level || 'mid',
      totalYears: expTotalYears,
      years: expYears,
    },
    preferences: {
      ...val.preferences,
      workAuthorization: val.preferences.workAuthorization || 'Indian citizen — no sponsorship required',
    },
    skills: flatSkills,
  };
});

export const eligibilityResultSchema = z.object({ eligible: z.boolean(), hardFailures: z.array(z.string()), warnings: z.array(z.string()) });
export const jobMatchResultSchema = z.object({
  matchScore: z.number().min(0).max(100), technicalMatch: z.number().min(0).max(100), experienceMatch: z.number().min(0).max(100), educationMatch: z.number().min(0).max(100), roleMatch: z.number().min(0).max(100),
  skillMatches: z.array(z.string()), missingSkills: z.array(z.string()), strengths: z.array(z.string()), concerns: z.array(z.string()), recommendation: z.enum(['apply', 'review', 'reject']), explanation: z.string().min(1)
});
export const generatedContentSchema = z.object({ text: z.string(), sourceReferences: z.array(z.string()), confidence: z.enum(['high', 'medium', 'low']), status: z.enum(['READY', 'NEEDS_USER_INPUT']) });
export const jobCreateSchema = z.object({ source: z.string().min(1), sourceJobId: z.string().optional(), company: z.string().min(1), title: z.string().min(1), description: z.string().min(1), location: z.string().nullable().optional(), employmentType: z.string().nullable().optional(), salary: z.string().nullable().optional(), url: z.string().url(), postedAt: z.coerce.date().nullable().optional() });
export const jobsQuerySchema = z.object({
  status: z.string().optional(),
  company: z.string().optional(),
  titleQuery: z.string().optional(),
  keyword: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  minMatchScore: z.coerce.number().min(0).max(100).optional(),
  showAll: z.union([z.boolean(), z.string()]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export const applicationAnswerSchema = z.object({ question: z.string().min(1), answer: z.string().nullable(), classification: z.enum(['SAFE_AUTO_ANSWER', 'USER_PROFILE_REQUIRED', 'SENSITIVE', 'UNKNOWN']), status: z.enum(['READY', 'NEEDS_USER_INPUT']), confidence: z.enum(['high', 'medium', 'low']) });
export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
});
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});
export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Credential is required'),
});
