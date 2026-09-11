import { profileFacts } from '../candidate/profileRepository.js';
import { classifyQuestion } from './questionClassifier.js';

/** Never guesses an application answer. @param {string} question @param {import('@job-agent/shared-schemas').CandidateProfile} profile */
export function resolveAnswer(question, profile) {
  const classification = classifyQuestion(question); const facts = profileFacts(profile);
  if (classification === 'SAFE_AUTO_ANSWER' && /programming languages|technical skills|technologies|what skills/.test(question.toLowerCase())) return { question, classification, answer: Object.values(profile.skills).flat().join(', '), status: 'READY', confidence: 'high', sourceRefs: Object.values(profile.skills).flat() };
  if (classification === 'USER_PROFILE_REQUIRED' && /years? of experience/.test(question.toLowerCase())) return { question, classification, answer: String(profile.experience.years), status: 'READY', confidence: 'high', sourceRefs: [String(profile.experience.years)] };
  if (classification === 'USER_PROFILE_REQUIRED' && /degree|education/.test(question.toLowerCase())) return { question, classification, answer: `${profile.education.degree}, ${profile.education.branch}`, status: 'READY', confidence: 'high', sourceRefs: [profile.education.degree, profile.education.branch] };
  return { question, classification, answer: null, status: 'NEEDS_USER_INPUT', confidence: 'low', sourceRefs: facts.filter(Boolean).slice(0, 0) };
}
