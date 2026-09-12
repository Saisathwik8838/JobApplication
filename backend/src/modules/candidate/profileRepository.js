import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';
import { candidateProfileSchema } from '@job-agent/shared-schemas';

/** @param {string} profilePath @returns {Promise<{profile: import('@job-agent/shared-schemas').CandidateProfile, version:string}>} */
export async function loadCandidateProfile(profilePath) {
  const raw = await readFile(resolve(profilePath), 'utf8');
  const profile = candidateProfileSchema.parse(YAML.parse(raw));
  return { profile, version: createHash('sha256').update(raw).digest('hex') };
}

/** Validates and persists the one canonical candidate profile file. @param {string} profilePath @param {unknown} value */
export async function saveCandidateProfile(profilePath, value) {
  const profile = candidateProfileSchema.parse(value);
  const serialized = YAML.stringify(profile);
  await writeFile(resolve(profilePath), serialized, 'utf8');
  return { profile, version: createHash('sha256').update(serialized).digest('hex') };
}

/** @param {import('@job-agent/shared-schemas').CandidateProfile} profile @returns {string[]} */
export function profileFacts(profile) {
  const identity = profile?.identity || profile?.candidate || {};
  const education = profile?.education || {};
  const eduList = Array.isArray(education) ? education : [education];
  const eduFacts = eduList.flatMap((e) => [e?.degree, e?.branch, e?.college]).filter(Boolean);

  const rawSkills = profile?.skills || [];
  let skills = [];
  if (Array.isArray(rawSkills)) {
    skills = rawSkills.filter(Boolean);
  } else if (typeof rawSkills === 'object' && rawSkills !== null) {
    skills = Object.values(rawSkills).flatMap((v) => (Array.isArray(v) ? v : [v])).filter(Boolean);
  }

  const projects = Array.isArray(profile?.projects) ? profile.projects : [];
  const projectFacts = projects.flatMap((p) => [p.name, p.description, ...(p.technologies || [])]);

  return [
    identity.name,
    identity.location,
    identity.email,
    identity.phone,
    identity.portfolioUrl,
    identity.linkedInUrl,
    identity.githubUrl,
    ...eduFacts,
    ...skills,
    ...projectFacts,
  ].filter(Boolean);
}
