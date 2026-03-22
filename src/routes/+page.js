import { base } from '$app/paths';

export const prerender = true;
export const ssr = false;

export async function load({ fetch }) {
  const [wages, occupations, geography, aggregate, employment] = await Promise.all([
    fetch(`${base}/data/wages.json`).then(r => r.json()),
    fetch(`${base}/data/occupations.json`).then(r => r.json()),
    fetch(`${base}/data/geography.json`).then(r => r.json()),
    fetch(`${base}/data/aggregate.json`).then(r => r.json()),
    fetch(`${base}/data/employment.json`).then(r => r.json()),
  ]);

  // Build wages index: soc → { area → wage object }
  const wageIndex = {};
  for (const [area, socWages] of Object.entries(wages)) {
    for (const [soc, w] of Object.entries(socWages)) {
      if (!wageIndex[soc]) wageIndex[soc] = {};
      wageIndex[soc][area] = w;
    }
  }

  // Build employment index: soc → { area → count }
  // Also compute per-area totals for aggregate view
  const employmentIndex = {};
  const areaEmploymentTotals = {};
  for (const [area, socEmp] of Object.entries(employment)) {
    let areaTotal = 0;
    for (const [soc, emp] of Object.entries(socEmp)) {
      if (!employmentIndex[soc]) employmentIndex[soc] = {};
      employmentIndex[soc][area] = emp;
      areaTotal += emp;
    }
    areaEmploymentTotals[area] = areaTotal;
  }

  return { occupations, geography, aggregate, wageIndex, employmentIndex, areaEmploymentTotals };
}
