<script>
  import FilterBar from '$lib/components/FilterBar.svelte';
  import USMap from '$lib/components/USMap.svelte';
  import Tooltip from '$lib/components/Tooltip.svelte';
  import { EMBER } from '$lib/utils/colors.js';
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
      Combines <a href="https://www.onetcenter.org" target="_blank" rel="noopener">O*NET</a> occupation data with <a href="https://flag.dol.gov" target="_blank" rel="noopener">OFLC</a> prevailing wages so you can explore wage levels by occupation at the county level across the U.S., all in one place. Instead of cross referencing both websites manually, search for an occupation and instantly see how wages vary geographically. Wages are split into four levels based on pay distribution percentiles: Level I (~17th percentile, entry level), Level II (~34th), Level III (~50th), Level IV (~67th). Use "Color by" to pick which level colors the map. Some occupations are flagged "High Wage" by the DOL, meaning only an average is available and individual levels cannot be determined. You can also filter by Job Zone (1 = little or no prep, 5 = extensive education and experience) or by Education level to narrow your occupation search. Data covers Jul 2025 through Jun 2026, sourced from the May 2024 BLS OEWS survey.
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
      onTooltip={handleTooltip}
    />

    <Tooltip visible={tooltipVisible} x={tooltipX} y={tooltipY} data={tooltipData} />

    {#if mapState.currentState}
      <button class="back-btn" onclick={() => mapComponent.resetZoom()}>&#8592; All states</button>
    {/if}

    <div class="legend">
      <span>Low</span>
      <div class="legend-bar">
        {#each EMBER as color}
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
