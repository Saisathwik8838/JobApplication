import { describe, expect, it } from 'vitest';
import { validateTruthLayer, TruthLayerError } from '../../src/modules/resume/truthLayer.js';

const profile = {
  candidate: { name: 'Ada', email: 'ada@example.com', phone: '1', location: 'Bengaluru' },
  education: { degree: 'B.Tech', branch: 'CSE', college: 'C', graduation_year: 2025 },
  experience: { years: 0, level: 'Entry' },
  skills: { programming: ['JavaScript'], backend: [], cloud: [], devops: [], databases: [], ai: [], frontend: [], core_cs: [] },
  projects: [],
  preferences: { roles: [], locations: [], remote: true, hybrid: true, onsite: false, employment_types: [] },
  salary: {},
  rules: { minimum_match_score: 75, auto_prepare: true, require_approval: true },
};

describe('Truth Layer Claim Verification', () => {
  it('accepts a source-backed output directly matching profile', () => {
    const result = validateTruthLayer(
      { text: 'Skilled in JavaScript', sourceReferences: ['JavaScript'] },
      profile,
      'Master resume text'
    );
    expect(result.text).toBe('Skilled in JavaScript');
  });

  it('accepts Bachelor of Technology reference when B.Tech is stored in profile/resume (exact reproduction case)', () => {
    // profile.education.degree = 'B.Tech'
    const result = validateTruthLayer(
      {
        text: 'Bachelor of Technology in CSE',
        sourceReferences: ['Bachelor of Technology'],
      },
      profile,
      'Master resume text mentioning B.Tech CSE'
    );
    expect(result.text).toBe('Bachelor of Technology in CSE');
  });

  it('accepts B.Tech reference when Bachelor of Technology is stored in master resume', () => {
    const customProfile = { ...profile, education: { ...profile.education, degree: 'Engineering' } };
    const result = validateTruthLayer(
      {
        text: 'Completed B.Tech degree',
        sourceReferences: ['B.Tech'],
      },
      customProfile,
      'Education: Bachelor of Technology from National Institute of Technology'
    );
    expect(result.text).toBe('Completed B.Tech degree');
  });

  it('rejects untraceable claims with no basis in the profile or master resume', () => {
    expect(() =>
      validateTruthLayer(
        { text: 'Won national awards and published 5 patents', sourceReferences: ['Won national awards', '5 patents'] },
        profile,
        'Master resume mentioning JavaScript and B.Tech'
      )
    ).toThrow(TruthLayerError);
  });

  it('rejects completely fabricated claims without gutting safety checks', () => {
    expect(() =>
      validateTruthLayer(
        { text: 'PhD in Quantum Physics from MIT', sourceReferences: ['PhD in Quantum Physics'] },
        profile,
        'Master resume mentioning JavaScript and B.Tech'
      )
    ).toThrow(TruthLayerError);
  });

  it('throws when sourceReferences is empty for non-empty text', () => {
    expect(() =>
      validateTruthLayer(
        { text: 'Some text', sourceReferences: [] },
        profile,
        'Master resume'
      )
    ).toThrow(/no source references/i);
  });
});
