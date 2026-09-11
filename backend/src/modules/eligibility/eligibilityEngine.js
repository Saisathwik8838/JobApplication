import { eligibilityResultSchema } from '@job-agent/shared-schemas';

/** @param {string} description @returns {number|null} */
function requiredYears(description) { const match = description.match(/(?:minimum of |at least |)(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/i) ?? description.match(/(\d+)\+\s*(?:years?|yrs?)/i); return match ? Number(match[1]) : null; }
/** @param {string} description @returns {string[]} */
function mandatorySkills(description) { const match = description.match(/(?:required qualifications|requirements|must have|required skills)[:\s]*([\s\S]{0,1000})/i); if (!match) return []; return match[1].split(/[\n,;•]/).map((x) => x.replace(/^[\s-]+/, '').trim()).filter((x) => x.length > 1).slice(0, 20); }

/** Pure deterministic eligibility check; it deliberately makes no LLM calls. @param {import('@job-agent/shared-schemas').CandidateProfile} profile @param {{description:string,location?:string|null}} job @returns {import('@job-agent/shared-schemas').EligibilityResult} */
export function evaluateEligibility(profile, job) {
  const description = job.description; const hardFailures = []; const warnings = [];
  const years = requiredYears(description);
  if (years !== null && profile.experience.years < years) hardFailures.push(`Requires ${years}+ years of experience; profile records ${profile.experience.years}.`);
  if (/\b(master'?s|msc|m\.s\.)\b/i.test(description) && !/master/i.test(profile.education.degree)) hardFailures.push('A master’s degree is required.');
  if (/\b(bachelor'?s|btech|b\.tech|b\.s\.)\b/i.test(description) && !/bachelor|btech|b\.tech|b\.s/i.test(profile.education.degree)) hardFailures.push('A bachelor’s degree is required.');
  const graduation = description.match(/graduat(?:ed|ing)?\s+(?:in|between|by)\s*(20\d{2})/i);
  if (graduation && profile.education.graduation_year > Number(graduation[1])) hardFailures.push(`Requires graduation by ${graduation[1]}.`);
  if (job.location && !/remote/i.test(job.location) && profile.preferences.locations.length && !profile.preferences.locations.some((location) => job.location.toLowerCase().includes(location.toLowerCase()))) hardFailures.push(`Location ${job.location} is outside stated preferences.`);
  if (/authorized to work|without sponsorship|no sponsorship/i.test(description)) warnings.push('Work authorization is a sensitive answer and requires explicit user confirmation.');
  const skills = Object.values(profile.skills).flat().map((skill) => skill.toLowerCase());
  for (const requirement of mandatorySkills(description)) {
    const normalized = requirement.toLowerCase();
    if (/^(python|java|javascript|typescript|react|node\.js|nodejs|aws|docker|kubernetes|sql)\b/.test(normalized) && !skills.some((skill) => normalized.includes(skill) || skill.includes(normalized.split(/\s/)[0]))) hardFailures.push(`Mandatory skill not in profile: ${requirement}.`);
  }
  return eligibilityResultSchema.parse({ eligible: hardFailures.length === 0, hardFailures, warnings });
}
