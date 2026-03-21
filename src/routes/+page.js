import { base } from '$app/paths';

export const prerender = true;

export async function load({ fetch }) {
  const [wages, occupations, geography, aggregate] = await Promise.all([
    fetch(`${base}/data/wages.json`).then(r => r.json()),
    fetch(`${base}/data/occupations.json`).then(r => r.json()),
    fetch(`${base}/data/geography.json`).then(r => r.json()),
    fetch(`${base}/data/aggregate.json`).then(r => r.json()),
  ]);

  // Build county FIPS → area lookup for choropleth
  const fipsToArea = {};
  for (const [area, info] of Object.entries(geography)) {
    for (const county of info.counties) {
      fipsToArea[county.fips] = area;
    }
  }

  // Build wages index: soc → { area → wage object }
  // wages shape: { area: { soc: { l1, l2, l3, l4, avg } } }
  const wageIndex = {};
  for (const [area, socWages] of Object.entries(wages)) {
    for (const [soc, w] of Object.entries(socWages)) {
      if (!wageIndex[soc]) wageIndex[soc] = {};
      wageIndex[soc][area] = w;
    }
  }

  return { wages, occupations, geography, aggregate, fipsToArea, wageIndex };
}
