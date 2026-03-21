import { readCSV, readTSV } from './lib/parse-csv.js';
import { normalizeWage } from './lib/wage-normalizer.js';
import { buildFipsMap } from './lib/fips-mapper.js';
import { buildNonmetroMap } from './lib/nonmetro-mapper.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import XLSX from 'xlsx';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Paths ──────────────────────────────────────────────────────
const OFLC    = `${ROOT}/data/raw/oflc`;
const ONET    = `${ROOT}/data/raw/onet`;
const CBSA    = `${ROOT}/data/raw/cbsa/cbsa_delineation.xlsx`;
const COUNTIES = `${ROOT}/data/raw/cbsa/national_county2020.txt`;
const OUT     = `${ROOT}/static/data`;

// ── Territory state abbreviations to skip ──────────────────────
const TERRITORY_STATES = new Set(['AS', 'GU', 'MH', 'FM', 'MP', 'PW', 'PR', 'VI']);

// ── O*NET education category labels ────────────────────────────
const EDU_LABELS = {
  '1':  'Less than High School',
  '2':  'High School Diploma',
  '3':  'Post-Secondary Certificate',
  '4':  'Some College',
  '5':  "Associate's Degree",
  '6':  "Bachelor's Degree",
  '7':  'Post-Baccalaureate Certificate',
  '8':  "Master's Degree",
  '9':  "Post-Master's Certificate",
  '10': 'First Professional Degree',
  '11': 'Doctoral Degree',
  '12': 'Post-Doctoral Training',
};

// ── 1. Read all input files ────────────────────────────────────
console.log('Reading input files...');

const alcRows      = readCSV(`${OFLC}/ALC_Export.csv`);
const geoRows      = readCSV(`${OFLC}/Geography.csv`);
const socRows      = readCSV(`${OFLC}/oes_soc_occs.csv`);
const xwalkRows    = readCSV(`${OFLC}/xwalk_plus.csv`);
const jobZoneRows  = readTSV(`${ONET}/Job Zones.txt`);
const eduRows      = readTSV(`${ONET}/Education, Training, and Experience.txt`);

console.log(`  ALC_Export:   ${alcRows.length} rows`);
console.log(`  Geography:    ${geoRows.length} rows`);
console.log(`  SOC Occs:     ${socRows.length} rows`);
console.log(`  Crosswalk:    ${xwalkRows.length} rows`);
console.log(`  Job Zones:    ${jobZoneRows.length} rows`);
console.log(`  Education:    ${eduRows.length} rows`);

// Read CBSA xlsx
const wb = XLSX.readFile(CBSA);
const ws = wb.Sheets[wb.SheetNames[0]];
const cbsaRows = XLSX.utils.sheet_to_json(ws, { range: 2 });
console.log(`  CBSA delineation: ${cbsaRows.length} rows`);

// ── 2. Build FIPS map (CBSA code -> counties) ─────────────────
console.log('\nBuilding FIPS map...');
const fipsMap = buildFipsMap(cbsaRows);
const fipsMapSize = Object.keys(fipsMap).length;
console.log(`  CBSA codes mapped: ${fipsMapSize}`);

// Build allCountiesByState from Census national county file (ALL US counties)
const TERRITORY_FIPS = new Set(['60', '66', '69', '72', '78']);
const allCountiesByState = {};
const countyLines = readFileSync(COUNTIES, 'utf-8').split('\n');
for (let i = 1; i < countyLines.length; i++) {       // skip header
  const parts = countyLines[i].split('|');
  if (parts.length < 6) continue;
  const stateFips = parts[1]?.trim().padStart(2, '0');
  const countyFips = parts[2]?.trim().padStart(3, '0');
  const name = parts[4]?.trim();
  if (!stateFips || !countyFips) continue;
  if (TERRITORY_FIPS.has(stateFips)) continue;
  const fips = stateFips + countyFips;
  if (!allCountiesByState[stateFips]) allCountiesByState[stateFips] = [];
  allCountiesByState[stateFips].push({ fips, name });
}
let totalCounties = 0;
for (const cs of Object.values(allCountiesByState)) totalCounties += cs.length;
console.log(`  All US counties loaded: ${totalCounties}`);

