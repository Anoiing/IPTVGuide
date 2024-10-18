<script lang="ts">
  import { onMount } from 'svelte';
  import ConfigForm from './lib/ConfigForm/index.svelte';
  import Execution from './lib/Execution/index.svelte';
  import Layout from './lib/Layout/index.svelte';
  import ScrapingResults from './lib/ScrapingResults/index.svelte';
  import Welcome from './lib/Welcome.svelte';

  onMount(() => {});
</script>

<Layout>
  <Welcome />
  <div class="grid grid-cols-12 divide-x _container">
    <div class="col-span-7 p-4">
      <ConfigForm />
      <ScrapingResults />
    </div>
    <div class="col-span-5 p-4"><Execution /></div>
  </div>
</Layout>

<style>
  ._container {
    height: calc(100% - 110px);
  }
</style>
