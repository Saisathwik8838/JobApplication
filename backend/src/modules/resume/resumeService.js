import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateTruthLayer } from './truthLayer.js';

/** @param {{provider:import('../ai/types.js').LLMProvider, profile:import('@job-agent/shared-schemas').CandidateProfile, job:any, masterResumePath:string}} dependencies */
export async function generateTailoredResume({ provider, profile, job, masterResumePath }) {
  const resumeText = await readFile(masterResumePath, 'utf8'); const generated = await provider.generateResume({ profile, resumeText, job });
  validateTruthLayer(generated, profile, resumeText);
  return { ...generated, sourceHash: createHash('sha256').update(resumeText).digest('hex') };
}
