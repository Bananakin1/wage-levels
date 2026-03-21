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

<svelte:window onclick={handleClickOutside} />

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
