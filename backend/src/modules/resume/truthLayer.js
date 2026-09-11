import { profileFacts } from '../candidate/profileRepository.js';

export class TruthLayerError extends Error { constructor(message) { super(message); this.name = 'TruthLayerError'; this.code = 'UNSUPPORTED_CLAIM'; this.status = 422; } }
/** @param {{text:string,sourceReferences:string[]}} generated @param {import('@job-agent/shared-schemas').CandidateProfile} profile @param {string} masterResume */
export function validateTruthLayer(generated, profile, masterResume) {
  const source = `${masterResume}\n${profileFacts(profile).join('\n')}`.toLowerCase();
  if (!generated.text.trim()) return generated;
  if (!generated.sourceReferences?.length) throw new TruthLayerError('Generated content has no source references.');
  for (const reference of generated.sourceReferences) if (!reference.trim() || !source.includes(reference.toLowerCase())) throw new TruthLayerError(`Untraceable generated claim source: ${reference}`);
  return generated;
}
