import { describe, expect, it } from 'vitest';
import { normalizeIndianLocation, formatIndianSalary } from '../../src/modules/jobs/localization.js';

describe('India Localization Module', () => {
  describe('normalizeIndianLocation', () => {
    it('normalizes Bangalore to Bengaluru', () => {
      expect(normalizeIndianLocation('Bangalore')).toBe('Bengaluru');
      expect(normalizeIndianLocation('Bangalore, Karnataka')).toBe('Bengaluru, Karnataka');
      expect(normalizeIndianLocation('Bangalore South')).toBe('Bengaluru South');
    });

    it('normalizes Bombay to Mumbai', () => {
      expect(normalizeIndianLocation('Bombay')).toBe('Mumbai');
      expect(normalizeIndianLocation('Bombay, Maharashtra')).toBe('Mumbai, Maharashtra');
    });

    it('normalizes Gurgaon to Gurugram', () => {
      expect(normalizeIndianLocation('Gurgaon, Haryana')).toBe('Gurugram, Haryana');
    });

    it('normalizes Madras to Chennai', () => {
      expect(normalizeIndianLocation('Madras, Tamil Nadu')).toBe('Chennai, Tamil Nadu');
    });

    it('normalizes Calcutta to Kolkata', () => {
      expect(normalizeIndianLocation('Calcutta, West Bengal')).toBe('Kolkata, West Bengal');
    });

    it('normalizes Cochin, Poona, Trivandrum, Baroda, Benares', () => {
      expect(normalizeIndianLocation('Cochin, Kerala')).toBe('Kochi, Kerala');
      expect(normalizeIndianLocation('Poona, Maharashtra')).toBe('Pune, Maharashtra');
      expect(normalizeIndianLocation('Trivandrum')).toBe('Thiruvananthapuram');
      expect(normalizeIndianLocation('Baroda, Gujarat')).toBe('Vadodara, Gujarat');
      expect(normalizeIndianLocation('Benares, UP')).toBe('Varanasi, UP');
      expect(normalizeIndianLocation('Allahabad')).toBe('Prayagraj');
    });

    it('preserves remote indicators', () => {
      expect(normalizeIndianLocation('Bangalore (Remote)')).toBe('Bengaluru (Remote)');
      expect(normalizeIndianLocation('Remote, India')).toBe('Remote, India');
    });

    it('falls back gracefully on empty or invalid inputs', () => {
      expect(normalizeIndianLocation('')).toBe('India');
      expect(normalizeIndianLocation(null)).toBe('India');
      expect(normalizeIndianLocation(undefined)).toBe('India');
    });
  });

  describe('formatIndianSalary', () => {
    it('formats min and max salary with rupee symbol and Indian numbering', () => {
      expect(formatIndianSalary(1200000, 1800000)).toBe('₹12,00,000 - ₹18,00,000');
    });

    it('formats only min salary', () => {
      expect(formatIndianSalary(800000, null)).toBe('From ₹8,00,000');
    });

    it('formats only max salary', () => {
      expect(formatIndianSalary(null, 2500000)).toBe('Up to ₹25,00,000');
    });

    it('handles string numbers', () => {
      expect(formatIndianSalary('500000', '1000000')).toBe('₹5,00,000 - ₹10,00,000');
    });

    it('handles pre-formatted salary strings', () => {
      expect(formatIndianSalary('₹15 LPA', null)).toBe('₹15 LPA');
      expect(formatIndianSalary('15 LPA', null)).toBe('₹15 LPA');
    });

    it('returns null for empty or null salaries', () => {
      expect(formatIndianSalary(null, null)).toBeNull();
      expect(formatIndianSalary('', '')).toBeNull();
    });
  });
});
