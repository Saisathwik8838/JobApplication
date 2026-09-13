/**
 * Module to determine whether a job posting is relevant to the Indian job market.
 */

// Explicit foreign work authorization, visa, or country residency requirements
export const FOREIGN_RESTRICTION_PATTERNS = [
  /must be (?:legally )?authorized to work in the (?:us|u\.s\.|united states|uk|u\.k\.|canada|australia|eu|singapore|germany|france|netherlands)/i,
  /(?:us|u\.s\.|united states|uk|u\.k\.|canada|australia|eu|germany|france) (?:work )?authorization (?:is )?required/i,
  /(?:us|u\.s\.|united states|uk|u\.k\.|canada|australia) (?:citizens?|green card|prs?|permanent residents?)(?: only)?/i,
  /(?:must be|only) (?:based|located|reside|living) in (?:the )?(?:us|u\.s\.|united states|uk|u\.k\.|canada|north america|europe|latin america|latam|apac excluding india)/i,
  /\b(?:us|uk|canada|australia|germany|france|netherlands)-based only\b/i,
  /\b(?:us|uk|canada|germany|france)-only\b/i,
  /\bno international (?:applicants|candidates|sponsorship)\b/i,
  /\bvisa sponsorship (?:is )?not available for (?:us|uk|canada)\b/i,
  /\btime\s?zone[s]?:?\s*(?:est|pst|cst|mst|gmt|cet|bst) (?:only|required)\b/i,
];

// Indian metros, tier-1/tier-2 tech hubs, states, and regional identifiers
export const INDIAN_LOCATION_INDICATORS = [
  'india',
  'bengaluru', 'bangalore',
  'mumbai', 'bombay',
  'delhi', 'new delhi', 'ncr', 'gurugram', 'gurgaon', 'noida',
  'hyderabad', 'secunderabad',
  'chennai', 'madras',
  'pune', 'poona',
  'kolkata', 'calcutta',
  'ahmedabad',
  'jaipur',
  'kochi', 'cochin', 'kerala',
  'thiruvananthapuram', 'trivandrum',
  'chandigarh', 'mohali', 'panchkula',
  'indore', 'bhopal', 'madhya pradesh',
  'nagpur', 'maharashtra',
  'coimbatore', 'tamil nadu',
  'visakhapatnam', 'vizag', 'andhra pradesh', 'vijayawada',
  'mysuru', 'mysore', 'karnataka',
  'bhubaneswar', 'odisha',
  'lucknow', 'kanpur', 'uttar pradesh',
  'patna', 'bihar',
  'guwahati', 'assam',
  'dehradun', 'uttarakhand',
  'goa',
  'vadodara', 'surat', 'gujarat',
  'rajasthan',
  'telangana',
  'west bengal',
  'punjab', 'haryana',
];

/**
 * Checks whether a job posting is relevant to the Indian job market.
 * @param {{
 *   source?: string,
 *   location?: string,
 *   description?: string,
 *   title?: string,
 *   country?: string,
 * }} job
 * @param {{ indiaOnly?: boolean }} [options]
 * @returns {boolean}
 */
export function isIndiaRelevant(job, options = {}) {
  const indiaOnly = options.indiaOnly !== false;
  if (!indiaOnly) return true;
  if (!job) return false;

  const title = job.title || '';
  const location = job.location || '';
  const description = job.description || '';
  const textToScan = `${title} ${location} ${description}`;

  // 1. Strict check: If foreign work authorization or specific foreign residency is required, reject immediately
  for (const pattern of FOREIGN_RESTRICTION_PATTERNS) {
    if (pattern.test(textToScan)) {
      return false;
    }
  }

  // 2. National Career Service is government portal for India
  if (job.source === 'ncs') {
    return true;
  }

  // 3. Adzuna source configured with country=in
  if (job.source === 'adzuna' && (job.country === 'in' || location.toLowerCase().includes('india'))) {
    return true;
  }

  // 4. Check location text for Indian city, state, or country indicator
  const locLower = location.toLowerCase();
  for (const indicator of INDIAN_LOCATION_INDICATORS) {
    const regex = new RegExp(`\\b${indicator}\\b`, 'i');
    if (regex.test(locLower)) {
      return true;
    }
  }

  // 5. If location is generic remote (e.g. "Remote", "Worldwide", "Anywhere"),
  // require an explicit India indicator in the description or title to pass
  if (locLower.includes('remote') || locLower.includes('worldwide') || locLower.includes('anywhere')) {
    const descLower = description.toLowerCase();
    for (const indicator of INDIAN_LOCATION_INDICATORS) {
      const regex = new RegExp(`\\b${indicator}\\b`, 'i');
      if (regex.test(descLower) || regex.test(title.toLowerCase())) {
        return true;
      }
    }
    // Generic remote without explicit India relevance fails when INDIA_ONLY is true
    return false;
  }

  return false;
}
