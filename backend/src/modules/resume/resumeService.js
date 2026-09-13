import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateTruthLayer } from './truthLayer.js';
import { renderResumeToPdf } from './pdfRenderer.js';

export { renderResumeToPdf };

/**
 * @param {{
 *   provider: import('../ai/types.js').LLMProvider,
 *   profile: import('@job-agent/shared-schemas').CandidateProfile,
 *   job: any,
 *   masterResumePath: string,
 *   outputPath?: string,
 *   applicationId?: string
 * }} dependencies
 */
export async function generateTailoredResume({ provider, profile, job, masterResumePath, outputPath, applicationId }) {
  const resumeText = await readFile(masterResumePath, 'utf8');
  const generated = await provider.generateResume({ profile, resumeText, job });
  validateTruthLayer(generated, profile, resumeText);

  let pdfPath = null;
  if (outputPath || applicationId) {
    pdfPath = await renderResumeToPdf({
      text: generated.text,
      candidateName: profile.candidate?.name || 'Candidate',
      outputPath,
      applicationId,
    });
  }

  return {
    ...generated,
    pdfPath,
    sourceHash: createHash('sha256').update(resumeText).digest('hex'),
  };
}
