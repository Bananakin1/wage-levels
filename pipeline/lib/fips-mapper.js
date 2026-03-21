const TERRITORY_FIPS = new Set(['60', '66', '69', '72', '78']);

export function buildFipsMap(cbsaRows) {
  const map = {};
  for (const row of cbsaRows) {
    const cbsa = row['CBSA Code']?.trim();
    const stateFips = row['FIPS State Code']?.trim().padStart(2, '0');
    const countyFips = row['FIPS County Code']?.trim().padStart(3, '0');
    const name = row['County/County Equivalent']?.trim();

    if (!cbsa || !stateFips || !countyFips) continue;
    if (TERRITORY_FIPS.has(stateFips)) continue;

    const fips = stateFips + countyFips;
    if (!map[cbsa]) map[cbsa] = [];
    map[cbsa].push({ fips, name });
  }
  return map;
}
