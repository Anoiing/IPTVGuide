<script lang="ts">
  import { onMount } from 'svelte';
  import { init } from './model';

  onMount(() => {
    // init();
  });
</script>

<div class="flex items-center justify-center w-screen h-screen">
  <div
    class="w-[90vw] h-[90vh] bg-white rounded-3xl shadow-2xl px-8 py-9 relative overflow-y-auto overflow-x-hidden"
  >
    <slot />
  </div>
</div>
