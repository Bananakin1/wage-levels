# Wage Explorer — Design Spec

## Purpose

A static data visualization dashboard that aggregates prevailing wage data from OFLC (FLAG) and occupational data from O*NET, enabling users to explore wage levels by occupation and U.S. geography. Users see a choropleth map of the U.S. colored by wage levels, with drill-down from state view to county view.

The primary use case: an H-1B applicant (or employer, or immigration professional) selects an occupation and visually compares prevailing wage levels across states and counties to understand geographic wage variation.

## Data Sources

| Source | URL | License | Format |
|--------|-----|---------|--------|
| OFLC Prevailing Wages 2025-26 | flag.dol.gov/wage-data/wage-data-downloads | Public domain (17 U.S.C. 105) | ZIP containing CSVs |
| O*NET Database 30.2 | onetcenter.org/database.html | CC-BY 4.0 | ZIP containing CSVs |
| US Census TopoJSON | npmjs.com/package/us-atlas | Public domain | counties-albers-10m.json |

### OFLC Files (already downloaded)

Located at `data/raw/oflc/`:

- **ALC_Export.csv** — wages by SOC code x Area code. Columns: `Area`, `SocCode`, `GeoLvl`, `Level1`-`Level4`, `Average`, `Label`. Wages in hourly USD. ~400K rows.
- **Geography.csv** — Area code to county mapping. Columns: `Area`, `AreaName`, `StateAb`, `State`, `CountyTownName`. 3,275 rows mapping 530 areas to counties.
- **oes_soc_occs.csv** — SOC code to title. Columns: `OES_SOCCODE`, `OES_SOCTITLE`.
- **xwalk_plus.csv** — SOC to O*NET code crosswalk. Columns: `OES_SOCCODE`, `OES_SOCTITLE`, `TruncOnetCode`, `OnetCode`, `ONetTitle`. Many-to-one: multiple O*NET codes per SOC.

### O*NET Files (to download)

Located at `data/raw/onet/`:

- **Job Zones.csv** — O*NET-SOC code to Job Zone (1-5).
- **Education, Training, and Experience.csv** — Typical education level per occupation.

### Data Join Strategy

```
ALC_Export (Area, SocCode → L1-L4, Avg)
  ← Geography (Area → counties, states)
  ← oes_soc_occs (SocCode → title)
  ← xwalk_plus (SocCode → OnetCode)
  ← O*NET Job Zones (OnetCode → jobZone)
  ← O*NET Education (OnetCode → education)
```

Join key: **SOC code** (6-digit, format `XX-XXXX`). O*NET codes (format `XX-XXXX.XX`) are more granular — multiple O*NET specializations map to one SOC code. The crosswalk file `xwalk_plus.csv` provides the mapping.

### Geographic Granularity

Wages are published at **MSA level** (Metropolitan Statistical Area), not county level. Geography.csv maps each MSA to its constituent counties. All counties within an MSA share identical wage data. Rural counties outside any MSA are grouped into "Balance of State" areas.

The dashboard displays at county granularity but all counties in the same MSA show the same color and wage values. The tooltip shows the MSA name for context.

## Architecture

### Overview

```
data/raw/         → Node.js pipeline → static/data/ → SvelteKit build → GitHub Pages
(OFLC + O*NET CSVs)   (build.js)        (JSON files)    (adapter-static)
```

### Data Pipeline

A single Node.js script (`pipeline/build.js`) that:

1. Reads all CSVs from `data/raw/`
2. Joins on SOC code and Area code
3. Computes state-level aggregates (average of county wages per state)
4. Outputs to `static/data/`:
   - **wages.json** — compact array: `{soc, area, l1, l2, l3, l4, avg}` (wages stored as integer cents to reduce size)
   - **occupations.json** — lookup: `{soc, title, onetCode, jobZone, education}`
   - **geography.json** — lookup: `{area, name, stateAb, state, counties: [{fips, name}]}`
   - **aggregate.json** — pre-computed cross-occupation average per area for the landing view (state-level + area-level)

The pipeline also copies `us-atlas` TopoJSON to `static/data/us-counties.json`.

**Re-run workflow:** When OFLC publishes new wage data (next: ~July 2026):
1. Download new ZIP from flag.dol.gov/wage-data/wage-data-downloads
2. Extract CSVs to `data/raw/oflc/`
3. Run `node pipeline/build.js`
4. Run `npm run build` and deploy

### Frontend

SvelteKit with `adapter-static`. Single page application.

