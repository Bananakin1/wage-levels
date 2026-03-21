<script>
  import Dropdown from './Dropdown.svelte';
  import { filters, mapState } from '$lib/state.svelte.js';

  let { occupations, geography } = $props();

  let searchText = $state('');
  let searchResults = $state([]);
  let showResults = $state(false);

  // FIPS to state abbreviation mapping
  const FIPS_STATES = { '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY' };

  // State full names for dropdown labels
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

  // Build state list from actual county FIPS prefixes in geography.
  // This ensures states like RI that only appear via cross-state MSA counties
  // are included in the dropdown.
  const statesFromCounties = new Set();
  for (const g of Object.values(geography)) {
    for (const c of g.counties) {
      statesFromCounties.add(c.fips.substring(0, 2));
    }
  }

  const stateItems = [
    { value: '', label: 'All states' },
    ...[...statesFromCounties]
      .filter(fips => FIPS_STATES[fips])
      .map(fips => {
        const ab = FIPS_STATES[fips];
        // Try geography stateAb field first, fall back to full name lookup
        const geo = Object.values(geography).find(g => g.stateAb === ab);
        return { value: fips, label: geo?.state || STATE_FULL_NAMES[ab] || ab };
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  ];

  const zoneItems = [
    { value: '', label: 'All Zones' },
    { value: '1', label: 'Zone 1 — Little prep' },
    { value: '2', label: 'Zone 2 — Some prep' },
    { value: '3', label: 'Zone 3 — Medium prep' },
    { value: '4', label: 'Zone 4 — Considerable' },
    { value: '5', label: 'Zone 5 — Extensive' },
  ];

  const eduItems = [
    { value: '', label: 'All levels' },
    { value: 'Less than High School', label: 'Less than HS' },
    { value: 'High School Diploma', label: 'High school' },
    { value: 'Post-Secondary Certificate', label: 'Post-secondary cert' },
    { value: 'Some College', label: 'Some college' },
    { value: "Associate's Degree", label: "Associate's" },
    { value: "Bachelor's Degree", label: "Bachelor's" },
    { value: "Master's Degree", label: "Master's" },
    { value: "Doctoral Degree", label: "Doctoral" },
  ];

  const colorItems = [
    { value: 'l1', label: 'Level I' },
    { value: 'l2', label: 'Level II' },
    { value: 'l3', label: 'Level III' },
    { value: 'l4', label: 'Level IV' },
    { value: 'avg', label: 'Average' },
  ];

  // Derived FIPS value for the state dropdown (reverse lookup from stateAb)
  let stateFips = $derived(
    Object.entries(FIPS_STATES).find(([, ab]) => ab === filters.stateAb)?.[0] || ''
  );

  function onSearch() {
    const q = searchText.toLowerCase().trim();
    if (q.length < 2) { searchResults = []; showResults = false; return; }
    searchResults = Object.values(occupations)
      .filter(o => {
        const textMatch = o.title.toLowerCase().includes(q) || o.soc.includes(q) || (o.description || '').toLowerCase().includes(q);
        if (!textMatch) return false;
        if (filters.jobZone && o.jobZone !== parseInt(filters.jobZone, 10)) return false;
        if (filters.education && o.education !== filters.education) return false;
        return true;
      })
      .slice(0, 20);
    showResults = true;
  }

  // Re-run search when filters change
  $effect(() => {
    filters.jobZone;
    filters.education;
    if (searchText.length >= 2) onSearch();
  });

  function selectOccupation(occ) {
    filters.occupation = occ;
    searchText = occ.title + ' (' + occ.soc + ')';
    showResults = false;
  }

  function clearOccupation() {
    filters.occupation = null;
    searchText = '';
    searchResults = [];
    showResults = false;
  }

  function onStateChange(fips) {
    const ab = fips ? FIPS_STATES[fips] : '';
    filters.stateAb = ab;
    mapState.currentState = fips || null;
  }

  function handleSearchFocus() {
    if (searchText.length >= 2 && searchResults.length > 0) {
      showResults = true;
    }
  }

  function handleSearchBlur() {
    // Delay hiding so click on result registers first
    setTimeout(() => { showResults = false; }, 150);
  }
</script>

<div class="filter-bar">
  <!-- Occupation search -->
  <div class="search-wrap">
    <input
      class="search-input"
      type="text"
      placeholder="Search occupation, SOC code…"
      bind:value={searchText}
      oninput={onSearch}
      onfocus={handleSearchFocus}
      onblur={handleSearchBlur}
    />
    {#if filters.occupation}
      <button class="clear-btn" onclick={clearOccupation} title="Clear occupation">✕</button>
    {/if}
    {#if showResults && searchResults.length > 0}
      <div class="search-results">
        {#each searchResults as occ (occ.soc)}
          <button class="result-item" onclick={() => selectOccupation(occ)}>
            <span class="result-title">{occ.title}</span>
            <span class="result-soc">{occ.soc}</span>
          </button>
        {/each}
      </div>
    {/if}
    {#if showResults && searchText.length >= 2 && searchResults.length === 0}
      <div class="search-results">
        <div class="no-results">No occupations found</div>
      </div>
    {/if}
  </div>

  <!-- State dropdown -->
  <div class="dropdown-wrap">
    <Dropdown
      label="All states"
      items={stateItems}
      value={stateFips}
      onChange={onStateChange}
    />
  </div>

  <!-- Job Zone dropdown -->
  <div class="dropdown-wrap">
    <Dropdown
      label="All Zones"
      items={zoneItems}
      bind:value={filters.jobZone}
    />
  </div>

  <!-- Education dropdown -->
  <div class="dropdown-wrap edu-wrap">
    <Dropdown
      label="All levels"
      items={eduItems}
      bind:value={filters.education}
    />
  </div>

  <div class="divider"></div>

  <!-- Color By dropdown -->
  <div class="dropdown-wrap color-wrap">
    <span class="control-label">Color by</span>
    <Dropdown
      label="Average"
      items={colorItems}
      bind:value={filters.colorBy}
    />
  </div>

  <div class="divider"></div>

  <!-- Hourly / Annual toggle -->
  <div class="toggle-wrap">
    <button
      class="toggle-btn"
      class:active={!filters.isAnnual}
      onclick={() => filters.isAnnual = false}
    >
      Hourly
    </button>
    <button
      class="toggle-btn"
      class:active={filters.isAnnual}
      onclick={() => filters.isAnnual = true}
    >
      Annual
    </button>
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #0c0c1a;
    border-bottom: 1px solid #1e1e32;
    flex-wrap: nowrap;
    min-width: 0;
  }

  /* Occupation search */
  .search-wrap {
    position: relative;
    flex: 2;
    min-width: 180px;
  }

  .search-input {
    width: 100%;
    box-sizing: border-box;
    background: #111120;
    border: 1px solid #1e1e32;
    border-radius: 4px;
    padding: 6px 28px 6px 10px;
    font-size: 12px;
    color: #c0c0d8;
    font-family: 'IBM Plex Sans', sans-serif;
    outline: none;
  }

  .search-input::placeholder {
    color: #50506a;
  }

  .search-input:focus {
    border-color: #3060a0;
  }

  .clear-btn {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #50506a;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
  }

  .clear-btn:hover {
    color: #a0a0c0;
  }

  .search-results {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 100%;
    min-width: 260px;
    background: #111120;
    border: 1px solid #1e1e32;
    border-radius: 4px;
    z-index: 300;
    max-height: 260px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .search-results::-webkit-scrollbar { width: 4px; }
  .search-results::-webkit-scrollbar-track { background: #111120; }
  .search-results::-webkit-scrollbar-thumb { background: #2a2a40; border-radius: 2px; }

  .result-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  .result-item:hover {
    background: #1a1a30;
  }

  .result-title {
    font-size: 12px;
    color: #c0c0d8;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-soc {
    font-size: 11px;
    color: #5090c0;
    font-family: 'IBM Plex Mono', 'Courier New', monospace;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .no-results {
    padding: 8px 12px;
    font-size: 12px;
    color: #50506a;
    font-family: 'IBM Plex Sans', sans-serif;
  }

  /* Dropdowns */
  .dropdown-wrap {
    flex-shrink: 0;
    min-width: 110px;
  }

  .edu-wrap {
    min-width: 120px;
  }

  /* Color by group */
  .color-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: auto;
  }

  .control-label {
    font-size: 11px;
    color: #50506a;
    font-family: 'IBM Plex Sans', sans-serif;
    white-space: nowrap;
  }

  /* Divider */
  .divider {
    width: 1px;
    height: 20px;
    background: #1e1e32;
    flex-shrink: 0;
  }

  /* Hourly / Annual toggle */
  .toggle-wrap {
    display: flex;
    flex-shrink: 0;
    border: 1px solid #1e1e32;
    border-radius: 4px;
    overflow: hidden;
  }

  .toggle-btn {
    background: #111120;
    border: none;
    padding: 5px 10px;
    font-size: 12px;
    color: #a0a0c0;
    font-family: 'IBM Plex Sans', sans-serif;
    cursor: pointer;
    white-space: nowrap;
  }

  .toggle-btn + .toggle-btn {
    border-left: 1px solid #1e1e32;
  }

  .toggle-btn:hover {
    background: #1a1a30;
    color: #c0c0d8;
  }

  .toggle-btn.active {
    background: #1a2a40;
    color: #5090c0;
  }
</style>
