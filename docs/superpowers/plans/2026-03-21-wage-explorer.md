# Wage Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static SvelteKit + D3.js dashboard that visualizes OFLC prevailing wage data by occupation and U.S. geography, deployed to GitHub Pages.

**Architecture:** Node.js pipeline reads OFLC CSVs + O*NET data + Census CBSA delineation, joins on SOC code, outputs JSON. SvelteKit frontend renders a US choropleth map (states at national level, counties on drill-down) with filters and tooltips. Static build via adapter-static.

**Tech Stack:** Node.js (pipeline), SvelteKit 5 + adapter-static (frontend), D3.js v7 + topojson-client (map), us-atlas (TopoJSON geometry), IBM Plex Sans/Mono (fonts)

**Spec:** `docs/superpowers/specs/2026-03-21-wage-explorer-design.md`

**Source data:** `/mnt/c/Users/vfizr/Downloads/OFLC_Wages_2025-26_Updated/`

---

## File Structure

```
h1b/
  pipeline/
    build.js              — main pipeline script: reads CSVs, joins, outputs JSON
    lib/
      parse-csv.js        — CSV parsing helper (d3-dsv)
      wage-normalizer.js  — Label-aware unit conversion (annual→hourly, null handling)
      fips-mapper.js      — CBSA delineation → county FIPS lookup builder
      nonmetro-mapper.js  — maps OFLC nonmetro "Balance of State" areas to remaining counties
  data/
    raw/
      oflc/               — OFLC CSVs (copied from Downloads, gitignored)
      onet/               — O*NET Job Zones + Education CSVs (downloaded, gitignored)
      cbsa/               — Census CBSA delineation CSV (downloaded, gitignored)
  static/
    data/
      wages.json          — pipeline output: wages by SOC x Area (committed)
      occupations.json    — pipeline output: occupation lookup (committed)
      geography.json      — pipeline output: area → county FIPS mapping (committed)
      aggregate.json      — pipeline output: cross-occupation averages (committed)
  src/
    routes/
      +page.svelte        — main page layout (header, filters, map)
      +page.js            — load function: fetch all JSON
    lib/
      components/
        FilterBar.svelte  — occupation search, dropdowns, toggle
        USMap.svelte      — D3 choropleth: state view + county drill-down
        Tooltip.svelte    — hover tooltip with wage data
        Dropdown.svelte   — reusable custom dropdown component
      state.svelte.js     — shared reactive state ($state runes)
      utils/
        colors.js         — Ember color scale (d3.scaleQuantize)
        format.js         — wage formatting: hourly/annual, currency
  svelte.config.js        — SvelteKit config with adapter-static
  package.json
  .gitignore
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `svelte.config.js`, `src/app.html`, `src/routes/+page.svelte`, `src/routes/+page.js`, `static/.gitkeep`, `.gitignore`

- [ ] **Step 1: Initialize SvelteKit project**

```bash
cd /mnt/c/dev/h1b
npm create svelte@latest . -- --template minimal --types none
```

Select: Skeleton project, No TypeScript, No ESLint, No Prettier (keep it minimal for weekend build).

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install -D @sveltejs/adapter-static
npm install d3 topojson-client
```

- [ ] **Step 3: Configure adapter-static**

Replace `svelte.config.js` contents:

```javascript
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html',
      precompress: false
    }),
    paths: {
      base: process.env.NODE_ENV === 'production' ? '/h1b' : ''
    }
  }
};

export default config;
```

- [ ] **Step 4: Set up .gitignore**

Append to `.gitignore`:

```
data/raw/
node_modules/
build/
.svelte-kit/
.superpowers/
```

- [ ] **Step 5: Create minimal page that loads**

`src/routes/+page.svelte`:
```svelte
<h1>Wage Explorer</h1>
<p>Loading...</p>
```

- [ ] **Step 6: Verify dev server starts**

Run: `npm run dev`
Expected: Page loads at localhost:5173 showing "Wage Explorer"

- [ ] **Step 7: Verify static build works**

Run: `npm run build`
Expected: `build/` directory created with `index.html`

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold SvelteKit project with adapter-static"
```

---

## Task 2: Copy Raw Data and Download Dependencies

**Files:**
- Create: `data/raw/oflc/`, `data/raw/onet/`, `data/raw/cbsa/`, `pipeline/download-deps.sh`

- [ ] **Step 1: Copy OFLC data from Downloads**

```bash
mkdir -p data/raw/oflc
cp "/mnt/c/Users/vfizr/Downloads/OFLC_Wages_2025-26_Updated/ALC_Export.csv" data/raw/oflc/
cp "/mnt/c/Users/vfizr/Downloads/OFLC_Wages_2025-26_Updated/Geography.csv" data/raw/oflc/
cp "/mnt/c/Users/vfizr/Downloads/OFLC_Wages_2025-26_Updated/oes_soc_occs.csv" data/raw/oflc/
cp "/mnt/c/Users/vfizr/Downloads/OFLC_Wages_2025-26_Updated/xwalk_plus.csv" data/raw/oflc/
```

- [ ] **Step 2: Download O*NET bulk data**

```bash
mkdir -p data/raw/onet
curl -L "https://www.onetcenter.org/dl_files/database/db_30_2_text.zip" -o /tmp/onet.zip
unzip -j /tmp/onet.zip "db_30_2_text/Job Zones.txt" -d data/raw/onet/
unzip -j /tmp/onet.zip "db_30_2_text/Education, Training, and Experience.txt" -d data/raw/onet/
rm /tmp/onet.zip
```

Note: O*NET uses `.txt` extension but they are tab-delimited. Check header row to confirm delimiter.

- [ ] **Step 3: Download Census CBSA delineation**

```bash
mkdir -p data/raw/cbsa
curl -L "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xls" -o data/raw/cbsa/cbsa_delineation.xls
```

If .xls is hard to parse in Node, use the CSV version or convert. Alternative: search for a CSV version at the Census site. If needed, use the `xlsx` npm package to read it.

- [ ] **Step 4: Create download script for reproducibility**

`pipeline/download-deps.sh`:
```bash
#!/bin/bash
set -e
echo "Downloading O*NET 30.2..."
mkdir -p data/raw/onet
curl -L "https://www.onetcenter.org/dl_files/database/db_30_2_text.zip" -o /tmp/onet.zip
unzip -o -j /tmp/onet.zip "db_30_2_text/Job Zones.txt" -d data/raw/onet/
unzip -o -j /tmp/onet.zip "db_30_2_text/Education, Training, and Experience.txt" -d data/raw/onet/
rm /tmp/onet.zip

echo "Downloading Census CBSA delineation..."
mkdir -p data/raw/cbsa
curl -L "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xls" -o data/raw/cbsa/cbsa_delineation.xls

