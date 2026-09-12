import { describe, expect, it } from 'vitest';
import { evaluateEligibility, extractSeniorityTier } from '../../src/modules/eligibility/eligibilityEngine.js';

const profile = {
  candidate: { name: 'Test User', email: 'test@example.com', phone: '1', location: 'Bengaluru' },
  education: { degree: 'Bachelor of Technology', branch: 'Computer Science', college: 'Test', graduation_year: 2026 },
  experience: { years: 0, level: 'Entry level' },
  skills: { programming: ['JavaScript'], backend: [], cloud: [], devops: [], databases: [], ai: [], frontend: [], core_cs: [] },
  projects: [],
  preferences: { roles: ['Frontend Developer', 'Full Stack Engineer'], locations: [], remote: true, hybrid: true, onsite: false, employment_types: [] },
  salary: {},
  rules: { minimum_match_score: 75, auto_prepare: true, require_approval: true },
};

describe('eligibility engine', () => {
  it('rejects a five-year role for a zero-year profile without an LLM', () => {
    const result = evaluateEligibility(profile, {
      title: 'Full Stack Engineer',
      description: 'At least 5 years of experience is required.',
      location: 'Remote',
    });
    expect(result.eligible).toBe(false);
    expect(result.hardFailures.join(' ')).toContain('5+ years');
  });

  it('allows a compatible entry-level role', () => {
    const result = evaluateEligibility(profile, {
      title: 'Junior Frontend Developer',
      description: 'Bachelor’s degree preferred.',
      location: 'Remote',
    });
    expect(result.eligible).toBe(true);
  });

  it('hard-fails a Senior role for an entry-level profile without numeric years in body', () => {
    const result = evaluateEligibility(profile, {
      title: 'Senior Backend Engineer',
      description: 'We are looking for someone to build APIs in JavaScript.',
      location: 'Remote',
    });
    expect(result.eligible).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('senior'))).toBe(true);
  });

  it('hard-fails a Staff/Principal/Lead role for an entry-level profile', () => {
    const result = evaluateEligibility(profile, {
      title: 'Staff Platform Architect',
      description: 'Design distributed architectures using JavaScript and SQL.',
      location: 'Remote',
    });
    expect(result.eligible).toBe(false);
    expect(result.hardFailures.some((f) => f.includes('senior_plus'))).toBe(true);
  });

  it('allows an unspecified-seniority or junior title for entry profile', () => {
    const result = evaluateEligibility(profile, {
      title: 'Software Engineer',
      description: 'Join our team writing JavaScript code.',
      location: 'Remote',
    });
    expect(result.eligible).toBe(true);
  });

  it('surfaces a warning when job title does not match candidate preferred roles', () => {
    const result = evaluateEligibility(profile, {
      title: 'Data Analyst',
      description: 'Analyze data with SQL and JavaScript.',
      location: 'Remote',
    });
    expect(result.warnings.some((w) => w.includes('preferred roles'))).toBe(true);
  });

  it('correctly classifies seniority tiers', () => {
    expect(extractSeniorityTier('Junior Web Developer')).toBe('entry');
    expect(extractSeniorityTier('Intern - Software Development')).toBe('entry');
    expect(extractSeniorityTier('Software Engineer')).toBe('mid');
    expect(extractSeniorityTier('Senior Full Stack Engineer')).toBe('senior');
    expect(extractSeniorityTier('Sr. Node.js Developer')).toBe('senior');
    expect(extractSeniorityTier('Software Engineer III')).toBe('senior');
    expect(extractSeniorityTier('Principal Systems Architect')).toBe('senior_plus');
    expect(extractSeniorityTier('Head of Engineering')).toBe('senior_plus');
  });
});
