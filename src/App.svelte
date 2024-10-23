<script lang="ts">
  import { _config } from './store';
  import ConfigForm from './lib/ConfigForm/index.svelte';
  import Execution from './lib/Execution/index.svelte';
  import Layout from './lib/Layout/index.svelte';
  import MainLogs from './lib/MainLogs/index.svelte';
  import ScrapingResults from './lib/ScrapingResults/index.svelte';
  import Welcome from './lib/Welcome.svelte';
</script>

<Layout>
  <Welcome />
  <div class="md:grid md:grid-cols-12 md:divide-x">
    <div class="col-span-12 px-8 py-4 md:col-span-7">
      <ConfigForm />
      <ScrapingResults />
    </div>
    <div class="col-span-12 px-8 py-4 md:col-span-5">
      <Execution />
      <MainLogs />
    </div>
  </div>
</Layout>