// Build set of all FIPS covered by CBSA metro areas
const coveredFips = new Set();
for (const counties of Object.values(fipsMap)) {
  for (const c of counties) {
    coveredFips.add(c.fips);
  }
}
console.log(`  Counties covered by CBSA: ${coveredFips.size}`);

// ── 3. Build nonmetro map ──────────────────────────────────────
console.log('\nBuilding nonmetro map...');
// Identify geo rows whose Area is NOT a CBSA code in fipsMap
const nonmetroGeoRows = geoRows.filter(r => {
  const area = r.Area?.trim();
  return area && !fipsMap[area];
});
console.log(`  Nonmetro geo rows: ${nonmetroGeoRows.length}`);

const nonmetroMap = buildNonmetroMap(nonmetroGeoRows, allCountiesByState, coveredFips);
console.log(`  Nonmetro areas mapped: ${Object.keys(nonmetroMap).length}`);

// Combined FIPS map: CBSA + nonmetro
const combinedFipsMap = { ...fipsMap, ...nonmetroMap };

// ── 4. Build geo lookup (area -> name/stateAb/state) ──────────
console.log('\nBuilding geo lookup...');
const geoLookup = {};
for (const row of geoRows) {
  const area = row.Area?.trim();
  if (!area) continue;
  if (!geoLookup[area]) {
    geoLookup[area] = {
      name:    row.AreaName?.trim(),
      stateAb: row.StateAb?.trim(),
      state:   row.State?.trim(),
    };
  }
}
console.log(`  Unique areas in geo lookup: ${Object.keys(geoLookup).length}`);

// ── 5. Build SOC lookup (socCode -> title/description) ────────
console.log('\nBuilding SOC lookup...');
const socLookup = {};
for (const row of socRows) {
  const soc = row.soccode?.trim();
  if (!soc) continue;
  socLookup[soc] = {
    title:       row.Title?.trim(),
    description: row.Description?.trim(),
  };
}
console.log(`  SOC codes: ${Object.keys(socLookup).length}`);

// ── 6. Build O*NET lookup (socCode -> onetCode, prefer .00) ───
console.log('\nBuilding O*NET crosswalk lookup...');
const onetLookup = {};
for (const row of xwalkRows) {
  const soc = row.OES_SOCCODE?.trim();
  const onet = row.OnetCode?.trim();
  if (!soc || !onet) continue;
  // Prefer .00 base code; if we already have .00, skip non-.00
  if (onetLookup[soc] && onetLookup[soc].endsWith('.00') && !onet.endsWith('.00')) {
    continue;
  }
  onetLookup[soc] = onet;
}
console.log(`  O*NET mappings: ${Object.keys(onetLookup).length}`);

// ── 7. Build Job Zone lookup (onetCode -> jobZone) ────────────
console.log('\nBuilding job zone lookup...');
const jobZoneLookup = {};
for (const row of jobZoneRows) {
  const code = row['O*NET-SOC Code']?.trim();
  const zone = row['Job Zone']?.trim();
  if (!code || !zone) continue;
  jobZoneLookup[code] = parseInt(zone, 10);
}
console.log(`  Job zone entries: ${Object.keys(jobZoneLookup).length}`);

// ── 8. Build education lookup (onetCode -> edu label) ─────────
console.log('\nBuilding education lookup...');
const eduLookup = {};
const reqEduRows = eduRows.filter(r => r['Element Name'] === 'Required Level of Education');
console.log(`  Required Level of Education rows: ${reqEduRows.length}`);

