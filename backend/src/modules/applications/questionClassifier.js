/** @typedef {'SAFE_AUTO_ANSWER'|'USER_PROFILE_REQUIRED'|'SENSITIVE'|'UNKNOWN'} AnswerClassification */
/** @param {string} question @returns {AnswerClassification} */
export function classifyQuestion(question) {
  const normalized = question.toLowerCase();
  if (/sponsor|work authorization|authorized to work|visa|citizen|gender|race|disability|veteran|religion|date of birth|criminal/.test(normalized)) return 'SENSITIVE';
  if (/programming languages|technical skills|technologies|what skills|portfolio|github/.test(normalized)) return 'SAFE_AUTO_ANSWER';
  if (/years? of experience|degree|education|location|notice period|salary expectation/.test(normalized)) return 'USER_PROFILE_REQUIRED';
  return 'UNKNOWN';
}
