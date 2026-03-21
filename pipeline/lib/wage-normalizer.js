const HOURS_PER_YEAR = 2080;

export function normalizeWage(row) {
  const label = (row.Label || '').trim();
  const isAnnual = label === 'Annual Wage';
  const hasLevels = label === '' || label === 'Annual Wage';

  function toCents(val) {
    if (!val || val.trim() === '') return null;
    let num = parseFloat(val);
    if (isAnnual) num = num / HOURS_PER_YEAR;
    return Math.round(num * 100);
  }

  return {
    l1: hasLevels ? toCents(row.Level1) : null,
    l2: hasLevels ? toCents(row.Level2) : null,
    l3: hasLevels ? toCents(row.Level3) : null,
    l4: hasLevels ? toCents(row.Level4) : null,
    avg: toCents(row.Average),
  };
}