```
src/
  routes/
    +page.svelte        — main page layout
    +page.js            — load function: fetch JSON from static/data/
  lib/
    components/
      FilterBar.svelte  — all filter controls
      USMap.svelte       — D3 choropleth with state/county views
      Tooltip.svelte     — hover tooltip
    state.svelte.js     — shared reactive state ($state runes)
    utils/
      colors.js         — Ember color scale
      format.js          — wage formatting (hourly/annual, currency)
static/
  data/                 — pipeline output (committed for GitHub Pages)
pipeline/
  build.js             — data pipeline
```

**State management:** Svelte 5 `$state()` runes in a shared `state.svelte.js` module. No external state library.

**Reactivity flow:**
```
FilterBar changes → state.svelte.js updates → derived filtered data recomputes → USMap recolors → Tooltip reads current data
```

## UI Design

### Layout

Full-width stacked layout:
1. **Header** — title "Wage Explorer" + description with links to O*NET and OFLC sources
2. **Filter bar** — horizontal row of controls
3. **Map** — fills remaining viewport height

### Filter Controls

| Control | Type | Options |
|---------|------|---------|
| Occupation search | Text input with type-ahead | SOC code or job title |
| State | Custom dropdown | All 50 states + DC, or "All states" |
| Job Zone | Custom dropdown | Zone 1-5, or "All Zones" |
| Education | Custom dropdown | High school through Doctoral, or "All levels" |
| Color by | Custom dropdown | Level I / II / III / IV / Average |
| Hourly/Annual | Toggle button pair | $/hr (default) or $/yr |

All dropdowns are custom-styled (not native `<select>`) to match the dark theme.

### Map Behavior

**National view (default):**
- States rendered as colored shapes using the Ember palette
- Color represents the state-level aggregate wage for the selected metric ("Color by")
- Default: aggregate across all occupations
- Hover state → tooltip shows state name, county count, average wage levels
- Click state → drill into county view

**County view (drilled in):**
- Counties within the selected state rendered individually
- Out-of-state counties dimmed to near-black
- Hover county → tooltip shows county name, state, MSA, all 4 wage levels + average, SOC code, Job Zone, education
- Click county (with occupation selected) → opens O*NET profile page in new tab (`https://www.onetonline.org/link/summary/{onetCode}`)
- Drag to pan, scroll to zoom (D3 zoom behavior)
- "All states" button returns to national view

**State dropdown integration:** Selecting a state from the dropdown is equivalent to clicking it on the map. Resetting to "All states" returns to national view.

### Color Palette: Ember

8-step quantize scale, dark-to-amber:

```
["#1a1016", "#2a1520", "#451a28", "#6e2030", "#983828", "#c05a20", "#e08818", "#f0b818"]
```

Low wages = dark/near-invisible. High wages = warm amber/gold, clearly visible against the dark background.

### Tooltip Content

**State level:**
- State name
- County count
- Levels I-IV + Average (hourly or annual per toggle)
- "State average" label
- "Click to view counties" hint

**County level:**
- County name
- State name + MSA name
- Levels I-IV + Average (hourly or annual per toggle)
- SOC code + Job Zone + Education (when occupation selected)

### Typography

- **Font family:** IBM Plex Sans (body), IBM Plex Mono (data values)
- **Theme:** Dark — background #0b0b14, surfaces #111120, borders #1a1a2a

### Landing State

When no occupation is selected, the map shows an aggregate view — average wages across all occupations per state/county. The "Color by" dropdown still controls which wage metric drives the color.

## Deployment

- **Host:** GitHub Pages
- **Build:** `npm run build` using `adapter-static`
- **Data:** JSON files committed to `static/data/` so they're included in the static build
- **Domain:** Default GitHub Pages URL (username.github.io/h1b)

## Attribution Requirements

- O*NET data: Must display attribution per CC-BY 4.0 — "O*NET data from U.S. Department of Labor, Employment and Training Administration" with link to onetcenter.org
- OFLC data: Public domain, no legal requirement, but attribution is good practice — link to flag.dol.gov
- Both links appear in the header description

## Out of Scope

- User accounts, saved searches, or persistent state
- Server-side rendering or API backend
- Real-time data updates (manual pipeline re-run)
- Legal advice, filing recommendations, or immigration guidance
- Mobile-optimized layout (desktop-first for this weekend build; responsive can be added later)
- Salary range filter (removed for simplicity; the "Color by" dropdown serves the primary comparison need)
