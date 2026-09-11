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
  return [profile.candidate.name, profile.candidate.location, profile.education.degree, profile.education.branch, profile.education.college, ...Object.values(profile.skills).flat(), ...profile.projects.flatMap((project) => [project.name, project.description, ...project.technologies])].filter(Boolean);
}
