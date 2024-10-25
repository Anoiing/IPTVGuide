<script lang="ts">
  import { _config } from './store';
  import ConfigForm from './lib/ConfigForm/index.svelte';
  import Status from './lib/Status/index.svelte';
  import Layout from './lib/Layout/index.svelte';
  import MainLogs from './lib/MainLogs/index.svelte';
  import Scrapings from './lib/Scrapings/index.svelte';
  import Welcome from './lib/Welcome.svelte';
</script>

<Layout>
  <Welcome />
  <div class="md:grid md:grid-cols-12 md:divide-x">
    <div class="col-span-12 px-8 py-4 md:col-span-7">
      <ConfigForm />
      <Scrapings />
    </div>
    <div class="col-span-12 px-8 py-4 md:col-span-5">
      <Status />
      <MainLogs />
    </div>
  </div>
</Layout>
