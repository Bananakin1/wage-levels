const TERRITORY_STATES = new Set(['AS', 'GU', 'MH', 'FM', 'MP', 'PW', 'PR', 'VI']);
const STATE_AB_TO_FIPS = {
  'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10',
  'DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19',
  'KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27',
  'MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35',
  'NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44',
  'SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53',
  'WV':'54','WI':'55','WY':'56'
};

export function buildNonmetroMap(nonmetroGeoRows, allCountiesByState, coveredFips) {
  const map = {};
  for (const row of nonmetroGeoRows) {
    const area = row.Area?.replace(/"/g, '').trim();
    const stateAb = row.StateAb?.replace(/"/g, '').trim();
    if (!area || !stateAb) continue;
    if (TERRITORY_STATES.has(stateAb)) continue;

    const stateFips = STATE_AB_TO_FIPS[stateAb];
    if (!stateFips) continue;

    const stateCounties = allCountiesByState[stateFips] || [];
    const uncovered = stateCounties.filter(c => !coveredFips.has(c.fips));

    if (uncovered.length > 0) {
      map[area] = uncovered;
    }
  }
  return map;
}
