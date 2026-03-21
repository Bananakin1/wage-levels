# Wage Explorer

A static dashboard that combines [O*NET](https://www.onetcenter.org) occupation data with [OFLC](https://flag.dol.gov) prevailing wage data so you can explore wage levels by occupation at the county level across the U.S.

Instead of cross referencing both websites manually, search for an occupation and instantly see how wages vary geographically. Click any state to drill into its counties.

## What it shows

Wages are split into four levels based on pay distribution percentiles:

- Level I (~17th percentile, entry level)
- Level II (~34th)
- Level III (~50th)
- Level IV (~67th)

Some occupations are flagged "High Wage" by the DOL, meaning only an average is available.

Current data covers July 2025 through June 2026, sourced from the May 2024 BLS Occupational Employment and Wage Statistics survey.

## Tech stack

- SvelteKit 5 with adapter-static
- D3.js v7 with topojson-client for the choropleth map
- Node.js data pipeline joining OFLC, O*NET, and Census CBSA data
- Deployed to GitHub Pages

## Development

```bash
npm install
npm run dev
```

## Data pipeline

The pipeline reads raw CSVs from `data/raw/` (gitignored), joins them on SOC code, and outputs JSON to `static/data/`.

```bash
# Download O*NET and Census dependencies
bash pipeline/download-deps.sh

# Copy OFLC CSVs to data/raw/oflc/ manually
# (download from https://flag.dol.gov/wage-data/wage-data-downloads)

# Run the pipeline
npm run pipeline
```

## Refreshing data

When OFLC publishes new wage data (typically each July):

1. Download the new ZIP from flag.dol.gov/wage-data/wage-data-downloads
2. Extract CSVs to `data/raw/oflc/`
3. Run `npm run pipeline`
4. Run `npm run build` and deploy

## Deploy

```bash
npm run deploy
```

## Data sources

- [O*NET Database 30.2](https://www.onetcenter.org/database.html) (CC BY 4.0, U.S. Department of Labor)
- [OFLC Prevailing Wages 2025-26](https://flag.dol.gov/wage-data/wage-data-downloads) (Public domain)
- [US Census CBSA Delineation](https://www.census.gov/geographies/reference-files/time-series/demo/metro-micro/delineation-files.html) (Public domain)
- [US Atlas TopoJSON](https://github.com/topojson/us-atlas) (Public domain)
