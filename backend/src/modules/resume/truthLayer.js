import { profileFacts } from '../candidate/profileRepository.js';

export class TruthLayerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TruthLayerError';
    this.code = 'UNSUPPORTED_CLAIM';
    this.status = 422;
  }
}

/**
 * Strict equivalence allowlist for standard academic degrees and branches.
 * Do NOT use fuzzy or similarity matching — preserve truth-layer claim verification.
 */
export const DEGREE_EQUIVALENCES = [
  ['b tech', 'btech', 'bachelor of technology'],
  ['b e', 'be', 'bachelor of engineering'],
  ['m tech', 'mtech', 'master of technology'],
  ['m e', 'me', 'master of engineering'],
  ['b sc', 'bsc', 'bachelor of science'],
  ['m sc', 'msc', 'master of science'],
  ['bca', 'b c a', 'bachelor of computer applications'],
  ['mca', 'm c a', 'master of computer applications'],
  ['bba', 'b b a', 'bachelor of business administration'],
  ['mba', 'm b a', 'master of business administration'],
  ['phd', 'ph d', 'doctor of philosophy'],
  ['cse', 'c s e', 'computer science and engineering', 'computer science & engineering', 'computer science'],
  ['ece', 'e c e', 'electronics and communication engineering'],
  ['it', 'i t', 'information technology'],
];

/**
 * Normalizes text for truth layer matching by lowercasing, removing punctuation,
 * and collapsing whitespace.
 * @param {string} [str]
 * @returns {string}
 */
export function normalizeTruthText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether a normalized claim reference is traceable in the normalized source text.
 * @param {string} normalizedRef
 * @param {string} normalizedSource
 * @returns {boolean}
 */
export function isReferenceSupported(normalizedRef, normalizedSource) {
  if (!normalizedRef || !normalizedSource) return false;

  // 1. Direct normalized substring check
  if (normalizedSource.includes(normalizedRef)) {
    return true;
  }

  // 2. Strict allowlist equivalence checking
  for (const group of DEGREE_EQUIVALENCES) {
    for (const term of group) {
      if (normalizedRef === term || normalizedRef.includes(term)) {
        for (const altTerm of group) {
          if (altTerm === term) continue;
          const candidateRef = normalizedRef.replace(term, altTerm);
          if (normalizedSource.includes(candidateRef)) {
            return true;
          }
          if (normalizedRef === term && normalizedSource.includes(altTerm)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Validates that all claim references in the generated text are grounded in candidate facts or master resume.
 * @param {{ text: string, sourceReferences: string[] }} generated
 * @param {import('@job-agent/shared-schemas').CandidateProfile} profile
 * @param {string} masterResume
 */
export function validateTruthLayer(generated, profile, masterResume) {
  const rawSource = `${masterResume || ''}\n${profileFacts(profile).join('\n')}`;
  const normalizedSource = normalizeTruthText(rawSource);

  if (!generated.text?.trim()) return generated;

  if (!generated.sourceReferences?.length) {
    throw new TruthLayerError('Generated content has no source references.');
  }

  for (const reference of generated.sourceReferences) {
    if (!reference?.trim()) {
      throw new TruthLayerError('Untraceable generated claim source: (empty reference)');
    }
    const normalizedRef = normalizeTruthText(reference);
    if (!isReferenceSupported(normalizedRef, normalizedSource)) {
      throw new TruthLayerError(`Untraceable generated claim source: ${reference}`);
    }
  }

  return generated;
}
