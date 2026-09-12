import { eligibilityResultSchema } from '@job-agent/shared-schemas';

/** @param {string} description @returns {number|null} */
function requiredYears(description) {
  const match =
    description.match(/(?:minimum of |at least |)(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/i) ??
    description.match(/(\d+)\+\s*(?:years?|yrs?)/i);
  return match ? Number(match[1]) : null;
}

/** @param {string} description @returns {string[]} */
function mandatorySkills(description) {
  const match = description.match(
    /(?:required qualifications|requirements|must have|required skills)[:\s]*([\s\S]{0,1000})/i
  );
  if (!match) return [];
  return match[1]
    .split(/[\n,;•]/)
    .map((x) => x.replace(/^[\s-]+/, '').trim())
    .filter((x) => x.length > 1)
    .slice(0, 20);
}

/**
 * Extracts a seniority tier from a job title.
 * @param {string} [title]
 * @returns {'entry'|'mid'|'senior'|'senior_plus'}
 */
export function extractSeniorityTier(title = '') {
  if (!title) return 'mid';
  const t = title.toLowerCase();
  if (/\b(staff|principal|lead|director|vp|head of|chief)\b/i.test(t)) return 'senior_plus';
  if (/\b(senior|sr\.?|ii{1,2}|iii)\b/i.test(t)) return 'senior';
  if (/\b(intern|internship|junior|jr\.?|entry|trainee|apprentice)\b/i.test(t)) return 'entry';
  return 'mid';
}

/**
 * Pure deterministic eligibility check; it deliberately makes no LLM calls.
 * @param {import('@job-agent/shared-schemas').CandidateProfile} profile
 * @param {{title?:string|null, description:string, location?:string|null}} job
 * @returns {import('@job-agent/shared-schemas').EligibilityResult}
 */
export function evaluateEligibility(profile, job) {
  const description = job.description || '';
  const title = job.title || '';
  const hardFailures = [];
  const warnings = [];

  // 1. Seniority Check
  const candidateLevel = (profile.experience?.level || '').toLowerCase();
  const yearsExp = profile.experience?.totalYears ?? profile.experience?.years ?? 0;
  const isEntryLevel =
    /entry|junior|intern/.test(candidateLevel) ||
    yearsExp === 0;

  if (title) {
    const jobTier = extractSeniorityTier(title);
    if (isEntryLevel && (jobTier === 'senior' || jobTier === 'senior_plus')) {
      hardFailures.push(
        `Job seniority tier (${jobTier}) exceeds candidate experience level (${profile.experience?.level || 'Entry'}).`
      );
    }

    // Role preference cross-check (warning, not hard failure)
    if (profile.preferences?.roles?.length) {
      const titleLower = title.toLowerCase();
      const roleMatched = profile.preferences.roles.some((role) => {
        const words = role.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        return words.some((word) => titleLower.includes(word));
      });
      if (!roleMatched) {
        warnings.push(
          `Job title "${title}" does not closely match candidate preferred roles (${profile.preferences.roles.join(', ')}).`
        );
      }
    }
  }

  // 2. Numeric Years of Experience Check
  const years = requiredYears(description);
  if (years !== null && yearsExp < years) {
    hardFailures.push(`Requires ${years}+ years of experience; profile records ${yearsExp}.`);
  }

  // 3. Degree Requirements
  const education = profile.education;
  const eduList = Array.isArray(education) ? education : (education ? [education] : []);
  const degreeStr = eduList.map((e) => e?.degree || '').join(' ');
  const gradYear = eduList.reduce((max, e) => (e?.graduation_year && e.graduation_year > max ? e.graduation_year : max), 0);

  if (/\b(master'?s|msc|m\.s\.)\b/i.test(description) && degreeStr && !/master/i.test(degreeStr)) {
    hardFailures.push('A master’s degree is required.');
  }
  if (
    /\b(bachelor'?s|btech|b\.tech|b\.s\.)\b/i.test(description) &&
    degreeStr &&
    !/bachelor|btech|b\.tech|b\.s/i.test(degreeStr)
  ) {
    hardFailures.push('A bachelor’s degree is required.');
  }

  // 4. Graduation Year
  const graduation = description.match(/graduat(?:ed|ing)?\s+(?:in|between|by)\s*(20\d{2})/i);
  if (graduation && gradYear > 0 && gradYear > Number(graduation[1])) {
    hardFailures.push(`Requires graduation by ${graduation[1]}.`);
  }

  // 5. Location
  const locations = profile.preferences?.locations || [];
  if (
    job.location &&
    !/remote/i.test(job.location) &&
    locations.length &&
    !locations.some((location) => job.location.toLowerCase().includes(location.toLowerCase()))
  ) {
    hardFailures.push(`Location ${job.location} is outside stated preferences.`);
  }

  // 6. Sensitive Questions / Sponsorship
  if (/authorized to work|without sponsorship|no sponsorship/i.test(description)) {
    warnings.push('Work authorization is a sensitive answer and requires explicit user confirmation.');
  }

  // 7. Mandatory Skills
  const rawSkills = profile.skills || [];
  const skillsList = Array.isArray(rawSkills)
    ? rawSkills
    : Object.values(rawSkills).flatMap((v) => (Array.isArray(v) ? v : [v]));
  const skills = skillsList.map((skill) => (typeof skill === 'string' ? skill.toLowerCase() : String(skill)));

  for (const requirement of mandatorySkills(description)) {
    const normalized = requirement.toLowerCase();
    if (
      /^(python|java|javascript|typescript|react|node\.js|nodejs|aws|docker|kubernetes|sql)\b/.test(normalized) &&
      !skills.some((skill) => normalized.includes(skill) || skill.includes(normalized.split(/\s/)[0]))
    ) {
      hardFailures.push(`Mandatory skill not in profile: ${requirement}.`);
    }
  }

  return eligibilityResultSchema.parse({ eligible: hardFailures.length === 0, hardFailures, warnings });
}