echo "Done. Place OFLC CSVs manually in data/raw/oflc/"
```

- [ ] **Step 5: Verify all raw files exist**

```bash
ls -la data/raw/oflc/*.csv data/raw/onet/*.txt data/raw/cbsa/*
```

Expected: 4 OFLC CSVs, 2 O*NET txt files, 1 CBSA xls file.

- [ ] **Step 6: Commit download script only (raw data is gitignored)**

```bash
git add pipeline/download-deps.sh
git commit -m "feat: add download script for O*NET and CBSA data"
```

---

## Task 3: Pipeline — CSV Parsing and Wage Normalization

**Files:**
- Create: `pipeline/lib/parse-csv.js`, `pipeline/lib/wage-normalizer.js`
- Test: `pipeline/lib/__tests__/wage-normalizer.test.js`

- [ ] **Step 1: Install pipeline dev dependencies**

```bash
npm install d3-dsv xlsx
npm install -D vitest
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Write failing test for wage normalization**

`pipeline/lib/__tests__/wage-normalizer.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { normalizeWage } from '../wage-normalizer.js';

describe('normalizeWage', () => {
  it('passes through hourly wages as integer cents', () => {
    const row = { Level1: '47.73', Level2: '74.99', Level3: '102.25', Level4: '129.51', Average: '102.53', Label: '' };
    const result = normalizeWage(row);
    expect(result).toEqual({ l1: 4773, l2: 7499, l3: 10225, l4: 12951, avg: 10253 });
  });

  it('converts annual wages to hourly cents', () => {
    const row = { Level1: '67600', Level2: '89000', Level3: '110000', Level4: '131000', Average: '99000', Label: 'Annual Wage' };
    const result = normalizeWage(row);
    expect(result.l1).toBe(Math.round(67600 / 2080 * 100));
    expect(result.avg).toBe(Math.round(99000 / 2080 * 100));
  });

  it('returns null levels for High Wage rows', () => {
    const row = { Level1: '', Level2: '', Level3: '', Level4: '', Average: '157.79', Label: 'High Wage' };
    const result = normalizeWage(row);
    expect(result.l1).toBeNull();
    expect(result.l2).toBeNull();
    expect(result.l3).toBeNull();
    expect(result.l4).toBeNull();
    expect(result.avg).toBe(15779);
  });

  it('returns null levels for No Leveled Wage rows', () => {
    const row = { Level1: '', Level2: '', Level3: '', Level4: '', Average: '45.00', Label: 'No Leveled Wage' };
    const result = normalizeWage(row);
    expect(result.l1).toBeNull();
    expect(result.avg).toBe(4500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run pipeline/lib/__tests__/wage-normalizer.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Implement wage normalizer**

`pipeline/lib/wage-normalizer.js`:
```javascript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run pipeline/lib/__tests__/wage-normalizer.test.js`
Expected: 4 tests PASS

- [ ] **Step 6: Implement CSV parser helper**

`pipeline/lib/parse-csv.js`:
```javascript
import { readFileSync } from 'fs';
import { csvParse, tsvParse } from 'd3-dsv';

export function readCSV(path) {
  const text = readFileSync(path, 'utf-8');
  return csvParse(text);
}

export function readTSV(path) {
  const text = readFileSync(path, 'utf-8');
  return tsvParse(text);
}
```

- [ ] **Step 7: Commit**

```bash
git add pipeline/lib/ package.json package-lock.json
git commit -m "feat: add CSV parsing and wage normalization with tests"
```

---

## Task 4: Pipeline — FIPS Mapper

**Files:**
- Create: `pipeline/lib/fips-mapper.js`
- Test: `pipeline/lib/__tests__/fips-mapper.test.js`

- [ ] **Step 1: Inspect CBSA delineation file structure**

```bash
node -e "
const XLSX = require('xlsx');
const wb = XLSX.readFile('data/raw/cbsa/cbsa_delineation.xls');
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, {range: 2});
console.log('Columns:', Object.keys(data[0]));
console.log('First row:', data[0]);
console.log('Total rows:', data.length);
"
```

Identify the columns for CBSA Code, FIPS State Code, FIPS County Code, County/County Equivalent. Adjust the mapper implementation based on actual column names.

- [ ] **Step 2: Write failing test for FIPS mapper**

`pipeline/lib/__tests__/fips-mapper.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { buildFipsMap } from '../fips-mapper.js';

describe('buildFipsMap', () => {
  it('maps CBSA code to array of county FIPS', () => {
    // Mock CBSA rows (adjust column names after Step 1)
    const cbsaRows = [
      { 'CBSA Code': '10180', 'FIPS State Code': '48', 'FIPS County Code': '059', 'County/County Equivalent': 'Callahan County' },
      { 'CBSA Code': '10180', 'FIPS State Code': '48', 'FIPS County Code': '253', 'County/County Equivalent': 'Jones County' },
      { 'CBSA Code': '10180', 'FIPS State Code': '48', 'FIPS County Code': '441', 'County/County Equivalent': 'Taylor County' },
    ];
    const map = buildFipsMap(cbsaRows);
    expect(map['10180']).toHaveLength(3);
    expect(map['10180']).toContainEqual({ fips: '48059', name: 'Callahan County' });
    expect(map['10180']).toContainEqual({ fips: '48441', name: 'Taylor County' });
  });

  it('filters out territory entries (FIPS state >= 60)', () => {
    const cbsaRows = [
      { 'CBSA Code': '99999', 'FIPS State Code': '72', 'FIPS County Code': '001', 'County/County Equivalent': 'Adjuntas' },
    ];
    const map = buildFipsMap(cbsaRows);
    expect(map['99999']).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run pipeline/lib/__tests__/fips-mapper.test.js`
Expected: FAIL — module not found

- [ ] **Step 4: Implement FIPS mapper**

`pipeline/lib/fips-mapper.js`:
```javascript
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
```

Note: Column names may differ from what's shown — adjust after Step 1 inspection. The CBSA delineation file's exact headers need verification.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run pipeline/lib/__tests__/fips-mapper.test.js`
Expected: 2 tests PASS

- [ ] **Step 6: Commit**

```bash
git add pipeline/lib/fips-mapper.js pipeline/lib/__tests__/fips-mapper.test.js
git commit -m "feat: add CBSA-to-county-FIPS mapper with tests"
```

---

## Task 4b: Pipeline — Nonmetro Area Mapper

**Files:**
- Create: `pipeline/lib/nonmetro-mapper.js`
- Test: `pipeline/lib/__tests__/nonmetro-mapper.test.js`

OFLC "Balance of State" nonmetro areas use OFLC-internal area codes (e.g., `100001` for "Northwest Alabama nonmetropolitan area"), NOT CBSA codes. These will not match the CBSA delineation file. We need a strategy to map them to counties.

**Strategy:** Build a set of all county FIPS already covered by metro CBSA areas. Then, for each nonmetro OFLC area, use `Geography.csv` to get its `StateAb`, and assign it all county FIPS in that state that are NOT already covered by a metro area. The Census CBSA delineation provides a complete list of counties with their state FIPS, so we can derive the full county set per state from it.

- [ ] **Step 1: Write failing test for nonmetro mapper**

`pipeline/lib/__tests__/nonmetro-mapper.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { buildNonmetroMap } from '../nonmetro-mapper.js';

describe('buildNonmetroMap', () => {
  it('assigns uncovered counties to nonmetro areas by state', () => {
    // All counties in state 48 (TX)
    const allCountiesByState = {
      '48': [
        { fips: '48059', name: 'Callahan County' },
        { fips: '48253', name: 'Jones County' },
        { fips: '48441', name: 'Taylor County' },
        { fips: '48999', name: 'Rural County' },
      ]
    };
    // Metro FIPS already mapped (Abilene MSA covers 48059, 48253, 48441)
    const coveredFips = new Set(['48059', '48253', '48441']);
    // Geography rows for nonmetro areas
    const geoRows = [
      { Area: '900048', StateAb: 'TX', AreaName: 'Balance of Texas' },
    ];

    const map = buildNonmetroMap(geoRows, allCountiesByState, coveredFips);
    expect(map['900048']).toHaveLength(1);
    expect(map['900048'][0].fips).toBe('48999');
  });

  it('skips territories', () => {
    const allCountiesByState = { '72': [{ fips: '72001', name: 'Adjuntas' }] };
    const coveredFips = new Set();
    const geoRows = [{ Area: '900072', StateAb: 'PR', AreaName: 'Balance of PR' }];

    const map = buildNonmetroMap(geoRows, allCountiesByState, coveredFips);
    expect(map['900072']).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run pipeline/lib/__tests__/nonmetro-mapper.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement nonmetro mapper**

`pipeline/lib/nonmetro-mapper.js`:
```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run pipeline/lib/__tests__/nonmetro-mapper.test.js`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/lib/nonmetro-mapper.js pipeline/lib/__tests__/nonmetro-mapper.test.js
git commit -m "feat: add nonmetro Balance of State area mapper with tests"
```

---

## Task 5: Pipeline — Main Build Script

**Files:**
- Create: `pipeline/build.js`

- [ ] **Step 1: Implement main build script**

`pipeline/build.js`:
```javascript
import { readCSV, readTSV } from './lib/parse-csv.js';
import { normalizeWage } from './lib/wage-normalizer.js';
import { buildFipsMap } from './lib/fips-mapper.js';
import { buildNonmetroMap } from './lib/nonmetro-mapper.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const RAW = resolve(ROOT, 'data/raw');
const OUT = resolve(ROOT, 'static/data');

mkdirSync(OUT, { recursive: true });

console.log('Reading OFLC data...');
const alcRows = readCSV(resolve(RAW, 'oflc/ALC_Export.csv'));
const geoRows = readCSV(resolve(RAW, 'oflc/Geography.csv'));
const socRows = readCSV(resolve(RAW, 'oflc/oes_soc_occs.csv'));
const xwalkRows = readCSV(resolve(RAW, 'oflc/xwalk_plus.csv'));

console.log('Reading O*NET data...');
const jobZoneRows = readTSV(resolve(RAW, 'onet/Job Zones.txt'));
const educationRows = readTSV(resolve(RAW, 'onet/Education, Training, and Experience.txt'));

console.log('Reading CBSA delineation...');
const wb = XLSX.readFile(resolve(RAW, 'cbsa/cbsa_delineation.xls'));
const ws = wb.Sheets[wb.SheetNames[0]];
// NOTE: range may need adjustment after inspecting actual file in Task 4 Step 1
const cbsaRows = XLSX.utils.sheet_to_json(ws, { range: 2 });

// --- Build lookups ---

// CBSA → county FIPS (metro areas)
const fipsMap = buildFipsMap(cbsaRows);

// Build complete county list per state from CBSA file (for nonmetro mapping)
const allCountiesByState = {};
for (const row of cbsaRows) {
  const sf = row['FIPS State Code']?.trim().padStart(2, '0');
  const cf = row['FIPS County Code']?.trim().padStart(3, '0');
  const name = row['County/County Equivalent']?.trim();
  if (!sf || !cf || parseInt(sf, 10) >= 60) continue;
  if (!allCountiesByState[sf]) allCountiesByState[sf] = [];
  allCountiesByState[sf].push({ fips: sf + cf, name });
}

// Collect all FIPS already covered by metro areas
const coveredFips = new Set();
for (const counties of Object.values(fipsMap)) {
  for (const c of counties) coveredFips.add(c.fips);
}

// Geography: Area → { name, stateAb, state }
const geoLookup = {};
for (const row of geoRows) {
  const area = row.Area?.replace(/"/g, '').trim();
  if (!geoLookup[area]) {
    geoLookup[area] = { name: row.AreaName, stateAb: row.StateAb, state: row.State };
  }
}

// Identify nonmetro areas (in Geography but not in CBSA fipsMap)
const nonmetroGeoRows = Object.entries(geoLookup)
  .filter(([area]) => !fipsMap[area])
  .map(([area, info]) => ({ Area: area, StateAb: info.stateAb, AreaName: info.name }));

const nonmetroMap = buildNonmetroMap(nonmetroGeoRows, allCountiesByState, coveredFips);
console.log(`Nonmetro areas mapped: ${Object.keys(nonmetroMap).length} (covering ${Object.values(nonmetroMap).flat().length} counties)`);

// Merge nonmetro into fipsMap
for (const [area, counties] of Object.entries(nonmetroMap)) {
  fipsMap[area] = counties;
}

// SOC → { title, description }
const socLookup = {};
for (const row of socRows) {
  const code = row.soccode?.replace(/"/g, '').trim();
  socLookup[code] = { title: row.Title, description: row.Description };
}

// SOC → O*NET code (prefer .00 base code)
const onetLookup = {};
for (const row of xwalkRows) {
  const soc = row.OES_SOCCODE?.replace(/"/g, '').trim();
  const onet = row.OnetCode?.replace(/"/g, '').trim();
  if (!onetLookup[soc] || onet.endsWith('.00')) {
    onetLookup[soc] = onet;
  }
}

// O*NET code → Job Zone
const jobZoneLookup = {};
for (const row of jobZoneRows) {
  const onet = row['O*NET-SOC Code']?.trim();
  const zone = parseInt(row['Job Zone']?.trim(), 10);
  if (onet && !isNaN(zone)) jobZoneLookup[onet] = zone;
}

// O*NET code → Education (highest percentage "Required Level of Education")
const eduLookup = {};
const eduBest = {}; // track best percentage per O*NET code
for (const row of educationRows) {
  const onet = row['O*NET-SOC Code']?.trim();
  const cat = row['Element Name']?.trim();
  const pct = parseFloat(row['Data Value']) || 0;
  if (cat === 'Required Level of Education' && row['Category']?.trim()) {
    if (!eduBest[onet] || pct > eduBest[onet]) {
      eduBest[onet] = pct;
      eduLookup[onet] = row['Category'].trim();
    }
  }
}

// --- Process wages ---
console.log('Processing wages...');

// GeoLvl dedup: keep lowest GeoLvl per Area+SocCode
const wageKey = (area, soc) => `${area}|${soc}`;
const bestGeoLvl = {};
for (const row of alcRows) {
  const area = row.Area?.replace(/"/g, '').trim();
  const soc = row.SocCode?.replace(/"/g, '').trim();
  const geo = parseInt(row.GeoLvl, 10);
  const key = wageKey(area, soc);
  if (!bestGeoLvl[key] || geo < bestGeoLvl[key]) {
    bestGeoLvl[key] = geo;
  }
}

const wages = [];
let skipped = 0;

for (const row of alcRows) {
  const area = row.Area?.replace(/"/g, '').trim();
  const soc = row.SocCode?.replace(/"/g, '').trim();
  const geo = parseInt(row.GeoLvl, 10);
  const key = wageKey(area, soc);

  if (geo !== bestGeoLvl[key]) continue;

  // Skip if area has no FIPS mapping (territories or unmapped areas)
  if (!fipsMap[area]) { skipped++; continue; }

  const w = normalizeWage(row);
  if (w.avg === null) continue;

  wages.push({ soc, area, ...w });
}

console.log(`Wages: ${wages.length} rows (${skipped} skipped - no FIPS mapping)`);

// Validation: report OFLC-to-CBSA join rate
const totalOflcAreas = new Set(Object.keys(geoLookup)).size;
const mappedAreas = Object.keys(geoLookup).filter(a => fipsMap[a]).length;
console.log(`Area mapping: ${mappedAreas}/${totalOflcAreas} areas mapped (${(mappedAreas/totalOflcAreas*100).toFixed(1)}%)`);

// --- Build geography.json ---
const geography = {};
for (const [area, info] of Object.entries(geoLookup)) {
  const counties = fipsMap[area];
  if (!counties) continue;
  geography[area] = { name: info.name, stateAb: info.stateAb, state: info.state, counties };
}

// --- Build occupations.json ---
const occupations = {};
for (const [soc, info] of Object.entries(socLookup)) {
  const onet = onetLookup[soc] || null;
  const zone = onet ? (jobZoneLookup[onet] || null) : null;
  const edu = onet ? (eduLookup[onet] || null) : null;
  occupations[soc] = { soc, title: info.title, description: info.description, onetCode: onet, jobZone: zone, education: edu };
}

// --- Build aggregate.json (state-level + area-level averages) ---
const areaAgg = {};  // area → { sum, count } for each metric
const stateAreas = {}; // stateAb → Set of areas

for (const w of wages) {
  if (!areaAgg[w.area]) areaAgg[w.area] = { l1Sum: 0, l2Sum: 0, l3Sum: 0, l4Sum: 0, avgSum: 0, count: 0, l1Count: 0 };
  const a = areaAgg[w.area];
  a.avgSum += w.avg; a.count++;
  if (w.l1 !== null) { a.l1Sum += w.l1; a.l2Sum += w.l2; a.l3Sum += w.l3; a.l4Sum += w.l4; a.l1Count++; }
}

const areaAvg = {};
for (const [area, a] of Object.entries(areaAgg)) {
  areaAvg[area] = {
    l1: a.l1Count > 0 ? Math.round(a.l1Sum / a.l1Count) : null,
    l2: a.l1Count > 0 ? Math.round(a.l2Sum / a.l1Count) : null,
    l3: a.l1Count > 0 ? Math.round(a.l3Sum / a.l1Count) : null,
    l4: a.l1Count > 0 ? Math.round(a.l4Sum / a.l1Count) : null,
    avg: Math.round(a.avgSum / a.count),
  };
  const geo = geoLookup[area];
  if (geo) {
    if (!stateAreas[geo.stateAb]) stateAreas[geo.stateAb] = [];
    stateAreas[geo.stateAb].push(area);
  }
}

const stateAvg = {};
for (const [st, areas] of Object.entries(stateAreas)) {
  const vals = areas.map(a => areaAvg[a]).filter(Boolean);
  if (vals.length === 0) continue;
  stateAvg[st] = {
    l1: Math.round(vals.reduce((s, v) => s + (v.l1 || 0), 0) / vals.filter(v => v.l1 !== null).length) || null,
    l2: Math.round(vals.reduce((s, v) => s + (v.l2 || 0), 0) / vals.filter(v => v.l2 !== null).length) || null,
    l3: Math.round(vals.reduce((s, v) => s + (v.l3 || 0), 0) / vals.filter(v => v.l3 !== null).length) || null,
    l4: Math.round(vals.reduce((s, v) => s + (v.l4 || 0), 0) / vals.filter(v => v.l4 !== null).length) || null,
    avg: Math.round(vals.reduce((s, v) => s + v.avg, 0) / vals.length),
  };
}

// --- Write output ---
console.log('Writing output...');

writeFileSync(resolve(OUT, 'wages.json'), JSON.stringify(wages));
writeFileSync(resolve(OUT, 'occupations.json'), JSON.stringify(occupations));
writeFileSync(resolve(OUT, 'geography.json'), JSON.stringify(geography));
writeFileSync(resolve(OUT, 'aggregate.json'), JSON.stringify({ areas: areaAvg, states: stateAvg }));

console.log(`Output files written to ${OUT}`);
console.log(`  wages.json: ${wages.length} rows`);
console.log(`  occupations.json: ${Object.keys(occupations).length} occupations`);
console.log(`  geography.json: ${Object.keys(geography).length} areas`);
console.log(`  aggregate.json: ${Object.keys(stateAvg).length} states, ${Object.keys(areaAvg).length} areas`);
```

- [ ] **Step 2: Add pipeline script to package.json**

Add to `package.json` scripts:
```json
"pipeline": "node pipeline/build.js"
```

- [ ] **Step 3: Run the pipeline**

Run: `npm run pipeline`
Expected: Output showing row counts for each file. No errors. Files created in `static/data/`.

- [ ] **Step 4: Validate output sizes and spot-check data**

```bash
ls -lh static/data/
node -e "const w = require('./static/data/wages.json'); console.log('Wage rows:', w.length); console.log('Sample:', w[0]);"
node -e "const o = require('./static/data/occupations.json'); console.log('Occupations:', Object.keys(o).length); console.log('Sample:', o['15-1252']);"
node -e "const g = require('./static/data/geography.json'); console.log('Areas:', Object.keys(g).length); console.log('Sample:', g['10180']);"
node -e "const a = require('./static/data/aggregate.json'); console.log('States:', Object.keys(a.states).length); console.log('Sample TX:', a.states['TX']);"
```

Expected: wages.json has 200K+ rows, occupations.json has ~848 entries, geography.json has 400+ areas with county FIPS arrays, aggregate.json has 50+ states.

- [ ] **Step 5: Commit pipeline and output**

```bash
git add pipeline/build.js pipeline/lib/ static/data/ package.json package-lock.json
git commit -m "feat: implement data pipeline — OFLC + O*NET + CBSA join"
```

---

## Task 6: Frontend — Shared State and Utilities

**Files:**
- Create: `src/lib/state.svelte.js`, `src/lib/utils/colors.js`, `src/lib/utils/format.js`

- [ ] **Step 1: Create Ember color scale**

`src/lib/utils/colors.js`:
```javascript
import { scaleQuantize } from 'd3-scale';

export const EMBER = ["#1a1016", "#2a1520", "#451a28", "#6e2030", "#983828", "#c05a20", "#e08818", "#f0b818"];
export const NO_DATA_COLOR = '#1a1a2a';

export function createColorScale(domain) {
  return scaleQuantize().domain(domain).range(EMBER);
}
```

- [ ] **Step 2: Create wage formatter**

`src/lib/utils/format.js`:
```javascript
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
```

- [ ] **Step 3: Create shared state module**

`src/lib/state.svelte.js`:
```javascript
export const filters = $state({
  occupation: null,    // { soc, title, description, onetCode, jobZone, education } or null
  stateAb: '',         // two-letter state code or ''
  jobZone: '',         // '1'-'5' or ''
  education: '',       // education level string or ''
  colorBy: 'avg',      // 'l1', 'l2', 'l3', 'l4', 'avg'
  isAnnual: false,     // hourly (false) or annual (true)
});

export const mapState = $state({
  currentState: null,  // state FIPS code when drilled in, null for national view
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/
git commit -m "feat: add shared state, color scale, and wage formatters"
```

---

## Task 7: Frontend — Data Loading

**Files:**
- Modify: `src/routes/+page.js`

- [ ] **Step 1: Implement data loader**

`src/routes/+page.js`:
```javascript
export const prerender = true;

import { base } from '$app/paths';

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

  // Build wages index: soc+area → wage object
  const wageIndex = {};
  for (const w of wages) {
    if (!wageIndex[w.soc]) wageIndex[w.soc] = {};
    wageIndex[w.soc][w.area] = w;
  }

  return { wages, occupations, geography, aggregate, fipsToArea, wageIndex };
}
```

- [ ] **Step 2: Verify data loads in dev mode**

Update `src/routes/+page.svelte` temporarily:
```svelte
<script>
  let { data } = $props();
</script>

<h1>Wage Explorer</h1>
<p>Loaded {Object.keys(data.occupations).length} occupations, {Object.keys(data.geography).length} areas</p>
```

Run: `npm run dev`
Expected: Page shows "Loaded 848 occupations, 400+ areas"

- [ ] **Step 3: Commit**

```bash
git add src/routes/
git commit -m "feat: load all pipeline data in page load function"
```

---

## Task 8: Frontend — Custom Dropdown Component

**Files:**
- Create: `src/lib/components/Dropdown.svelte`

- [ ] **Step 1: Implement reusable dropdown**

`src/lib/components/Dropdown.svelte`:
```svelte
<script>
  let { label, items, value = $bindable(''), onChange } = $props();
  let open = $state(false);
  let selectedLabel = $derived(items.find(i => i.value === value)?.label || label);

  function select(item) {
    value = item.value;
    open = false;
    onChange?.(item.value);
  }

  function handleClickOutside(e) {
    if (!e.target.closest('.dropdown')) open = false;
  }
</script>

<svelte:window on:click={handleClickOutside} />

<div class="dropdown">
  <button class="dropdown-btn" onclick={(e) => { e.stopPropagation(); open = !open; }}>
    {selectedLabel}
    <span class="arrow">▾</span>
  </button>
  {#if open}
    <div class="dropdown-menu" onclick={(e) => e.stopPropagation()}>
      {#each items as item}
        <button
          class="dropdown-item"
          class:active={item.value === value}
          onclick={() => select(item)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dropdown { position: relative; }
  .dropdown-btn {
    background: #111120; border: 1px solid #1e1e32; border-radius: 4px;
    padding: 6px 28px 6px 10px; font-size: 12px; color: #a0a0c0;
    font-family: 'IBM Plex Sans', sans-serif; cursor: pointer; width: 100%;
    text-align: left; white-space: nowrap; position: relative;
  }
  .dropdown-btn:hover { border-color: #3060a0; }
  .arrow { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 10px; color: #4848a0; }
  .dropdown-menu {
    position: absolute; top: calc(100% + 4px); left: 0; min-width: 100%; max-height: 280px;
    overflow-y: auto; background: #111120; border: 1px solid #1e1e32; border-radius: 4px;
    z-index: 200; padding: 4px 0;
  }
  .dropdown-item {
    display: block; width: 100%; padding: 6px 12px; font-size: 12px; color: #a0a0c0;
    cursor: pointer; font-family: 'IBM Plex Sans', sans-serif; background: none; border: none; text-align: left;
  }
  .dropdown-item:hover { background: #1a1a30; color: #d0d0e0; }
  .dropdown-item.active { color: #5090c0; }
  .dropdown-menu::-webkit-scrollbar { width: 4px; }
  .dropdown-menu::-webkit-scrollbar-track { background: #111120; }
  .dropdown-menu::-webkit-scrollbar-thumb { background: #2a2a40; border-radius: 2px; }
</style>
```

- [ ] **Step 2: Verify dropdown renders in dev**

Temporarily add to `+page.svelte`:
```svelte
<script>
  import Dropdown from '$lib/components/Dropdown.svelte';
  let test = $state('');
</script>
<Dropdown label="Test" items={[{value:'a',label:'Option A'},{value:'b',label:'Option B'}]} bind:value={test} />
```

Run: `npm run dev`
Expected: Dropdown renders, opens on click, selects items.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/Dropdown.svelte
git commit -m "feat: add reusable custom dropdown component"
```

---

## Task 9: Frontend — FilterBar Component

**Files:**
- Create: `src/lib/components/FilterBar.svelte`

- [ ] **Step 1: Implement filter bar**

`src/lib/components/FilterBar.svelte`:
```svelte
<script>
  import Dropdown from './Dropdown.svelte';
  import { filters, mapState } from '$lib/state.svelte.js';

  let { occupations, geography } = $props();

  let searchText = $state('');
  let searchResults = $state([]);
  let showResults = $state(false);

  const FIPS_STATES = { '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY' };

  const stateItems = [
    { value: '', label: 'All states' },
    ...Object.entries(FIPS_STATES)
      .map(([fips, ab]) => {
        const geo = Object.values(geography).find(g => g.stateAb === ab);
        return { value: fips, label: geo?.state || ab };
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  ];

  const zoneItems = [
    { value: '', label: 'All Zones' },
    { value: '1', label: 'Zone 1 — Little prep' },
    { value: '2', label: 'Zone 2 — Some prep' },
    { value: '3', label: 'Zone 3 — Medium prep' },
    { value: '4', label: 'Zone 4 — Considerable' },
    { value: '5', label: 'Zone 5 — Extensive' },
  ];

  const eduItems = [
    { value: '', label: 'All levels' },
    { value: 'High school diploma or equivalent', label: 'High school' },
    { value: "Associate's degree", label: "Associate's" },
    { value: "Bachelor's degree", label: "Bachelor's" },
    { value: "Master's degree", label: "Master's" },
    { value: 'Doctoral or professional degree', label: 'Doctoral' },
  ];

  const colorItems = [
    { value: 'l1', label: 'Level I' },
    { value: 'l2', label: 'Level II' },
    { value: 'l3', label: 'Level III' },
    { value: 'l4', label: 'Level IV' },
    { value: 'avg', label: 'Average' },
  ];

  function onSearch() {
    const q = searchText.toLowerCase().trim();
    if (q.length < 2) { searchResults = []; showResults = false; return; }
    searchResults = Object.values(occupations)
      .filter(o => {
        // Text match
        const textMatch = o.title.toLowerCase().includes(q) || o.soc.includes(q) || (o.description || '').toLowerCase().includes(q);
        if (!textMatch) return false;
        // Job Zone filter
        if (filters.jobZone && o.jobZone !== parseInt(filters.jobZone, 10)) return false;
        // Education filter
        if (filters.education && o.education !== filters.education) return false;
        return true;
      })
      .slice(0, 20);
    showResults = true;
  }

  // Re-run search when Job Zone or Education filter changes
  $effect(() => {
    // Reading these triggers re-run
    filters.jobZone;
    filters.education;
    if (searchText.length >= 2) onSearch();
  });

  function selectOccupation(occ) {
    filters.occupation = occ;
    searchText = `${occ.title} (${occ.soc})`;
    showResults = false;
  }

  function clearOccupation() {
    filters.occupation = null;
    searchText = '';
  }

  function onStateChange(fips) {
    // Store two-letter stateAb, not the full state name
    const ab = fips ? FIPS_STATES[fips] : '';
    filters.stateAb = ab;
    mapState.currentState = fips || null;
  }
</script>

<div class="filters">
  <div class="search-wrap">
    <input
      class="filter-input"
      type="text"
      placeholder="Search occupation or SOC code..."
      bind:value={searchText}
      oninput={onSearch}
      onfocus={() => { if (searchResults.length) showResults = true; }}
    />
    {#if filters.occupation}
      <button class="clear-btn" onclick={clearOccupation}>&times;</button>
    {/if}
    {#if showResults && searchResults.length > 0}
      <div class="search-results">
        {#each searchResults as occ}
          <button class="search-item" onclick={() => selectOccupation(occ)}>
            <span class="search-soc">{occ.soc}</span>
            <span class="search-title">{occ.title}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <Dropdown label="State" items={stateItems} bind:value={mapState.currentState} onChange={onStateChange} />
  <Dropdown label="Job Zone" items={zoneItems} bind:value={filters.jobZone} />
  <Dropdown label="Education" items={eduItems} bind:value={filters.education} />
  <Dropdown label="Color by: Average" items={colorItems} bind:value={filters.colorBy} />

  <div class="divider"></div>

  <div class="toggle-group">
    <button class="toggle-btn" class:active={!filters.isAnnual} onclick={() => filters.isAnnual = false}>$/hr</button>
    <button class="toggle-btn" class:active={filters.isAnnual} onclick={() => filters.isAnnual = true}>$/yr</button>
  </div>
</div>

<svelte:window onclick={() => showResults = false} />

<style>
  .filters {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 24px; border-bottom: 1px solid #1a1a2a; flex-wrap: wrap;
  }
  .search-wrap { position: relative; flex: 2; min-width: 200px; }
  .filter-input {
    background: #111120; border: 1px solid #1e1e32; border-radius: 4px;
    padding: 6px 10px; font-size: 12px; color: #a0a0c0; width: 100%;
    font-family: 'IBM Plex Sans', sans-serif; outline: none;
  }
  .filter-input:focus { border-color: #3060a0; }
  .clear-btn {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: #6868a0; font-size: 16px; cursor: pointer;
  }
  .search-results {
    position: absolute; top: calc(100% + 4px); left: 0; width: 100%; max-height: 300px;
    overflow-y: auto; background: #111120; border: 1px solid #1e1e32; border-radius: 4px;
    z-index: 200; padding: 4px 0;
  }
  .search-item {
    display: flex; gap: 8px; width: 100%; padding: 6px 12px; font-size: 12px;
    color: #a0a0c0; cursor: pointer; background: none; border: none; text-align: left;
    font-family: 'IBM Plex Sans', sans-serif;
  }
  .search-item:hover { background: #1a1a30; color: #d0d0e0; }
  .search-soc { color: #5090c0; font-family: 'IBM Plex Mono', monospace; font-size: 11px; min-width: 60px; }
  .search-title { flex: 1; }
  .divider { width: 1px; height: 20px; background: #1e1e32; }
  .toggle-group { display: flex; border: 1px solid #1e1e32; border-radius: 4px; overflow: hidden; }
  .toggle-btn {
    padding: 5px 10px; font-size: 11px; font-family: 'IBM Plex Mono', monospace;
    color: #6868a0; background: #111120; border: none; cursor: pointer;
  }
  .toggle-btn.active { background: #1a2a40; color: #5090c0; }
</style>
```

- [ ] **Step 2: Verify filter bar renders**

Update `+page.svelte` to include FilterBar with data props. Run dev server and confirm all dropdowns work, search filters occupations, toggle switches.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/FilterBar.svelte
git commit -m "feat: add filter bar with occupation search, dropdowns, and toggle"
```

---

## Task 10: Frontend — Tooltip Component

**Files:**
- Create: `src/lib/components/Tooltip.svelte`

- [ ] **Step 1: Implement tooltip**

`src/lib/components/Tooltip.svelte`:
```svelte
<script>
  import { formatWage } from '$lib/utils/format.js';
  import { filters } from '$lib/state.svelte.js';

  let { visible = false, x = 0, y = 0, data = null } = $props();
</script>

{#if visible && data}
  <div class="tooltip" style="left: {x}px; top: {y}px;">
    <div class="tt-name">{data.name}</div>
    {#if data.sub}<div class="tt-sub">{data.sub}</div>{/if}
    <div class="tt-div"></div>
    <div class="tt-row"><span class="tt-label">Level I</span><span class="tt-val">{formatWage(data.l1, filters.isAnnual)}</span></div>
    <div class="tt-row"><span class="tt-label">Level II</span><span class="tt-val">{formatWage(data.l2, filters.isAnnual)}</span></div>
    <div class="tt-row"><span class="tt-label">Level III</span><span class="tt-val">{formatWage(data.l3, filters.isAnnual)}</span></div>
    <div class="tt-row"><span class="tt-label">Level IV</span><span class="tt-val">{formatWage(data.l4, filters.isAnnual)}</span></div>
    <div class="tt-div"></div>
    <div class="tt-row tt-avg"><span class="tt-label">Average</span><span class="tt-val">{formatWage(data.avg, filters.isAnnual)}</span></div>
    {#if data.meta}<div class="tt-meta">{data.meta}</div>{/if}
    {#if data.hint}<div class="tt-hint">{data.hint}</div>{/if}
  </div>
{/if}

<style>
  .tooltip {
    position: absolute; background: #14142a; border: 1px solid #2a2a48; border-radius: 4px;
    padding: 10px 12px; pointer-events: none; z-index: 100; min-width: 170px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  }
  .tt-name { font-size: 13px; font-weight: 600; color: #e0e0f0; }
  .tt-sub { font-size: 11px; color: #5858a0; margin-bottom: 6px; }
  .tt-div { border-top: 1px solid #1e1e32; margin: 5px 0; }
  .tt-row { display: flex; justify-content: space-between; gap: 20px; font-size: 12px; padding: 1px 0; }
  .tt-label { color: #7878a0; }
  .tt-val { color: #c0c0d8; font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
  .tt-avg .tt-val { color: #e0e0f0; font-weight: 500; }
  .tt-meta { font-size: 10px; color: #5858a0; margin-top: 6px; font-family: 'IBM Plex Mono', monospace; }
  .tt-hint { font-size: 10px; color: #5090c0; margin-top: 4px; font-style: italic; }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/Tooltip.svelte
git commit -m "feat: add tooltip component with wage level display"
```

---

## Task 11: Frontend — USMap Component (State View)

**Files:**
- Create: `src/lib/components/USMap.svelte`

- [ ] **Step 1: Install us-atlas and copy TopoJSON**

```bash
npm install us-atlas
cp node_modules/us-atlas/counties-albers-10m.json static/data/us-counties.json
```

- [ ] **Step 2: Implement USMap with state-level view**

`src/lib/components/USMap.svelte` — this is the largest component. Implement in stages. Start with state-level rendering only:

```svelte
<script>
  import { onMount } from 'svelte';
  import * as d3 from 'd3';
  import * as topojson from 'topojson-client';
  import { createColorScale, NO_DATA_COLOR } from '$lib/utils/colors.js';
  import { filters, mapState } from '$lib/state.svelte.js';

  let { topology, geography, aggregate, wageIndex, fipsToArea, occupations } = $props();

  let container;
  let svg;
  let tooltipData = $state(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);

  const FIPS_TO_STATE_NAME = {/* populated from geography */};

  // Will be set in onMount
  let statesGeo, countiesGeo, stateBorders, nationBorder, path;
  let gEl, stateGroup, countyGroup, borderGroup;
  let zoomBehavior;

  onMount(async () => {
    const { base } = await import('$app/paths');
    const res = await fetch(`${base}/data/us-counties.json`);
    const us = await res.json();

    statesGeo = topojson.feature(us, us.objects.states);
    countiesGeo = topojson.feature(us, us.objects.counties);
    stateBorders = topojson.mesh(us, us.objects.states, (a, b) => a !== b);
    nationBorder = topojson.mesh(us, us.objects.nation);
    path = d3.geoPath();

    const svgEl = d3.select(svg);
    svgEl.attr('viewBox', '0 0 975 610');

    gEl = svgEl.append('g');

    // County layer (hidden initially)
    countyGroup = gEl.append('g').style('display', 'none');
    countyGroup.selectAll('path')
      .data(countiesGeo.features)
      .join('path')
      .attr('class', 'county')
      .attr('d', path);

    // State layer
    stateGroup = gEl.append('g');
    stateGroup.selectAll('path')
      .data(statesGeo.features)
      .join('path')
      .attr('class', 'state-shape')
      .attr('d', path)
      .on('click', (event, d) => zoomToState(d.id));

    // Borders
    borderGroup = gEl.append('g');
    borderGroup.append('path').datum(stateBorders).attr('class', 'state-border').attr('d', path);
    borderGroup.append('path').datum(nationBorder).attr('class', 'nation-border').attr('d', path);

    // Zoom behavior
    zoomBehavior = d3.zoom()
      .scaleExtent([1, 12])
      .on('zoom', (event) => gEl.attr('transform', event.transform));

    svgEl.call(zoomBehavior).on('.zoom', null); // disabled initially

    updateColors();
  });

  // Build state FIPS → stateAb lookup ONCE (fixes Blocker 4: no O(n^2) scan, no FIPS collision)
  const stateFipsToAb = {};
  for (const [area, g] of Object.entries(geography)) {
    for (const c of g.counties) {
      const sf = c.fips.substring(0, 2); // reliable 2-char slice, not startsWith
      if (!stateFipsToAb[sf]) stateFipsToAb[sf] = g.stateAb;
    }
  }

  // Reactive: explicitly read reactive values so $effect tracks them (fixes Blocker 3)
  $effect(() => {
    // Read all reactive dependencies explicitly
    const _colorBy = filters.colorBy;
    const _occ = filters.occupation;
    const _state = mapState.currentState;
    // Guard: only run after onMount populates stateGroup
    if (!stateGroup) return;
    if (_state) {
      updateCountyColors(_colorBy, _occ);
    } else {
      updateStateColors(_colorBy, _occ);
    }
  });

  function getWageValue(wageObj, metric) {
    if (!wageObj) return null;
    return wageObj[metric];
  }

  function updateStateColors(metric, occ) {
    let values;
    if (occ) {
      values = statesGeo.features.map(f => {
        const stateAb = stateFipsToAb[f.id.padStart(2, '0')];
        const areas = Object.entries(geography).filter(([_, g]) => g.stateAb === stateAb);
        const wages = areas.map(([area]) => wageIndex[occ.soc]?.[area]).filter(Boolean);
        if (wages.length === 0) return null;
        const vals = wages.map(w => getWageValue(w, metric)).filter(v => v !== null);
        return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      });
    } else {
      values = statesGeo.features.map(f => {
        const stateAb = stateFipsToAb[f.id.padStart(2, '0')];
        return aggregate.states[stateAb]?.[metric] || null;
      });
    }

    const validValues = values.filter(v => v !== null);
    const domain = validValues.length > 0 ? [d3.min(validValues), d3.max(validValues)] : [0, 100000];
    const scale = createColorScale(domain);

    stateGroup.selectAll('path')
      .data(statesGeo.features)
      .attr('fill', (d, i) => values[i] !== null ? scale(values[i]) : NO_DATA_COLOR);
  }

  // ... (county colors and zoom functions in next task)

  export function zoomToState(fips) {
    mapState.currentState = fips;
    // Implementation in Task 12
  }

  export function resetZoom() {
    mapState.currentState = null;
    // Implementation in Task 12
  }

  export { tooltipData, tooltipX, tooltipY };