// Group by O*NET code, pick category with highest Data Value
const eduByCode = {};
for (const row of reqEduRows) {
  const code = row['O*NET-SOC Code']?.trim();
  const cat = row.Category?.trim();
  const val = parseFloat(row['Data Value']);
  if (!code || !cat || isNaN(val)) continue;
  if (!eduByCode[code] || val > eduByCode[code].val) {
    eduByCode[code] = { cat, val };
  }
}
for (const [code, { cat }] of Object.entries(eduByCode)) {
  eduLookup[code] = EDU_LABELS[cat] || `Category ${cat}`;
}
console.log(`  Education entries: ${Object.keys(eduLookup).length}`);

// ── 9. GeoLvl dedup: keep lowest GeoLvl per Area+SocCode ─────
console.log('\nDeduplicating by GeoLvl...');
const dedupMap = {};
for (const row of alcRows) {
  const key = `${row.Area}|${row.SocCode}`;
  const lvl = parseInt(row.GeoLvl, 10);
  if (!dedupMap[key] || lvl < dedupMap[key].lvl) {
    dedupMap[key] = { row, lvl };
  }
}
const dedupRows = Object.values(dedupMap).map(e => e.row);
console.log(`  Before dedup: ${alcRows.length}, after: ${dedupRows.length}`);

// ── 10. Process wages ──────────────────────────────────────────
console.log('\nProcessing wages...');
const wages = {};  // area -> socCode -> {l1, l2, l3, l4, avg}
let skippedTerritory = 0;
let skippedNoFips = 0;
let processed = 0;

for (const row of dedupRows) {
  const area = row.Area?.trim();
  const soc = row.SocCode?.trim();
  if (!area || !soc) continue;

  // Skip territories
  const geo = geoLookup[area];
  if (geo && TERRITORY_STATES.has(geo.stateAb)) {
    skippedTerritory++;
    continue;
  }

  // Skip areas with no FIPS mapping
  if (!combinedFipsMap[area]) {
    skippedNoFips++;
    continue;
  }

  const w = normalizeWage(row);
  if (w.avg === null) continue;

  if (!wages[area]) wages[area] = {};
  wages[area][soc] = w;
  processed++;
}

console.log(`  Processed: ${processed}`);
console.log(`  Skipped (territory): ${skippedTerritory}`);
console.log(`  Skipped (no FIPS): ${skippedNoFips}`);

// ── 11. Build geography.json ───────────────────────────────────
console.log('\nBuilding geography.json...');
const geography = {};
const mappedAreas = new Set(Object.keys(wages));

for (const area of mappedAreas) {
  const geo = geoLookup[area];
  if (!geo) continue;
  const counties = combinedFipsMap[area] || [];
  geography[area] = {
    name:    geo.name,
    stateAb: geo.stateAb,
    state:   geo.state,
    counties,
  };
}
console.log(`  Areas in geography.json: ${Object.keys(geography).length}`);

// ── 12. Build occupations.json ─────────────────────────────────
console.log('\nBuilding occupations.json...');
// Collect all SOC codes actually used in wages
const usedSocs = new Set();
for (const areaSocs of Object.values(wages)) {
  for (const soc of Object.keys(areaSocs)) {
    usedSocs.add(soc);
  }
}

const occupations = {};
for (const soc of usedSocs) {
  const info = socLookup[soc] || {};
  const onetCode = onetLookup[soc] || null;
  const jobZone = onetCode ? (jobZoneLookup[onetCode] ?? null) : null;
  const education = onetCode ? (eduLookup[onetCode] ?? null) : null;

  occupations[soc] = {
    soc,
    title:       info.title || soc,
    description: info.description || '',
    onetCode,
    jobZone,
    education,
  };
}
console.log(`  Occupations: ${Object.keys(occupations).length}`);

// Spot check: how many have jobZone / education
const withJobZone = Object.values(occupations).filter(o => o.jobZone !== null).length;
const withEdu = Object.values(occupations).filter(o => o.education !== null).length;
console.log(`  With jobZone: ${withJobZone}, with education: ${withEdu}`);

