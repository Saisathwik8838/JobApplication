/**
 * Analyzes candidate profile completeness and surfaces actionable warnings if
 * critical fields (target roles, locations, skills) look empty or templated.
 * @param {object} profile
 * @returns {{ complete: boolean, warnings: string[], score: number }}
 */
export function checkProfileCompleteness(profile) {
  const warnings = [];
  let score = 100;

  if (!profile) {
    return { complete: false, warnings: ['Profile is missing or uninitialized.'], score: 0 };
  }

  const identity = profile.identity || profile.candidate || {};
  const preferences = profile.preferences || {};
  const skills = Array.isArray(profile.skills) ? profile.skills : [];

  if (!identity.name || identity.name.toLowerCase().includes('candidate')) {
    warnings.push(`Candidate name looks placeholder/templated ('${identity.name || ''}').`);
    score -= 20;
  }

  if (!identity.email || identity.email.includes('example.com') || identity.email.includes('example.test')) {
    warnings.push(`Candidate email is not a real address ('${identity.email || ''}').`);
    score -= 25;
  }

  const roles = preferences.roles || [];
  if (roles.length === 0) {
    warnings.push('No target roles configured in preferences; job matching cannot assess fit accurately.');
    score -= 25;
  }

  const locations = preferences.locations || [];
  if (locations.length === 0 && !preferences.remote) {
    warnings.push('No target locations or remote preference set; location matching may be inaccurate.');
    score -= 15;
  }

  if (skills.length < 3) {
    warnings.push(`Profile lists only ${skills.length} skill(s) (recommend at least 5 for accurate matching).`);
    score -= 15;
  }

  return {
    complete: warnings.length === 0,
    warnings,
    score: Math.max(0, score),
  };
}
