import { profileFacts } from '../candidate/profileRepository.js';
import { classifyQuestion } from './questionClassifier.js';

/** Never guesses an application answer. Only returns READY for verifiable profile facts. @param {string} question @param {import('@job-agent/shared-schemas').CandidateProfile} profile */
export function resolveAnswer(question, profile) {
  const classification = classifyQuestion(question);
  const facts = profileFacts(profile);
  const q = question.toLowerCase().trim();

  const identity = profile?.identity || profile?.candidate || {};
  const expYears = profile?.experience?.totalYears ?? profile?.experience?.years ?? 0;
  const rawSkills = profile?.skills || [];
  const allSkills = (Array.isArray(rawSkills) ? rawSkills : Object.values(rawSkills).flat()).filter(Boolean);

  // Basic candidate details
  if (/^first name$|^given name$/i.test(q)) {
    const parts = (identity.name || '').trim().split(/\s+/);
    if (parts[0]) {
      return { question, classification: 'SAFE_AUTO_ANSWER', answer: parts[0], status: 'READY', confidence: 'high', sourceRefs: [parts[0]] };
    }
  }

  if (/^last name$|^family name$|^surname$/i.test(q)) {
    const parts = (identity.name || '').trim().split(/\s+/);
    if (parts.length > 1) {
      const lastName = parts.slice(1).join(' ');
      return { question, classification: 'SAFE_AUTO_ANSWER', answer: lastName, status: 'READY', confidence: 'high', sourceRefs: [lastName] };
    }
  }

  if (/full name|your name/i.test(q) && identity.name) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: identity.name, status: 'READY', confidence: 'high', sourceRefs: [identity.name] };
  }

  if (/^email$|^email address$/i.test(q) && identity.email) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: identity.email, status: 'READY', confidence: 'high', sourceRefs: [identity.email] };
  }

  if (/^phone$|^phone number$|^mobile$/i.test(q) && identity.phone) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: identity.phone, status: 'READY', confidence: 'high', sourceRefs: [identity.phone] };
  }

  // Location
  if (/location|city|where are you located|current location/i.test(q) && identity.location) {
    return { question, classification: 'USER_PROFILE_REQUIRED', answer: identity.location, status: 'READY', confidence: 'high', sourceRefs: [identity.location] };
  }

  // Work Authorization / Sponsorship
  if (/work authorization|authorized to work|visa sponsorship|sponsorship required|legal right to work/i.test(q) && profile?.preferences?.workAuthorization) {
    return { question, classification: 'USER_PROFILE_REQUIRED', answer: profile.preferences.workAuthorization, status: 'READY', confidence: 'high', sourceRefs: [profile.preferences.workAuthorization] };
  }

  // Technical skills
  if (classification === 'SAFE_AUTO_ANSWER' && /programming languages|technical skills|technologies|what skills/.test(q) && allSkills.length) {
    return { question, classification, answer: allSkills.join(', '), status: 'READY', confidence: 'high', sourceRefs: allSkills };
  }

  // Experience years
  if (classification === 'USER_PROFILE_REQUIRED' && /years? of experience/.test(q)) {
    return { question, classification, answer: String(expYears), status: 'READY', confidence: 'high', sourceRefs: [String(expYears)] };
  }

  // Education / Degree
  if (classification === 'USER_PROFILE_REQUIRED' && /degree|education/.test(q) && profile?.education) {
    const edu = Array.isArray(profile.education) ? profile.education[0] : profile.education;
    if (edu?.degree) {
      const ans = edu.branch ? `${edu.degree}, ${edu.branch}` : edu.degree;
      return { question, classification, answer: ans, status: 'READY', confidence: 'high', sourceRefs: [ans] };
    }
  }

  // LinkedIn URL
  if (/linkedin/i.test(q) && identity.linkedInUrl) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: identity.linkedInUrl, status: 'READY', confidence: 'high', sourceRefs: [identity.linkedInUrl] };
  }

  // GitHub URL
  if (/github/i.test(q) && identity.githubUrl) {
    return { question, classification: 'SAFE_AUTO_ANSWER', answer: identity.githubUrl, status: 'READY', confidence: 'high', sourceRefs: [identity.githubUrl] };
  }

  // Portfolio / Website / Personal site URL
  if (/portfolio|website|personal site|project url/i.test(q)) {
    if (identity.portfolioUrl) {
      return { question, classification: 'SAFE_AUTO_ANSWER', answer: identity.portfolioUrl, status: 'READY', confidence: 'high', sourceRefs: [identity.portfolioUrl] };
    }
    const projectWithUrl = (profile?.projects || []).find((p) => p.url);
    if (projectWithUrl && projectWithUrl.url) {
      return { question, classification: 'SAFE_AUTO_ANSWER', answer: projectWithUrl.url, status: 'READY', confidence: 'high', sourceRefs: [projectWithUrl.url] };
    }
  }

  // Salary expectations if configured in profile
  if (/salary|compensation|expected salary|target salary/i.test(q)) {
    const salaryVal = profile?.preferences?.minSalary != null
      ? `${profile.preferences.minSalary} LPA`
      : (profile?.salary?.target || profile?.salary?.minimum);
    if (salaryVal) {
      return { question, classification: 'USER_PROFILE_REQUIRED', answer: String(salaryVal), status: 'READY', confidence: 'high', sourceRefs: [String(salaryVal)] };
    }
  }

  return { question, classification, answer: null, status: 'NEEDS_USER_INPUT', confidence: 'low', sourceRefs: facts.filter(Boolean).slice(0, 0) };
}
