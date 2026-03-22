<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import * as d3 from 'd3';
  import * as topojson from 'topojson-client';
  import { createColorScale, NO_DATA_COLOR } from '$lib/utils/colors.js';
  import { FIPS_TO_AB, STATE_NAMES, STATE_FIPS_LENGTH } from '$lib/utils/geo.js';
  import { filters, mapState } from '$lib/state.svelte.js';

  let {
    geography,
    aggregate,
    wageIndex,
    employmentIndex,
    areaEmploymentTotals,
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

  const AB_TO_NAME = { ...STATE_NAMES };

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
  let areaFeatures = [];
  let stateMesh = null;
  let nationMesh = null;

  let svg, stateGroup, areaGroup, borderGroup;
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
    const resp = await fetch(`${base}/data/us-areas.json`);
    topoData = await resp.json();

    stateFeatures = topojson.feature(topoData, topoData.objects.states).features;
    areaFeatures = topojson.feature(topoData, topoData.objects.areas).features;
    stateMesh = topojson.mesh(topoData, topoData.objects.states, (a, b) => a !== b);
    nationMesh = topojson.mesh(topoData, topoData.objects.nation);

    path = d3.geoPath();

    svg = d3.select(svgEl);
    stateGroup = svg.append('g').attr('class', 'state-group');
    areaGroup = svg.append('g').attr('class', 'area-group').style('display', 'none');
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

    areaGroup.selectAll('path')
      .data(areaFeatures)
      .join('path')
      .attr('class', 'area')
      .attr('d', path)
      .on('mousemove', handleAreaHover)
      .on('mouseleave', handleHoverLeave)
      .on('click', handleAreaClick);

    zoom = d3.zoom()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .filter((event) => {
        if (!event.sourceEvent) return true;
        if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
        return true;
      })
      .on('zoom', (event) => {
        stateGroup.attr('transform', event.transform);
        areaGroup.attr('transform', event.transform);
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

  function getAreaFillColor(areaCode, colorBy, occupation, currentStateFips) {
    if (currentStateFips) {
      const stateAreas = areasByState[currentStateFips];
      if (!stateAreas || !stateAreas.has(areaCode)) return DIMMED_COLOR;
    }

    if (occupation) {
      const socData = wageIndex[occupation.soc];
      if (!socData || !socData[areaCode]) return NO_DATA_COLOR;
      const val = socData[areaCode][colorBy];
      return val != null && currentScale ? currentScale(val) : NO_DATA_COLOR;
    } else {
      const areaAgg = aggregate.areas[areaCode];
      if (!areaAgg || areaAgg[colorBy] == null) return NO_DATA_COLOR;
      return currentScale ? currentScale(areaAgg[colorBy]) : NO_DATA_COLOR;
    }
  }

  let currentScale = null;

  function computeColorScale(colorBy, occupation, currentStateFips) {
    let values = [];

    if (currentStateFips) {
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

  function getStateEmployment(stateFips, occupation) {
    let total = 0;
    if (occupation) {
      const socEmp = employmentIndex[occupation.soc];
      if (!socEmp) return null;
      for (const area of getAreasInState(stateFips)) {
        if (socEmp[area] != null) total += socEmp[area];
      }
    } else {
      for (const area of getAreasInState(stateFips)) {
        if (areaEmploymentTotals[area] != null) total += areaEmploymentTotals[area];
      }
    }
    return total || null;
  }

  function handleStateHover(event, d) {
    if (!onTooltip) return;
    const stateFips = d.id;
    const ab = FIPS_TO_AB[stateFips];
    const name = AB_TO_NAME[ab] || ab || 'Unknown';
    const areaCount = areasByState[stateFips]?.size ?? 0;
    const wages = getStateWageData(stateFips);

    if (!wages) {
      onTooltip(null);
      return;
    }

    const rect = container.getBoundingClientRect();
    const pos = tooltipPosition(event, rect);

    onTooltip({
      name,
      sub: areaCount + ' areas',
      l1: wages.l1,
      l2: wages.l2,
      l3: wages.l3,
      l4: wages.l4,
      avg: wages.avg,
      emp: getStateEmployment(stateFips, filters.occupation),
      meta: 'State average',
      hint: 'Click to view areas',
    }, pos.x, pos.y);
  }

  function handleAreaHover(event, d) {
    if (!onTooltip) return;
    const areaCode = d.id;
    const info = geography[areaCode];
    if (!info) return;

    if (mapState.currentState) {
      const stateAreas = areasByState[mapState.currentState];
      if (!stateAreas || !stateAreas.has(areaCode)) return;
    }

    const occupation = filters.occupation;
    let wages = null;
    let emp = null;

    if (occupation) {
      const socData = wageIndex[occupation.soc];
      if (socData && socData[areaCode]) wages = socData[areaCode];
      emp = employmentIndex[occupation.soc]?.[areaCode] ?? null;
    } else {
      wages = aggregate.areas[areaCode] || null;
      emp = areaEmploymentTotals[areaCode] ?? null;
    }

    const rect = container.getBoundingClientRect();
    const pos = tooltipPosition(event, rect);

    if (!wages) {
      onTooltip({
        name: info.name,
        sub: info.state,
        hint: 'No wage data available',
      }, pos.x, pos.y);
      return;
    }

    const countyCount = info.counties.length;
    let meta = '';
    if (occupation) {
      meta = occupation.soc + ' \u00b7 Zone ' + occupation.jobZone + ' \u00b7 ' + occupation.education;
    }

    onTooltip({
      name: info.name,
      sub: countyCount + (countyCount === 1 ? ' county' : ' counties'),
      l1: wages.l1,
      l2: wages.l2,
      l3: wages.l3,
      l4: wages.l4,
      avg: wages.avg,
      emp,
      empSuppressed: occupation && emp == null,
      meta,
    }, pos.x, pos.y);
  }

  function handleHoverLeave() {
    if (onTooltip) onTooltip(null);
  }

  function handleStateClick(event, d) {
    zoomToState(d.id);
  }

  function handleAreaClick(event, d) {
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
    if (ab) filters.stateAb = ab;
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
    areaGroup.style('display', '');

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
    areaGroup.style('display', 'none');
  }

  $effect(() => {
    if (!mounted) return;

    const colorBy = filters.colorBy;
    const occupation = filters.occupation;
    const currentStateFips = mapState.currentState;

    currentScale = computeColorScale(colorBy, occupation, currentStateFips);

    if (currentStateFips) {
      applyStateZoom(currentStateFips);

      areaGroup.selectAll('path')
        .attr('fill', (d) => getAreaFillColor(d.id, colorBy, occupation, currentStateFips));
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

  :global(.area) {
    stroke: #10101a;
    stroke-width: 0.5;
    cursor: pointer;
  }

  :global(.area:hover) {
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
