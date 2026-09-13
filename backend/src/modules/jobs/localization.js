/**
 * Indian location and currency localization utilities.
 */

/**
 * Mapping of historical / colonial / alternative Indian city names to their
 * official / standard modern names.
 */
const CITY_ALIASES = {
  bangalore: 'Bengaluru',
  bengaluru: 'Bengaluru',
  bombay: 'Mumbai',
  mumbai: 'Mumbai',
  madras: 'Chennai',
  chennai: 'Chennai',
  calcutta: 'Kolkata',
  kolkata: 'Kolkata',
  gurgaon: 'Gurugram',
  gurugram: 'Gurugram',
  poona: 'Pune',
  pune: 'Pune',
  cochin: 'Kochi',
  kochi: 'Kochi',
  trivandrum: 'Thiruvananthapuram',
  thiruvananthapuram: 'Thiruvananthapuram',
  baroda: 'Vadodara',
  vadodara: 'Vadodara',
  pondicherry: 'Puducherry',
  puducherry: 'Puducherry',
  mangalore: 'Mangaluru',
  mangaluru: 'Mangaluru',
  mysore: 'Mysuru',
  mysuru: 'Mysuru',
  belgaum: 'Belagavi',
  belagavi: 'Belagavi',
  hubli: 'Hubballi',
  hubballi: 'Hubballi',
  calicut: 'Kozhikode',
  kozhikode: 'Kozhikode',
  simla: 'Shimla',
  shimla: 'Shimla',
  benares: 'Varanasi',
  banaras: 'Varanasi',
  varanasi: 'Varanasi',
  allahabad: 'Prayagraj',
  prayagraj: 'Prayagraj',
  waltair: 'Visakhapatnam',
  vizag: 'Visakhapatnam',
  visakhapatnam: 'Visakhapatnam',
  orissa: 'Odisha',
  odisha: 'Odisha',
};

/**
 * Normalizes an Indian location string by standardizing city/state naming.
 * Examples:
 *   "Bangalore, India" -> "Bengaluru, India"
 *   "Bombay, Maharashtra" -> "Mumbai, Maharashtra"
 *   "Gurgaon, Haryana" -> "Gurugram, Haryana"
 *   "Remote, India" -> "Remote, India"
 *
 * @param {string|null|undefined} location
 * @returns {string}
 */
export function normalizeIndianLocation(location) {
  if (!location || typeof location !== 'string') {
    return 'India';
  }

  const trimmed = location.trim();
  if (!trimmed) return 'India';

  // Check if it's explicitly remote
  const isRemote = /remote/i.test(trimmed);

  // Split tokens by comma, slash, dash or parentheses
  const segments = trimmed.split(/[,/|]/).map((s) => s.trim()).filter(Boolean);

  const normalizedSegments = segments.map((segment) => {
    // Check if whole segment or word matches an alias
    const lower = segment.toLowerCase().replace(/[().]/g, '').trim();

    // Direct match
    if (CITY_ALIASES[lower]) {
      return CITY_ALIASES[lower];
    }

    // Word boundary replace for city names inside segment (e.g. "Bangalore South")
    let modified = segment;
    for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
      const regex = new RegExp(`\\b${alias}\\b`, 'gi');
      if (regex.test(modified)) {
        modified = modified.replace(regex, canonical);
      }
    }
    return modified;
  });

  let result = normalizedSegments.join(', ');

  // Preserve remote indicator if present
  if (isRemote && !/remote/i.test(result)) {
    result = `${result} (Remote)`;
  }

  return result;
}

/**
 * Formats a salary range or value in Indian Rupees (₹).
 * Uses Indian numbering format (e.g. ₹12,00,000).
 *
 * @param {number|string|null|undefined} min
 * @param {number|string|null|undefined} max
 * @param {string} [currency='INR']
 * @returns {string|null}
 */
export function formatIndianSalary(min, max, _currency = 'INR') {
  const numMin = min !== null && min !== undefined && min !== '' ? Number(min) : null;
  const numMax = max !== null && max !== undefined && max !== '' ? Number(max) : null;

  const validMin = numMin !== null && !Number.isNaN(numMin);
  const validMax = numMax !== null && !Number.isNaN(numMax);

  if (!validMin && !validMax) {
    if (typeof min === 'string' && min.trim()) {
      const str = min.trim();
      return str.startsWith('₹') || /inr/i.test(str) ? str : `₹${str}`;
    }
    return null;
  }

  const formatNum = (val) => val.toLocaleString('en-IN');

  if (validMin && validMax) {
    return `₹${formatNum(numMin)} - ₹${formatNum(numMax)}`;
  }
  if (validMin) {
    return `From ₹${formatNum(numMin)}`;
  }
  return `Up to ₹${formatNum(numMax)}`;
}
