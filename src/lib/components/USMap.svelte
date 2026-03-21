<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import * as d3 from 'd3';
  import * as topojson from 'topojson-client';
  import { createColorScale, NO_DATA_COLOR } from '$lib/utils/colors.js';
  import { filters, mapState } from '$lib/state.svelte.js';

  let {
    geography,
    aggregate,
    wageIndex,
    fipsToArea,
    occupations,
    onTooltip,
  } = $props();

  // ---------- Constants ----------
  const DIMMED_COLOR = '#06060a';
  const STATE_FIPS_LENGTH = 2;

  // FIPS to state abbreviation mapping
  const FIPS_TO_AB = {
    '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
    '10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL',
    '18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
    '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
    '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
    '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD',
    '47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
    '55':'WI','56':'WY'
  };

  // Reverse: abbreviation to FIPS
  const AB_TO_FIPS = {};
  for (const [fips, ab] of Object.entries(FIPS_TO_AB)) {
    AB_TO_FIPS[ab] = fips;
  }

  // State abbreviation to full name (built from geography)
  // Use stateAb field as primary source, then fill gaps from FIPS_TO_AB for
  // states that only appear as cross-state MSA counties
  const AB_TO_NAME = {};
  for (const info of Object.values(geography)) {
    if (info.stateAb && !AB_TO_NAME[info.stateAb]) {
      AB_TO_NAME[info.stateAb] = info.state;
    }
  }
  // Fill in any missing state names (e.g., RI only appears in cross-state MSAs)
  const STATE_FULL_NAMES = {
    'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
    'CO':'Colorado','CT':'Connecticut','DE':'Delaware','DC':'District of Columbia',
    'FL':'Florida','GA':'Georgia','HI':'Hawaii','ID':'Idaho','IL':'Illinois',
    'IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiana',
    'ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota',
    'MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada',
    'NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico','NY':'New York',
    'NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma','OR':'Oregon',
    'PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota',
    'TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia',
    'WA':'Washington','WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming'
  };
  for (const [ab, name] of Object.entries(STATE_FULL_NAMES)) {
    if (!AB_TO_NAME[ab]) AB_TO_NAME[ab] = name;
  }

  // State FIPS to list of county count (from geography data, using FIPS prefix)
  const STATE_COUNTY_COUNTS = {};
  {
    const seenByState = {};
    for (const info of Object.values(geography)) {
      for (const c of info.counties) {
        const sf = c.fips.substring(0, STATE_FIPS_LENGTH);
        if (!seenByState[sf]) seenByState[sf] = new Set();
        seenByState[sf].add(c.fips);
      }
    }
    for (const [sf, s] of Object.entries(seenByState)) {
      STATE_COUNTY_COUNTS[sf] = s.size;
    }
  }

  // ---------- DOM refs ----------
  let container;
  let svgEl;
  let mounted = $state(false);
  let activeZoomState = null; // Track which state we're currently zoomed to

  // ---------- TopoJSON data ----------
  let topoData = null;
  let stateFeatures = [];
  let countyFeatures = [];
  let stateMesh = null;
  let nationMesh = null;

  // ---------- D3 selections ----------
  let svg, stateGroup, countyGroup, borderGroup;
  let path;
  let zoom;

  // ---------- Lifecycle ----------
  onMount(async () => {
    // Load TopoJSON
    const resp = await fetch(`${base}/data/us-counties.json`);
    topoData = await resp.json();

    stateFeatures = topojson.feature(topoData, topoData.objects.states).features;
    countyFeatures = topojson.feature(topoData, topoData.objects.counties).features;
    stateMesh = topojson.mesh(topoData, topoData.objects.states, (a, b) => a !== b);
    nationMesh = topojson.mesh(topoData, topoData.objects.nation);

    // Pre-projected Albers: identity projection
    path = d3.geoPath();

    // Set up SVG structure
    svg = d3.select(svgEl);
    stateGroup = svg.append('g').attr('class', 'state-group');
    countyGroup = svg.append('g').attr('class', 'county-group').style('display', 'none');
    borderGroup = svg.append('g').attr('class', 'border-group');

    // Draw state borders + nation border (always visible)
    borderGroup.append('path')
      .datum(stateMesh)
      .attr('class', 'state-border')
      .attr('d', path);

    borderGroup.append('path')
      .datum(nationMesh)
      .attr('class', 'nation-border')
      .attr('d', path);

    // Draw states
    stateGroup.selectAll('path')
      .data(stateFeatures)
      .join('path')
      .attr('class', 'state-shape')
      .attr('d', path)
      .on('mousemove', handleStateHover)
      .on('mouseleave', handleHoverLeave)
      .on('click', handleStateClick);

    // Draw counties (initially hidden)
    countyGroup.selectAll('path')
      .data(countyFeatures)
      .join('path')
      .attr('class', 'county')
      .attr('d', path)
      .on('mousemove', handleCountyHover)
      .on('mouseleave', handleHoverLeave)
      .on('click', handleCountyClick);

    // Set up zoom behavior (disabled by default)
    zoom = d3.zoom()
      .scaleExtent([0.5, 20])
      .filter((event) => {
        // Allow programmatic zooms (no sourceEvent) and drag events always
        if (!event.sourceEvent) return true;
        // Allow wheel zoom only with Ctrl/Meta key to prevent accidental scroll-zoom
        if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
        // Allow all other events (mousedown for drag, touchstart, dblclick)
        return true;
      })
      .on('zoom', (event) => {
        stateGroup.attr('transform', event.transform);
        countyGroup.attr('transform', event.transform);
        borderGroup.attr('transform', event.transform);
      });

    mounted = true;
  });

  // ---------- Color computation ----------
  // Check if an area has any county in the given state (by FIPS prefix)
  function areaHasCountyInState(info, stateFips) {
    return info.counties.some(c => c.fips.substring(0, STATE_FIPS_LENGTH) === stateFips);
  }

  function getStateFillColor(stateFips, colorBy, occupation) {
    const ab = FIPS_TO_AB[stateFips];
    if (!ab) return NO_DATA_COLOR;

    if (occupation) {
      // Compute per-state average from wageIndex for this occupation
      const socData = wageIndex[occupation.soc];
      if (!socData) return NO_DATA_COLOR;

      // Find all areas touching this state and compute average
      let sum = 0;
      let count = 0;
      for (const [area, info] of Object.entries(geography)) {
        if (areaHasCountyInState(info, stateFips) && socData[area]) {
          const val = socData[area][colorBy];
          if (val != null) { sum += val; count++; }
        }
      }
      if (count === 0) return NO_DATA_COLOR;
      return currentScale ? currentScale(sum / count) : NO_DATA_COLOR;
    } else {
      // Aggregate mode
      const stateAgg = aggregate.states[ab];
      if (!stateAgg || stateAgg[colorBy] == null) return NO_DATA_COLOR;
      return currentScale ? currentScale(stateAgg[colorBy]) : NO_DATA_COLOR;
    }
  }

  function getCountyFillColor(countyFips, colorBy, occupation, currentStateFips) {
    // Dim counties outside the selected state
    const countyStateFips = countyFips.substring(0, STATE_FIPS_LENGTH);
    if (currentStateFips && countyStateFips !== currentStateFips) {
      return DIMMED_COLOR;
    }

    const area = fipsToArea[countyFips];
    if (!area) return NO_DATA_COLOR;

    if (occupation) {
      const socData = wageIndex[occupation.soc];
      if (!socData || !socData[area]) return NO_DATA_COLOR;
      const val = socData[area][colorBy];
      if (val == null) return NO_DATA_COLOR;
      return currentScale ? currentScale(val) : NO_DATA_COLOR;
    } else {
      const areaAgg = aggregate.areas[area];
      if (!areaAgg || areaAgg[colorBy] == null) return NO_DATA_COLOR;
      return currentScale ? currentScale(areaAgg[colorBy]) : NO_DATA_COLOR;
    }
  }

  // ---------- Color scale ----------
  let currentScale = null;

  function computeColorScale(colorBy, occupation, currentStateFips) {
    let values = [];

    if (currentStateFips) {
      // County view: only values from counties within the selected state
      const stateAb = FIPS_TO_AB[currentStateFips];
      if (!stateAb) return null;

      if (occupation) {
        const socData = wageIndex[occupation.soc];
        if (socData) {
          for (const [area, info] of Object.entries(geography)) {
            if (areaHasCountyInState(info, currentStateFips) && socData[area]) {
              const val = socData[area][colorBy];
              if (val != null) values.push(val);
            }
          }
        }
      } else {
        for (const [area, info] of Object.entries(geography)) {
          if (areaHasCountyInState(info, currentStateFips)) {
            const areaAgg = aggregate.areas[area];
            if (areaAgg && areaAgg[colorBy] != null) values.push(areaAgg[colorBy]);
          }
        }
      }
    } else {
      // State view: values from state-level averages
      if (occupation) {
        const socData = wageIndex[occupation.soc];
        if (socData) {
          for (const [sf, ab] of Object.entries(FIPS_TO_AB)) {
            let sum = 0;
            let count = 0;
            for (const [area, info] of Object.entries(geography)) {
              if (areaHasCountyInState(info, sf) && socData[area]) {
                const val = socData[area][colorBy];
                if (val != null) { sum += val; count++; }
              }
            }
            if (count > 0) values.push(sum / count);
          }
        }
      } else {
        for (const w of Object.values(aggregate.states)) {
          if (w[colorBy] != null) values.push(w[colorBy]);
        }
      }
    }

    if (values.length === 0) return null;
    const domain = [d3.min(values), d3.max(values)];
    return createColorScale(domain);
  }

  // ---------- State wage data for tooltip ----------
  function getStateWageData(stateFips) {
    const ab = FIPS_TO_AB[stateFips];
    if (!ab) return null;
    const occupation = filters.occupation;

    if (occupation) {
      const socData = wageIndex[occupation.soc];
      if (!socData) return null;
      let sums = { l1: 0, l2: 0, l3: 0, l4: 0, avg: 0 };
      let count = 0;
      for (const [area, info] of Object.entries(geography)) {
        if (areaHasCountyInState(info, stateFips) && socData[area]) {
          for (const k of ['l1', 'l2', 'l3', 'l4', 'avg']) {
            sums[k] += socData[area][k] || 0;
          }
          count++;
        }
      }
      if (count === 0) return null;
      return {
        l1: Math.round(sums.l1 / count),
        l2: Math.round(sums.l2 / count),
        l3: Math.round(sums.l3 / count),
        l4: Math.round(sums.l4 / count),
        avg: Math.round(sums.avg / count),
      };
    } else {
      return aggregate.states[ab] || null;
    }
  }

  // ---------- Event handlers ----------
  function handleStateHover(event, d) {
    if (!onTooltip) return;
    const stateFips = d.id;
    const ab = FIPS_TO_AB[stateFips];
    const name = AB_TO_NAME[ab] || ab || 'Unknown';
    const countyCount = STATE_COUNTY_COUNTS[stateFips] || 0;
    const wages = getStateWageData(stateFips);

    if (!wages) {
      onTooltip(null);
      return;
    }

    const rect = container.getBoundingClientRect();
    let x = event.clientX - rect.left + 12;
    let y = event.clientY - rect.top - 8;
    // Flip if too close to edges
    if (x + 200 > rect.width) x = event.clientX - rect.left - 210;
    if (y + 180 > rect.height) y = event.clientY - rect.top - 180;

    onTooltip({
      name,
      sub: countyCount + ' counties',
      l1: wages.l1,
      l2: wages.l2,
      l3: wages.l3,
      l4: wages.l4,
      avg: wages.avg,
      meta: 'State average',
      hint: 'Click to view counties',
    }, x, y);
  }

  function handleCountyHover(event, d) {
    if (!onTooltip) return;
    const countyFips = d.id;
    const countyStateFips = countyFips.substring(0, STATE_FIPS_LENGTH);

    // Only show tooltip for counties in the current state
    if (mapState.currentState && countyStateFips !== mapState.currentState) return;

    const area = fipsToArea[countyFips];
    const occupation = filters.occupation;

    // Find county name from geography
    let countyName = d.properties?.name || 'Unknown County';
    let msaName = '';
    let stateName = '';

    if (area && geography[area]) {
      msaName = geography[area].name;
      stateName = geography[area].state;
      const county = geography[area].counties.find(c => c.fips === countyFips);
      if (county) countyName = county.name;
    } else {
      // Try to find county in any area
      const stateAb = FIPS_TO_AB[countyStateFips];
      stateName = AB_TO_NAME[stateAb] || '';
    }

    let wages = null;
    if (occupation) {
      const socData = wageIndex[occupation.soc];
      if (socData && socData[area]) wages = socData[area];
    } else {
      if (area) wages = aggregate.areas[area] || null;
    }

    const rect = container.getBoundingClientRect();
    let x = event.clientX - rect.left + 12;
    let y = event.clientY - rect.top - 8;
    if (x + 200 > rect.width) x = event.clientX - rect.left - 210;
    if (y + 180 > rect.height) y = event.clientY - rect.top - 180;

    if (!wages) {
      // Show a basic "no data" tooltip for unmapped counties
      onTooltip({
        name: countyName,
        sub: stateName,
        hint: 'No wage data available',
      }, x, y);
      return;
    }

    let meta = '';
    let hint = '';
    if (occupation) {
      meta = occupation.soc + ' \u00b7 Zone ' + occupation.jobZone + ' \u00b7 ' + occupation.education;
      hint = '';
    }

    onTooltip({
      name: countyName,
      sub: stateName + (msaName ? ' \u00b7 ' + msaName : ''),
      l1: wages.l1,
      l2: wages.l2,
      l3: wages.l3,
      l4: wages.l4,
      avg: wages.avg,
      meta,
      hint,
    }, x, y);
  }

  function handleHoverLeave() {
    if (onTooltip) onTooltip(null);
  }

  function handleStateClick(event, d) {
    const stateFips = d.id;
    zoomToState(stateFips);
  }

  function handleCountyClick(event, d) {
    const occupation = filters.occupation;
    if (!occupation) return;

    const onetCode = occupation.onetCode;
    if (onetCode) {
      window.open('https://www.onetonline.org/link/summary/' + onetCode, '_blank', 'noopener,noreferrer');
    }
  }

  // ---------- Zoom management ----------
  export function zoomToState(fips) {
    if (!svg || !topoData) return;

    const ab = FIPS_TO_AB[fips];
    if (ab) {
      filters.stateAb = ab;
    }
    mapState.currentState = fips;
  }

  export function resetZoom() {
    if (!svg) return;
    mapState.currentState = null;
    filters.stateAb = '';
  }

  function applyStateZoom(stateFips) {
    if (!svg || !path) return;

    // Show county view, hide state view
    stateGroup.style('display', 'none');
    countyGroup.style('display', '');

    // Only animate zoom if we're zooming to a different state
    if (activeZoomState === stateFips) return;
    activeZoomState = stateFips;

    // Find the state feature
    const stateFeature = stateFeatures.find(f => f.id === stateFips);
    if (!stateFeature) return;

    const [[x0, y0], [x1, y1]] = path.bounds(stateFeature);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    // viewBox dimensions — must match the SVG viewBox attribute
    const vbW = 1100;
    const vbH = 670;
    const vbX = -60;
    const vbY = -30;

    // Scale so state fills ~50% of viewport
    const STATE_FILL_RATIO = 0.5;
    const scale = STATE_FILL_RATIO / Math.max(dx / vbW, dy / vbH);

    // Center of viewBox
    const viewCx = vbX + vbW / 2;
    const viewCy = vbY + vbH / 2;

    // Translate so state center maps to viewBox center
    const translate = [viewCx - scale * cx, viewCy - scale * cy];

    const transform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);

    // Enable zoom and apply transform with smooth interpolation
    svg.call(zoom);
    svg.transition()
      .duration(750)
      .call(zoom.transform, transform);
  }

  function applyStateReset() {
    if (!svg) return;

    activeZoomState = null;

    // Smoothly transition back to identity transform before switching views
    if (zoom) {
      svg.call(zoom);
      svg.transition()
        .duration(750)
        .call(zoom.transform, d3.zoomIdentity)
        .on('end', () => {
          // Disable zoom after transition completes
          svg.on('.zoom', null);
        });
    }

    // Show state view, hide county view
    stateGroup.style('display', '');
    countyGroup.style('display', 'none');
  }

  // ---------- Reactive updates ----------
  $effect(() => {
    if (!mounted) return;

    // Read tracked dependencies
    const colorBy = filters.colorBy;
    const occupation = filters.occupation;
    const currentStateFips = mapState.currentState;

    // Recompute color scale (per-view normalization)
    currentScale = computeColorScale(colorBy, occupation, currentStateFips);

    if (currentStateFips) {
      // County view
      applyStateZoom(currentStateFips);

      // Color counties
      countyGroup.selectAll('path')
        .attr('fill', (d) => getCountyFillColor(d.id, colorBy, occupation, currentStateFips));
    } else {
      // State view
      applyStateReset();

      // Color states
      stateGroup.selectAll('path')
        .attr('fill', (d) => getStateFillColor(d.id, colorBy, occupation));
    }
  });
</script>

<div class="map-container" bind:this={container}>
  <svg bind:this={svgEl} viewBox="-60 -30 1100 670" preserveAspectRatio="xMidYMid meet"></svg>
</div>

<style>
  .map-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #08080e;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
  }

  svg:active {
    cursor: grabbing;
  }

  :global(.state-shape) {
    stroke: #14141e;
    stroke-width: 0.8;
    cursor: pointer;
  }

  :global(.state-shape:hover) {
    stroke: #5090c0;
    stroke-width: 1.5;
  }

  :global(.county) {
    stroke: #08080e;
    stroke-width: 0.3;
    cursor: pointer;
  }

  :global(.county:hover) {
    stroke: #e0e0f0;
    stroke-width: 0.8;
  }

  :global(.state-border) {
    fill: none;
    stroke: #1e1e30;
    stroke-width: 0.8;
    pointer-events: none;
  }

  :global(.nation-border) {
    fill: none;
    stroke: #2a2a3a;
    stroke-width: 1;
    pointer-events: none;
  }
</style>
