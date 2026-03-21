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
| Census CBSA Delineation | census.gov/geographies/reference-files/time-series/demo/metro-micro/delineation-files.html | Public domain | Excel/CSV mapping CBSA codes to county FIPS |

### OFLC Files (already downloaded)

Located at `data/raw/oflc/`:

- **ALC_Export.csv** — wages by SOC code x Area code. Columns: `Area`, `SocCode`, `GeoLvl`, `Level1`-`Level4`, `Average`, `Label`. ~449K rows. **Mixed units:** most rows are hourly USD, but rows with `Label = "Annual Wage"` (~7.3%) are in annual USD. Rows with `Label = "High Wage"` or `"No Leveled Wage"` have empty Level1-4 (only Average populated).
- **EDC_Export.csv** — education-based wage estimates, same schema as ALC_Export. **Intentionally excluded** — ALC contains the OES-survey wages used for H-1B prevailing wage determinations. EDC uses a different methodology.
- **Geography.csv** — Area code to county mapping. Columns: `Area`, `AreaName`, `StateAb`, `State`, `CountyTownName`. 3,275 rows mapping 530 areas to counties. **No FIPS codes** — county-to-TopoJSON join requires the Census CBSA delineation file (see below).
- **oes_soc_occs.csv** — SOC code to title and description. Columns: `soccode`, `Title`, `Description`. The Description field powers the type-ahead search.
- **xwalk_plus.csv** — SOC to O*NET code crosswalk. Columns: `OES_SOCCODE`, `OES_SOCTITLE`, `TruncOnetCode`, `OnetCode`, `ONetTitle`. Many-to-one: multiple O*NET codes per SOC. For the O*NET link on county click, use the `.00` base code (e.g., `11-1011.00`), falling back to the first available code.

### O*NET Files (to download)

Located at `data/raw/onet/`:

- **Job Zones.csv** — O*NET-SOC code to Job Zone (1-5).
- **Education, Training, and Experience.csv** — Typical education level per occupation.

### Data Join Strategy

```
ALC_Export (Area, SocCode → L1-L4, Avg, Label)
  ← Geography (Area → AreaName, StateAb, CountyTownName)
  ← CBSA Delineation (CBSA code → county FIPS)
  ← oes_soc_occs (soccode → Title, Description)
  ← xwalk_plus (OES_SOCCODE → OnetCode)
  ← O*NET Job Zones (OnetCode → jobZone)
  ← O*NET Education (OnetCode → education)
```

Join key: **SOC code** (6-digit, format `XX-XXXX`). O*NET codes (format `XX-XXXX.XX`) are more granular — multiple O*NET specializations map to one SOC code. The crosswalk file `xwalk_plus.csv` provides the mapping.

### County FIPS Mapping

Geography.csv has county names but no FIPS codes. The TopoJSON file uses FIPS codes as county IDs. The pipeline uses two sources to bridge this gap:

1. **Census CBSA Delineation File** — maps CBSA/MSA codes to county FIPS codes for metro areas.
2. **Census National County File** (`national_county2020.txt`) — complete list of all U.S. counties with FIPS codes, used to resolve nonmetro county names to FIPS via name matching.

**Metro areas:** `Geography.Area` codes that match CBSA codes get county FIPS directly from the delineation file.

**Nonmetro areas:** Geography.csv already contains the correct county-to-nonmetro-area assignments (e.g., "Southwest Montana nonmetropolitan area" → Beaverhead County, Deer Lodge County, etc.). The pipeline matches these county names against the national county file to get FIPS codes. Name normalization handles suffixes (County, Parish, Borough, Census Area, etc.).

**Cross-state MSAs:** Areas that span multiple states (e.g., NY-NJ, OH-KY-IN) are discoverable under ALL states that have counties in them, not just one primary state. The frontend uses county FIPS prefixes to determine which areas belong to a given state.

Edge cases: Virginia independent cities have their own FIPS codes. Louisiana uses parishes, Alaska uses boroughs. Connecticut replaced counties with planning regions in 2022; the pipeline maps planning region names to old county FIPS codes used by the TopoJSON.

### Wage Unit Handling

