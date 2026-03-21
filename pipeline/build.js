import { readCSV, readTSV } from './lib/parse-csv.js';
import { normalizeWage } from './lib/wage-normalizer.js';
import { buildFipsMap } from './lib/fips-mapper.js';
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

// ── CT planning region FIPS → old county FIPS mapping ────────
// CT replaced its 8 counties with 9 planning regions in 2022.
// The TopoJSON still uses old county FIPS (09001-09015), but CBSA
// delineation uses planning region codes (09110-09190).
// This map translates each planning region to the old county(ies)
// whose geography it primarily covers.
// When multiple planning regions map to the same old county, the primary
// (larger-population) MSA wins the mapping for choropleth purposes.
// 09140 Naugatuck Valley spans parts of New Haven, Litchfield, and Fairfield
// counties but those old FIPS are claimed by more significant MSAs (35300, 14860).
// 09190 Western CT spans northern Fairfield — already claimed by 14860 Bridgeport.
const CT_PLANNING_TO_OLD_COUNTIES = {
  '09110': [{ fips: '09003', name: 'Hartford County' },
            { fips: '09013', name: 'Tolland County' }],       // Capitol
  '09120': [{ fips: '09001', name: 'Fairfield County' }],     // Greater Bridgeport (south Fairfield)
  '09130': [{ fips: '09007', name: 'Middlesex County' }],     // Lower CT River Valley
  '09140': [],                                                 // Naugatuck Valley — no unique old county
  '09150': [{ fips: '09015', name: 'Windham County' }],       // Northeastern CT
  '09160': [{ fips: '09005', name: 'Litchfield County' }],    // Northwest Hills
  '09170': [{ fips: '09009', name: 'New Haven County' }],     // South Central CT
  '09180': [{ fips: '09011', name: 'New London County' }],    // Southeastern CT
  '09190': [],                                                 // Western CT — no unique old county
};

// CT planning region names → old county FIPS (for nonmetro matching)
const CT_PLANNING_NAME_TO_COUNTIES = {
  'northeastern connecticut planning region': [{ fips: '09015', name: 'Windham County' }],
  'northwest hills planning region':          [{ fips: '09005', name: 'Litchfield County' }],
  'capitol planning region':                  [{ fips: '09003', name: 'Hartford County' },
                                               { fips: '09013', name: 'Tolland County' }],
  'greater bridgeport planning region':       [{ fips: '09001', name: 'Fairfield County' }],
  'lower connecticut river valley planning region': [{ fips: '09007', name: 'Middlesex County' }],
  'naugatuck valley planning region':         [{ fips: '09009', name: 'New Haven County' }],
  'south central connecticut planning region': [{ fips: '09009', name: 'New Haven County' }],
  'southeastern connecticut planning region': [{ fips: '09011', name: 'New London County' }],
  'western connecticut planning region':      [{ fips: '09001', name: 'Fairfield County' }],
};

// ── 2. Build FIPS map (CBSA code -> counties) ─────────────────
console.log('\nBuilding FIPS map...');
const fipsMapRaw = buildFipsMap(cbsaRows);

// Replace CT planning region FIPS with old county FIPS in CBSA map
const fipsMap = {};
for (const [cbsa, counties] of Object.entries(fipsMapRaw)) {
  const translated = [];
  const seen = new Set();
  for (const c of counties) {
    const ctMapping = CT_PLANNING_TO_OLD_COUNTIES[c.fips];
    if (ctMapping) {
      for (const old of ctMapping) {
        if (!seen.has(old.fips)) {
          seen.add(old.fips);
          translated.push(old);
        }
      }
    } else {
      if (!seen.has(c.fips)) {
        seen.add(c.fips);
        translated.push(c);
      }
    }
  }
  fipsMap[cbsa] = translated;
}

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

// Build set of OFLC area codes (only CBSAs the wage data actually references)
const oflcAreaCodes = new Set(geoRows.map(r => r.Area?.trim()).filter(Boolean));

// Build set of FIPS covered by CBSAs that have OFLC wage data.
// Micropolitan CBSAs without wage data should fall through to nonmetro assignment.
const coveredFips = new Set();
for (const [cbsa, counties] of Object.entries(fipsMap)) {
  if (!oflcAreaCodes.has(cbsa)) continue;   // skip CBSAs absent from OFLC
  for (const c of counties) {
    coveredFips.add(c.fips);
  }
}
console.log(`  Counties covered by CBSA with OFLC data: ${coveredFips.size}`);

// ── 3. Build nonmetro map from Geography.csv county assignments ─
console.log('\nBuilding nonmetro map from Geography.csv...');

