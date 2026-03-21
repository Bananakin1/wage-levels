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

  function handleTooltip(d, x, y) {
    tooltipData = d;
    tooltipX = x;
    tooltipY = y;
    tooltipVisible = !!d;
  }
</script>

<div class="app">
  <header class="header">
    <h1>Wage Explorer</h1>
    <p>
      This tool combines occupation data from <a href="https://www.onetcenter.org" target="_blank" rel="noopener">O*NET</a> with prevailing wage data from the <a href="https://flag.dol.gov" target="_blank" rel="noopener">DOL Office of Foreign Labor Certification</a> so you can explore wages by occupation at the county level across the U.S., all in one place. Instead of cross referencing both websites manually, you can search for an occupation and instantly see how wage levels vary geographically. Wages are shown across four levels that represent percentiles of the pay distribution: Level I is roughly the 17th percentile (entry level), Level II the 34th, Level III the 50th, and Level IV the 67th. Current data covers July 2025 through June 2026, sourced from the May 2024 BLS Occupational Employment and Wage Statistics survey.
    </p>
    <p class="attribution">
      O*NET data from U.S. Department of Labor, Employment and Training Administration, licensed under CC BY 4.0.
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
      onTooltip={handleTooltip}
    />

    <Tooltip visible={tooltipVisible} x={tooltipX} y={tooltipY} data={tooltipData} />

    {#if mapState.currentState}
      <button class="back-btn" onclick={() => mapComponent.resetZoom()}>&#8592; All states</button>
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
  .header :global(.attribution) { color: #4848a0; font-size: 10px; margin-top: 4px; }
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