ALC_Export contains mixed units indicated by the `Label` column:

| Label | Meaning | Level1-4 | Average | Pipeline action |
|-------|---------|----------|---------|----------------|
| `""` (empty) | Hourly wages | Present | Present | Store as-is |
| `"Annual Wage"` | Annual wages | Present | Present | Divide by 2080 to convert to hourly |
| `"High Wage"` | Only average available | Empty | Present | Store levels as `null`, average only |
| `"No Leveled Wage"` | Insufficient data | Empty | Present | Store levels as `null`, average only |

All values in `wages.json` are stored in **hourly USD as integer cents**. Frontend converts to annual by multiplying by 2080 when the annual toggle is active.

When "Color by" is set to a specific level (I-IV) and the selected occupation has `null` levels for a county, that county is shown in a neutral gray (#1a1a2a) to indicate "no data for this level."

### GeoLvl Handling

ALC_Export rows have a `GeoLvl` column (values 1-4) indicating the data estimation tier. When multiple GeoLvl rows exist for the same Area+SocCode pair, the pipeline uses the **lowest GeoLvl** (most precise estimate). If GeoLvl 1 exists, use it; otherwise fall back to 2, then 3, then 4.

### Territory Handling

Geography.csv includes Puerto Rico (PR) and Guam (GU). The `counties-albers-10m.json` TopoJSON uses an Albers USA projection that only includes the 50 states + DC. **Territories are out of scope** — the pipeline filters them out and logs a count of discarded rows.

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
3. Computes state-level aggregates: **simple mean** of all MSA/area wages within each state (each area counted once, not weighted by county count). "Balance of State" nonmetro areas are included. Cross-state MSAs contribute to ALL states they touch (via county FIPS prefix matching).
4. Outputs to `static/data/`:
   - **wages.json** — compact array: `{soc, area, l1, l2, l3, l4, avg}` (wages stored as integer cents to reduce size)
   - **occupations.json** — lookup: `{soc, title, description, onetCode, jobZone, education}`
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
1. **Header** — title "Wage Explorer" + description explaining: what the tool does (combines O*NET + OFLC data), what the four wage levels represent (percentiles), what "High Wage" means, how Job Zone and Education filters work, and the current data period (Jul 2025 through Jun 2026). Links to O*NET and OFLC sources.
2. **Filter bar** — horizontal row of controls
3. **Map** — fills remaining viewport height

### Filter Controls

| Control | Type | Options |
|---------|------|---------|
| Occupation search | Text input with type-ahead | SOC code, job title, or keyword from description |
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
- Drag to pan, Ctrl+scroll to zoom (D3 zoom behavior, wheel zoom requires Ctrl/Meta to prevent accidental scroll)
- "All states" button returns to national view
- SVG uses `position: absolute; inset: 0` to constrain to viewport height, preventing overflow on fullscreen displays

**State dropdown integration:** Selecting a state from the dropdown is equivalent to clicking it on the map. Resetting to "All states" returns to national view.

### Color Palette: Ember

8-step quantize scale, dark-to-amber:

```
["#1a1016", "#2a1520", "#451a28", "#6e2030", "#983828", "#c05a20", "#e08818", "#f0b818"]
```

Low wages = dark/near-invisible. High wages = warm amber/gold, clearly visible against the dark background.

**Color scale domain:** Per-view normalization. In state view, the domain is `[min, max]` of state-level values being displayed. In county view (drilled into a state), the domain is `[min, max]` of only the areas within that state. This maximizes visual contrast at every zoom level — e.g., California's internal wage variation spans the full palette even though its absolute range is narrow nationally.

**No-data counties:** Shown in neutral gray (#1a1a2a) when wage data is unavailable for the selected occupation + level combination.

**Hourly/Annual conversion factor:** 2,080 hours/year (40 hrs/week x 52 weeks). This is the standard DOL conversion.

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
- **High Wage / No Leveled Wage flag:** When an occupation+area has null levels (Label = "High Wage" or "No Leveled Wage"), the tooltip shows an amber flag with explanation instead of individual level rows. Only the average is displayed.
- **No data tooltip:** Counties with no FIPS mapping show county name + state with "No wage data available" hint.

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
