const HOURS_PER_YEAR = 2080;

// Hourly wages above this threshold are assumed to be annual values
// that were not tagged with "Annual Wage" (e.g., "High Wage" pilot rows).
// No legitimate hourly prevailing wage exceeds $500/hr.
const ANNUAL_DETECTION_THRESHOLD = 500;

export function normalizeWage(row) {
  const label = (row.Label || '').trim();
  const isAnnual = label === 'Annual Wage';
  const hasLevels = label === '' || label === 'Annual Wage';

  function toCents(val, forceHourlyCheck) {
    if (!val || val.trim() === '') return null;
    let num = parseFloat(val);
    if (isAnnual || (forceHourlyCheck && num > ANNUAL_DETECTION_THRESHOLD)) {
      num = num / HOURS_PER_YEAR;
    }
    return Math.round(num * 100);
  }

  // For non-"Annual Wage" labels (e.g., "High Wage"), detect annual values
  // by checking if the number exceeds a reasonable hourly threshold.
  const detectAnnual = !isAnnual;

  return {
    l1: hasLevels ? toCents(row.Level1, detectAnnual) : null,
    l2: hasLevels ? toCents(row.Level2, detectAnnual) : null,
    l3: hasLevels ? toCents(row.Level3, detectAnnual) : null,
    l4: hasLevels ? toCents(row.Level4, detectAnnual) : null,
    avg: toCents(row.Average, detectAnnual),
  };
}
