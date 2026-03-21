import { format } from 'd3-format';

const fmtDollar = format(',.2f');
const HOURS_PER_YEAR = 2080;

export function formatWage(cents, isAnnual) {
  if (cents === null || cents === undefined) return '—';
  let dollars = cents / 100;
  if (isAnnual) dollars *= HOURS_PER_YEAR;
  return '$' + fmtDollar(dollars);
}

export function formatWageShort(cents, isAnnual) {
  if (cents === null || cents === undefined) return '—';
  let dollars = cents / 100;
  if (isAnnual) dollars *= HOURS_PER_YEAR;
  if (dollars >= 1000) return '$' + format(',.0f')(dollars);
  return '$' + fmtDollar(dollars);
}
