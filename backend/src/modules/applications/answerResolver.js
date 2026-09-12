import { profileFacts } from '../candidate/profileRepository.js';
import { classifyQuestion } from './questionClassifier.js';

/** Never guesses an application answer. Only returns READY for verifiable profile facts. @param {string} question @param {import('@job-agent/shared-schemas').CandidateProfile} profile */
export function resolveAnswer(question, profile) {
  const classification = classifyQuestion(question);
  const facts = profileFacts(profile);
  const q = question.toLowerCase().trim();

  // Basic candidate details
  if (/^first name$|^given name$/i.test(q)) {
    const parts = (profile.candidate.name || '').trim().split(/\s+/);
    if (parts[0]) {
      return { question, classification: 'SAFE_AUTO_ANSWER', answer: parts[0], status: 'READY', confidence: 'high', sourceRefs: [parts[0]] };
    }
  }

  if (/^last name$|^family name$|^surname$/i.test(q)) {
    const parts = (profile.candidate.name || '').trim().split(/\s+/);
    if (parts.length > 1) {
      const lastName = parts.slice(1).join(' ');
      return { question, classification: 'SAFE_AUTO_ANSWER', answer: lastName, status: 'READY', confidence: 'high', sourceRefs: [lastName] };
    }
  }

  if (/full name|your name/i.test(q) && profile.candidate.name) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: profile.candidate.name, status: 'READY', confidence: 'high', sourceRefs: [profile.candidate.name] };
  }

  if (/^email$|^email address$/i.test(q) && profile.candidate.email) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: profile.candidate.email, status: 'READY', confidence: 'high', sourceRefs: [profile.candidate.email] };
  }

  if (/^phone$|^phone number$|^mobile$/i.test(q) && profile.candidate.phone) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: profile.candidate.phone, status: 'READY', confidence: 'high', sourceRefs: [profile.candidate.phone] };
  }

  // Location
  if (/location|city|where are you located|current location/i.test(q) && profile.candidate?.location) {
    return { question, classification: 'USER_PROFILE_REQUIRED', answer: profile.candidate.location, status: 'READY', confidence: 'high', sourceRefs: [profile.candidate.location] };
  }

  // Technical skills
  if (classification === 'SAFE_AUTO_ANSWER' && /programming languages|technical skills|technologies|what skills/.test(q)) {
    const allSkills = Object.values(profile.skills).flat();
    return { question, classification, answer: allSkills.join(', '), status: 'READY', confidence: 'high', sourceRefs: allSkills };
  }

  // Experience years
  if (classification === 'USER_PROFILE_REQUIRED' && /years? of experience/.test(q)) {
    return { question, classification, answer: String(profile.experience.years), status: 'READY', confidence: 'high', sourceRefs: [String(profile.experience.years)] };
  }

  // Education / Degree
  if (classification === 'USER_PROFILE_REQUIRED' && /degree|education/.test(q)) {
    return { question, classification, answer: `${profile.education.degree}, ${profile.education.branch}`, status: 'READY', confidence: 'high', sourceRefs: [profile.education.degree, profile.education.branch] };
  }

  // Portfolio / GitHub URL
  if (/portfolio|github|website|personal site|project url/i.test(q)) {
    const projectWithUrl = (profile.projects || []).find((p) => p.url);
    if (projectWithUrl && projectWithUrl.url) {
      return { question, classification: 'SAFE_AUTO_ANSWER', answer: projectWithUrl.url, status: 'READY', confidence: 'high', sourceRefs: [projectWithUrl.url] };
    }
  }

  // Salary expectations if configured in profile
  if (/salary|compensation|expected salary|target salary/i.test(q)) {
    const salaryVal = profile.salary?.target || profile.salary?.minimum;
    if (salaryVal) {
      return { question, classification: 'USER_PROFILE_REQUIRED', answer: String(salaryVal), status: 'READY', confidence: 'high', sourceRefs: [String(salaryVal)] };
    }
  }

  return { question, classification, answer: null, status: 'NEEDS_USER_INPUT', confidence: 'low', sourceRefs: facts.filter(Boolean).slice(0, 0) };
}