// State abbreviation to FIPS mapping
const STATE_AB_TO_FIPS = {
  'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09','DE':'10',
  'DC':'11','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18','IA':'19',
  'KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25','MI':'26','MN':'27',
  'MS':'28','MO':'29','MT':'30','NE':'31','NV':'32','NH':'33','NJ':'34','NM':'35',
  'NY':'36','NC':'37','ND':'38','OH':'39','OK':'40','OR':'41','PA':'42','RI':'44',
  'SC':'45','SD':'46','TN':'47','TX':'48','UT':'49','VT':'50','VA':'51','WA':'53',
  'WV':'54','WI':'55','WY':'56'
};

// Build lookup from national county file: "stateFips|normalizedName" → countyFips
const countyNameToFips = {};
for (const [stateFips, counties] of Object.entries(allCountiesByState)) {
  for (const c of counties) {
    const normalized = c.name.toLowerCase()
      .replace(/ county$/, '').replace(/ parish$/, '').replace(/ borough$/, '')
      .replace(/ census area$/, '').replace(/ municipality$/, '')
      .replace(/ city and borough$/, '').replace(/ city$/, '').trim();
    countyNameToFips[stateFips + '|' + normalized] = c.fips;
    // Also store exact lowercase name as fallback
    countyNameToFips[stateFips + '|' + c.name.toLowerCase().trim()] = c.fips;
  }
}

// Map nonmetro Geography.csv entries to county FIPS directly
const nonmetroMap = {};
let nonmetroMatched = 0;
let nonmetroUnmatched = 0;
for (const row of geoRows) {
  const area = row.Area?.replace(/"/g, '').trim();
  if (!area) continue;
  if (fipsMap[area]) continue; // Already a CBSA metro area

  const stateAb = row.StateAb?.replace(/"/g, '').trim();
  if (!stateAb) continue;
  if (TERRITORY_STATES.has(stateAb)) continue;

  const stateFips = STATE_AB_TO_FIPS[stateAb];
  if (!stateFips) continue;

  const countyName = row.CountyTownName?.replace(/"/g, '').trim();
  if (!countyName) continue;

  const normalized = countyName.toLowerCase()
    .replace(/ county$/, '').replace(/ parish$/, '').replace(/ borough$/, '')
    .replace(/ census area$/, '').replace(/ municipality$/, '')
    .replace(/ city and borough$/, '').replace(/ city$/, '').trim();

  const fips = countyNameToFips[stateFips + '|' + normalized]
            || countyNameToFips[stateFips + '|' + countyName.toLowerCase().trim()];

  if (fips) {
    if (!nonmetroMap[area]) nonmetroMap[area] = [];
    nonmetroMap[area].push({ fips, name: countyName });
    nonmetroMatched++;
  } else {
    // Try CT planning region name mapping
    const ctMapping = CT_PLANNING_NAME_TO_COUNTIES[countyName.toLowerCase().trim()];
    if (ctMapping && stateAb === 'CT') {
      if (!nonmetroMap[area]) nonmetroMap[area] = [];
      for (const old of ctMapping) {
        // Avoid duplicate FIPS within the same area
        if (!nonmetroMap[area].some(e => e.fips === old.fips)) {
          nonmetroMap[area].push(old);
          nonmetroMatched++;
        }
      }
    } else {
      console.warn(`  Unmatched nonmetro county: ${countyName} (${stateAb})`);
      nonmetroUnmatched++;
    }
  }
}
console.log(`  Nonmetro areas mapped: ${Object.keys(nonmetroMap).length}`);
console.log(`  Nonmetro counties matched: ${nonmetroMatched}, unmatched: ${nonmetroUnmatched}`);

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

  // Skip areas with no FIPS mapping (or empty county list)
  if (!combinedFipsMap[area] || combinedFipsMap[area].length === 0) {
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

// Reverse mapping: FIPS → state abbreviation
const FIPS_TO_STATE_AB = {};
for (const [ab, fips] of Object.entries(STATE_AB_TO_FIPS)) {
  FIPS_TO_STATE_AB[fips] = ab;
}

// State averages: attribute each area to ALL states it has counties in.
// This ensures cross-state MSA wages contribute to every state they touch.
const stateAreaWages = {};
for (const [area, agg] of Object.entries(areaAggs)) {
  const geoInfo = geography[area];
  if (!geoInfo) continue;

  // Find all unique states this area touches via county FIPS prefixes
  const statesInArea = new Set();
  for (const c of geoInfo.counties) {
    const sf = c.fips.substring(0, 2);
    const ab = FIPS_TO_STATE_AB[sf];
    if (ab) statesInArea.add(ab);
  }

  for (const ab of statesInArea) {
    if (!stateAreaWages[ab]) stateAreaWages[ab] = [];
    stateAreaWages[ab].push(agg);
  }
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