</script>

<div class="map-container" bind:this={container}>
  <svg bind:this={svg}></svg>
</div>

<style>
  .map-container { flex: 1; position: relative; overflow: hidden; background: #08080e; }
  .map-container :global(svg) { width: 100%; height: 100%; cursor: grab; }
  .map-container :global(svg:active) { cursor: grabbing; }
  .map-container :global(.state-shape) { stroke: #14141e; stroke-width: 0.8; cursor: pointer; }
  .map-container :global(.state-shape:hover) { stroke: #5090c0; stroke-width: 1.5; }
  .map-container :global(.county) { stroke: #08080e; stroke-width: 0.3; cursor: pointer; }
  .map-container :global(.county:hover) { stroke: #e0e0f0; stroke-width: 0.8; }
  .map-container :global(.state-border) { fill: none; stroke: #1e1e30; stroke-width: 0.8; pointer-events: none; }
  .map-container :global(.nation-border) { fill: none; stroke: #2a2a3a; stroke-width: 1; pointer-events: none; }
</style>
```

- [ ] **Step 3: Verify state map renders with colors**

Run: `npm run dev`
Expected: US map with states colored by aggregate wages in Ember palette.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/USMap.svelte static/data/us-counties.json
git commit -m "feat: add US map component with state-level choropleth"
```

---

## Task 12: Frontend — County Drill-Down and Zoom

**Files:**
- Modify: `src/lib/components/USMap.svelte`

- [ ] **Step 1: Add county coloring, zoom, and pan**

Add to USMap.svelte — implement `zoomToState`, `resetZoom`, `updateCountyColors`, tooltip mouse events for both state and county layers. Add back button.

Key behaviors:
- `zoomToState(fips)`: hide state layer, show county layer, zoom to state bounds, enable D3 zoom for pan/scroll, color in-state counties, dim out-of-state.
- `resetZoom()`: hide county layer, show state layer, reset zoom transform, disable D3 zoom.
- Mouse events: on state hover → state tooltip with aggregate + "Click to view counties" hint. On county hover → county tooltip with wage levels + SOC metadata.
- County click (with occupation): `window.open(onetUrl)`.

- [ ] **Step 2: Wire up state dropdown integration**

When `mapState.currentState` changes from FilterBar dropdown, call `zoomToState` or `resetZoom`.

- [ ] **Step 3: Test drill-down flow**

Run: `npm run dev`
Expected: Click state → zooms to county view → drag to pan, scroll to zoom → click "All states" → returns to state view. State dropdown also triggers zoom.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/USMap.svelte
git commit -m "feat: add county drill-down with pan/zoom and tooltip interaction"
```

---

## Task 13: Frontend — Main Page Assembly

**Files:**
- Modify: `src/routes/+page.svelte`
- Create: `src/app.css`

- [ ] **Step 1: Create global styles**

`src/app.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #0b0b14;
  color: #c8c8d8;
  font-family: 'IBM Plex Sans', sans-serif;
}
```

Import in `src/app.html` via `<link>` or in `+layout.svelte`.

- [ ] **Step 2: Assemble main page**

`src/routes/+page.svelte`:
```svelte
<script>
  import FilterBar from '$lib/components/FilterBar.svelte';
  import USMap from '$lib/components/USMap.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import { mapState } from '$lib/state.svelte.js';

  let { data } = $props();
  let mapComponent;
  let tooltipData = $state(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let tooltipVisible = $state(false);
</script>

<div class="app">
  <header class="header">
    <h1>Wage Explorer</h1>
    <p>
      Prevailing wage data aggregated from
      <a href="https://www.onetcenter.org" target="_blank" rel="noopener">O*NET</a> and
      <a href="https://flag.dol.gov" target="_blank" rel="noopener">OFLC</a>
      to explore wage levels by occupation and U.S. geography.
      <br />
      <small>O*NET data from U.S. Department of Labor, Employment and Training Administration.</small>
    </p>
  </header>

  <FilterBar occupations={data.occupations} geography={data.geography} />

  <div class="map-wrap">
    <USMap
      bind:this={mapComponent}
      geography={data.geography}
      aggregate={data.aggregate}
      wageIndex={data.wageIndex}
      fipsToArea={data.fipsToArea}
      occupations={data.occupations}
      onTooltip={(data, x, y) => { tooltipData = data; tooltipX = x; tooltipY = y; tooltipVisible = !!data; }}
    />

    <Tooltip visible={tooltipVisible} x={tooltipX} y={tooltipY} data={tooltipData} />

    {#if mapState.currentState}
      <button class="back-btn" onclick={() => mapComponent.resetZoom()}>&larr; All states</button>
    {/if}

    <div class="legend">
      <span>Low</span>
      <div class="legend-bar">
        {#each ["#1a1016","#2a1520","#451a28","#6e2030","#983828","#c05a20","#e08818","#f0b818"] as color}
          <span style="background:{color}"></span>
        {/each}
      </div>
      <span>High</span>
    </div>
  </div>
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .header { padding: 16px 24px 12px; border-bottom: 1px solid #1a1a2a; }
  .header h1 { font-size: 16px; font-weight: 600; color: #e0e0f0; }
  .header p { font-size: 12px; color: #6868a0; margin-top: 2px; line-height: 1.5; }
  .header a { color: #5090c0; text-decoration: underline; text-underline-offset: 2px; }
  .header small { color: #4848a0; font-size: 10px; }
  .map-wrap { flex: 1; position: relative; overflow: hidden; }
  .back-btn {
    position: absolute; top: 12px; left: 16px; background: #14142a;
    border: 1px solid #2a2a48; border-radius: 4px; padding: 5px 12px;
    font-size: 11px; color: #8080a0; cursor: pointer; z-index: 50;
  }
  .back-btn:hover { border-color: #5090c0; color: #c0c0e0; }
  .legend {
    position: absolute; bottom: 16px; left: 24px; display: flex;
    align-items: center; gap: 6px; font-size: 10px; color: #6868a0;
    font-family: 'IBM Plex Mono', monospace; background: rgba(11,11,20,0.8);
    padding: 6px 10px; border-radius: 4px; border: 1px solid #1a1a2a;
  }
  .legend-bar { display: flex; gap: 1px; }
  .legend-bar span { width: 22px; height: 8px; display: block; border-radius: 1px; }
</style>
```

- [ ] **Step 3: Test full page in dev**

Run: `npm run dev`
Expected: Header + filter bar + choropleth map. Search works, dropdowns work, states clickable, drill-down works, tooltip appears, back button returns to state view.

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "feat: assemble main page with header, filters, map, and tooltip"
```

---

## Task 14: Static Build and Deploy Verification

**Files:**
- Modify: `package.json` (add deploy script)

- [ ] **Step 1: Verify static build succeeds**

Run: `npm run build`
Expected: `build/` directory with `index.html` and `data/` directory containing all JSON files.

- [ ] **Step 2: Preview the static build**

```bash
npx serve build
```

Open in browser. Expected: Full app works from static files — map renders, filters work, drill-down works.

- [ ] **Step 3: Verify data file sizes are acceptable**

```bash
ls -lh build/data/
```

Expected: `wages.json` should be under 15MB. If too large, consider gzipping or splitting by state.

- [ ] **Step 4: Add GitHub Pages deploy script**

Add to `package.json` scripts:
```json
"deploy": "npm run build && npx gh-pages -d build"
```

Install: `npm install -D gh-pages`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add static build verification and deploy script"
```

---

## Task 15: Final Polish and Deploy

- [ ] **Step 1: Add .nojekyll file for GitHub Pages**

```bash
touch static/.nojekyll
```

- [ ] **Step 2: Test the complete flow end-to-end**

1. Load page → aggregate state map shows
2. Search "Software Developer" → select → map recolors for SOC 15-1252
3. Change "Color by" to Level I → map updates
4. Click a state → county view appears with drill-down
5. Drag to pan, scroll to zoom in county view
6. Hover county → tooltip shows all 4 levels + average
7. Select state from dropdown → same drill-down behavior
8. Click "All states" → returns to national view
9. Toggle $/yr → values update throughout
10. Clear occupation → returns to aggregate view

- [ ] **Step 3: Fix any issues found in E2E testing**

- [ ] **Step 4: Deploy to GitHub Pages**

```bash
npm run deploy
```

- [ ] **Step 5: Verify live site**

Open: `https://<username>.github.io/h1b/`
Expected: Full app working from GitHub Pages.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: final polish and GitHub Pages deployment"
```
