<script>
  let { data } = $props();
</script>

<h1>Wage Explorer</h1>
<p>Loaded {Object.keys(data.occupations).length} occupations, {Object.keys(data.geography).length} areas</p>
