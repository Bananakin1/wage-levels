<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import * as d3 from 'd3';
  import * as topojson from 'topojson-client';
  import { createColorScale, NO_DATA_COLOR } from '$lib/utils/colors.js';
  import { FIPS_TO_AB, AB_TO_FIPS, STATE_NAMES, STATE_FIPS_LENGTH } from '$lib/utils/geo.js';
  import { filters, mapState } from '$lib/state.svelte.js';

  let {
    geography,
    aggregate,
    wageIndex,
    fipsToArea,
    onTooltip,
  } = $props();

  const DIMMED_COLOR = '#06060a';
  const VIEWBOX = { x: -60, y: -30, w: 1100, h: 670 };
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 20;
  const ZOOM_TRANSITION_MS = 750;
  const STATE_FILL_RATIO = 0.5;
  const TOOLTIP_WIDTH = 200;
  const TOOLTIP_HEIGHT = 180;

  // State abbreviation to full name (built from geography, gaps filled from shared constants)
  const AB_TO_NAME = {};
  for (const info of Object.values(geography)) {
    if (info.stateAb && !AB_TO_NAME[info.stateAb]) {
      AB_TO_NAME[info.stateAb] = info.state;
    }
  }
  for (const [ab, name] of Object.entries(STATE_NAMES)) {
    if (!AB_TO_NAME[ab]) AB_TO_NAME[ab] = name;
  }

  // State FIPS to county count (from geography data, using FIPS prefix)
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

  // Pre-index: stateFips -> set of area codes for O(1) state lookups
  const areasByState = {};
  for (const [area, info] of Object.entries(geography)) {
    for (const c of info.counties) {
      const sf = c.fips.substring(0, STATE_FIPS_LENGTH);
      if (!areasByState[sf]) areasByState[sf] = new Set();
      areasByState[sf].add(area);
    }
  }

  let container;
  let svgEl;
  let mounted = $state(false);
  let activeZoomState = null;

  let topoData = null;
  let stateFeatures = [];
  let countyFeatures = [];
  let stateMesh = null;
  let nationMesh = null;

  let svg, stateGroup, countyGroup, borderGroup;
  let path;
  let zoom;

  function tooltipPosition(event, containerRect) {
    let x = event.clientX - containerRect.left + 12;
    let y = event.clientY - containerRect.top - 8;
    if (x + TOOLTIP_WIDTH > containerRect.width) x = event.clientX - containerRect.left - (TOOLTIP_WIDTH + 10);
    if (y + TOOLTIP_HEIGHT > containerRect.height) y = event.clientY - containerRect.top - TOOLTIP_HEIGHT;
    return { x, y };
  }

  onMount(async () => {
    const resp = await fetch(`${base}/data/us-counties.json`);
    topoData = await resp.json();

    stateFeatures = topojson.feature(topoData, topoData.objects.states).features;
    countyFeatures = topojson.feature(topoData, topoData.objects.counties).features;
    stateMesh = topojson.mesh(topoData, topoData.objects.states, (a, b) => a !== b);
    nationMesh = topojson.mesh(topoData, topoData.objects.nation);

    path = d3.geoPath();

    svg = d3.select(svgEl);
    stateGroup = svg.append('g').attr('class', 'state-group');
    countyGroup = svg.append('g').attr('class', 'county-group').style('display', 'none');
    borderGroup = svg.append('g').attr('class', 'border-group');

    borderGroup.append('path')
      .datum(stateMesh)
      .attr('class', 'state-border')
      .attr('d', path);

    borderGroup.append('path')
      .datum(nationMesh)
      .attr('class', 'nation-border')
      .attr('d', path);

    stateGroup.selectAll('path')
      .data(stateFeatures)
      .join('path')
      .attr('class', 'state-shape')
      .attr('d', path)
      .on('mousemove', handleStateHover)
      .on('mouseleave', handleHoverLeave)
      .on('click', handleStateClick);

    countyGroup.selectAll('path')
      .data(countyFeatures)
      .join('path')
      .attr('class', 'county')
      .attr('d', path)
      .on('mousemove', handleCountyHover)
      .on('mouseleave', handleHoverLeave)
      .on('click', handleCountyClick);

    zoom = d3.zoom()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .filter((event) => {
        if (!event.sourceEvent) return true;
        if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
        return true;
      })
      .on('zoom', (event) => {
        stateGroup.attr('transform', event.transform);
        countyGroup.attr('transform', event.transform);
        borderGroup.attr('transform', event.transform);
      });

    mounted = true;
  });

  function getAreasInState(stateFips) {
    return areasByState[stateFips] || new Set();
  }

  function getStateFillColor(stateFips, colorBy, occupation) {
    const ab = FIPS_TO_AB[stateFips];
    if (!ab) return NO_DATA_COLOR;

    if (occupation) {
      const socData = wageIndex[occupation.soc];
      if (!socData) return NO_DATA_COLOR;

      let sum = 0;
      let count = 0;
      for (const area of getAreasInState(stateFips)) {
        if (socData[area]) {
          const val = socData[area][colorBy];
          if (val != null) { sum += val; count++; }
        }
      }
      if (count === 0) return NO_DATA_COLOR;
      return currentScale ? currentScale(sum / count) : NO_DATA_COLOR;
    } else {
      const stateAgg = aggregate.states[ab];
      if (!stateAgg || stateAgg[colorBy] == null) return NO_DATA_COLOR;
      return currentScale ? currentScale(stateAgg[colorBy]) : NO_DATA_COLOR;
    }
  }

  function getCountyFillColor(countyFips, colorBy, occupation, currentStateFips) {
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

  let currentScale = null;

  function computeColorScale(colorBy, occupation, currentStateFips) {
    let values = [];

    if (currentStateFips) {
      const stateAb = FIPS_TO_AB[currentStateFips];
      if (!stateAb) return null;

      if (occupation) {
        const socData = wageIndex[occupation.soc];
        if (socData) {
          for (const area of getAreasInState(currentStateFips)) {
            if (socData[area]) {
              const val = socData[area][colorBy];
              if (val != null) values.push(val);
            }
          }
        }
      } else {
        for (const area of getAreasInState(currentStateFips)) {
          const areaAgg = aggregate.areas[area];
          if (areaAgg && areaAgg[colorBy] != null) values.push(areaAgg[colorBy]);
        }
      }
    } else {
      if (occupation) {
        const socData = wageIndex[occupation.soc];
        if (socData) {
          for (const sf of Object.keys(FIPS_TO_AB)) {
            let sum = 0;
            let count = 0;
            for (const area of getAreasInState(sf)) {
              if (socData[area]) {
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

  function getStateWageData(stateFips) {
    const ab = FIPS_TO_AB[stateFips];
    if (!ab) return null;
    const occupation = filters.occupation;

    if (occupation) {
      const socData = wageIndex[occupation.soc];
      if (!socData) return null;
      let sums = { l1: 0, l2: 0, l3: 0, l4: 0, avg: 0 };
      let count = 0;
      for (const area of getAreasInState(stateFips)) {
        if (socData[area]) {
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
    const pos = tooltipPosition(event, rect);

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
    }, pos.x, pos.y);
  }

  function handleCountyHover(event, d) {
    if (!onTooltip) return;
    const countyFips = d.id;
    const countyStateFips = countyFips.substring(0, STATE_FIPS_LENGTH);

    if (mapState.currentState && countyStateFips !== mapState.currentState) return;

    const area = fipsToArea[countyFips];
    const occupation = filters.occupation;

    let countyName = d.properties?.name || 'Unknown County';
    let msaName = '';
    let stateName = '';

    if (area && geography[area]) {
      msaName = geography[area].name;
      stateName = geography[area].state;
      const county = geography[area].counties.find(c => c.fips === countyFips);
      if (county) countyName = county.name;
    } else {
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
    const pos = tooltipPosition(event, rect);

    if (!wages) {
      onTooltip({
        name: countyName,
        sub: stateName,
        hint: 'No wage data available',
      }, pos.x, pos.y);
      return;
    }

    let meta = '';
    let hint = '';
    if (occupation) {
      meta = occupation.soc + ' \u00b7 Zone ' + occupation.jobZone + ' \u00b7 ' + occupation.education;
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
    }, pos.x, pos.y);
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

    stateGroup.style('display', 'none');
    countyGroup.style('display', '');

    if (activeZoomState === stateFips) return;
    activeZoomState = stateFips;

    const stateFeature = stateFeatures.find(f => f.id === stateFips);
    if (!stateFeature) return;

    const [[x0, y0], [x1, y1]] = path.bounds(stateFeature);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;

    const scale = STATE_FILL_RATIO / Math.max(dx / VIEWBOX.w, dy / VIEWBOX.h);

    const viewCx = VIEWBOX.x + VIEWBOX.w / 2;
    const viewCy = VIEWBOX.y + VIEWBOX.h / 2;

    const translate = [viewCx - scale * cx, viewCy - scale * cy];

    const transform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);

    svg.call(zoom);
    svg.transition()
      .duration(ZOOM_TRANSITION_MS)
      .call(zoom.transform, transform);
  }

  function applyStateReset() {
    if (!svg) return;

    activeZoomState = null;

    if (zoom) {
      svg.call(zoom);
      svg.transition()
        .duration(ZOOM_TRANSITION_MS)
        .call(zoom.transform, d3.zoomIdentity)
        .on('end', () => {
          svg.on('.zoom', null);
        });
    }

    stateGroup.style('display', '');
    countyGroup.style('display', 'none');
  }

  $effect(() => {
    if (!mounted) return;

    const colorBy = filters.colorBy;
    const occupation = filters.occupation;
    const currentStateFips = mapState.currentState;

    currentScale = computeColorScale(colorBy, occupation, currentStateFips);

    if (currentStateFips) {
      applyStateZoom(currentStateFips);

      countyGroup.selectAll('path')
        .attr('fill', (d) => getCountyFillColor(d.id, colorBy, occupation, currentStateFips));
    } else {
      applyStateReset();

      stateGroup.selectAll('path')
        .attr('fill', (d) => getStateFillColor(d.id, colorBy, occupation));
    }
  });
</script>

<div class="map-container" bind:this={container}>
  <svg bind:this={svgEl} viewBox="{VIEWBOX.x} {VIEWBOX.y} {VIEWBOX.w} {VIEWBOX.h}" preserveAspectRatio="xMidYMid meet"></svg>
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