// ── 13. Build aggregate.json ───────────────────────────────────
console.log('\nBuilding aggregate.json...');

function meanOfWages(wageList) {
  if (wageList.length === 0) return { l1: 0, l2: 0, l3: 0, l4: 0, avg: 0 };
  const sum = { l1: 0, l2: 0, l3: 0, l4: 0, avg: 0 };
  let counts = { l1: 0, l2: 0, l3: 0, l4: 0, avg: 0 };
  for (const w of wageList) {
    for (const k of ['l1', 'l2', 'l3', 'l4', 'avg']) {
      if (w[k] !== null) {
        sum[k] += w[k];
        counts[k]++;
      }
    }
  }
  return {
    l1:  counts.l1  ? Math.round(sum.l1  / counts.l1)  : 0,
    l2:  counts.l2  ? Math.round(sum.l2  / counts.l2)  : 0,
    l3:  counts.l3  ? Math.round(sum.l3  / counts.l3)  : 0,
    l4:  counts.l4  ? Math.round(sum.l4  / counts.l4)  : 0,
    avg: counts.avg ? Math.round(sum.avg / counts.avg) : 0,
  };
}

// Area averages: mean across all SOC codes for that area
const areaAggs = {};
for (const [area, socWages] of Object.entries(wages)) {
  const wageList = Object.values(socWages);
  areaAggs[area] = meanOfWages(wageList);
}

// State averages: simple mean of area averages within each state
const stateAreaWages = {};
for (const [area, agg] of Object.entries(areaAggs)) {
  const geo = geoLookup[area];
  if (!geo || !geo.stateAb) continue;
  if (!stateAreaWages[geo.stateAb]) stateAreaWages[geo.stateAb] = [];
  stateAreaWages[geo.stateAb].push(agg);
}

const stateAggs = {};
for (const [stateAb, areaWages] of Object.entries(stateAreaWages)) {
  stateAggs[stateAb] = meanOfWages(areaWages);
}

const aggregate = {
  areas:  areaAggs,
  states: stateAggs,
};

console.log(`  Area aggregates: ${Object.keys(areaAggs).length}`);
console.log(`  State aggregates: ${Object.keys(stateAggs).length}`);

// ── 14. Write output files ─────────────────────────────────────
console.log('\nWriting output files...');
mkdirSync(OUT, { recursive: true });

function writeJSON(filename, data) {
  const path = `${OUT}/${filename}`;
  const json = JSON.stringify(data);
  writeFileSync(path, json);
  const sizeMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(2);
  console.log(`  ${filename}: ${sizeMB} MB`);
}

writeJSON('wages.json', wages);
writeJSON('geography.json', geography);
writeJSON('occupations.json', occupations);
writeJSON('aggregate.json', aggregate);

// ── 15. Validation and statistics ──────────────────────────────
console.log('\n── Statistics ──');
const totalOflcAreas = new Set(alcRows.map(r => r.Area?.trim())).size;
const mappedAreaCount = Object.keys(geography).length;
const mappingRate = ((mappedAreaCount / totalOflcAreas) * 100).toFixed(1);
console.log(`  Total OFLC areas: ${totalOflcAreas}`);
console.log(`  Mapped areas: ${mappedAreaCount}`);
console.log(`  Area mapping rate: ${mappingRate}%`);
console.log(`  Unique SOC codes in output: ${usedSocs.size}`);
console.log(`  States in aggregate: ${Object.keys(stateAggs).length}`);

// Spot checks
const spotSocs = ['11-1011', '15-1252', '29-1141'];
console.log('\n── Spot Checks ──');
for (const soc of spotSocs) {
  const occ = occupations[soc];
  if (occ) {
    console.log(`  ${soc}: ${occ.title} | zone=${occ.jobZone} | edu=${occ.education}`);
  } else {
    console.log(`  ${soc}: not found in output`);
  }
}

console.log('\nPipeline complete.');
