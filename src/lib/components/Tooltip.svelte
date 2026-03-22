<script>
  import { formatWage, formatEmployment } from '$lib/utils/format.js';
  import { filters } from '$lib/state.svelte.js';

  let { visible = false, x = 0, y = 0, data = null } = $props();
</script>

{#if visible && data}
  <div class="tooltip" style="left: {x}px; top: {y}px;">
    <div class="tt-name">{data.name}</div>
    {#if data.sub}<div class="tt-sub">{data.sub}</div>{/if}
    {#if data.avg != null}
      <div class="tt-div"></div>
      {#if data.l1 != null}
        <div class="tt-row"><span class="tt-label">Level I</span><span class="tt-val">{formatWage(data.l1, filters.isAnnual)}</span></div>
        <div class="tt-row"><span class="tt-label">Level II</span><span class="tt-val">{formatWage(data.l2, filters.isAnnual)}</span></div>
        <div class="tt-row"><span class="tt-label">Level III</span><span class="tt-val">{formatWage(data.l3, filters.isAnnual)}</span></div>
        <div class="tt-row"><span class="tt-label">Level IV</span><span class="tt-val">{formatWage(data.l4, filters.isAnnual)}</span></div>
        <div class="tt-div"></div>
      {:else}
        <div class="tt-flag">High Wage / No Leveled Wage</div>
        <div class="tt-flag-desc">Individual levels not available for this occupation in this area. Only the average is reported.</div>
        <div class="tt-div"></div>
      {/if}
      <div class="tt-row tt-avg"><span class="tt-label">Average</span><span class="tt-val">{formatWage(data.avg, filters.isAnnual)}</span></div>
      {#if data.emp != null}
        <div class="tt-div"></div>
        <div class="tt-row"><span class="tt-label">Employment</span><span class="tt-val">{formatEmployment(data.emp)}</span></div>
      {:else if data.empSuppressed}
        <div class="tt-div"></div>
        <div class="tt-flag-emp">No employment data available</div>
      {/if}
    {/if}
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
  .tt-flag { font-size: 10px; color: #c08040; font-weight: 500; margin-bottom: 2px; }
  .tt-flag-emp { font-size: 10px; color: #c0a030; font-style: italic; }
  .tt-flag-desc { font-size: 9px; color: #7070a0; line-height: 1.4; margin-bottom: 2px; max-width: 200px; }
</style>
