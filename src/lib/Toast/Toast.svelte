<script lang="ts">
  import Icon from '../Icon.svelte';
  import cx from 'classnames';
  export let type: 'success' | 'error' | 'warning' = 'success';
  export let message: string = '';
</script>

<div
  class={cx(
    '_toast z-50 fixed min-w-44 top-16 shadow-xl border rounded-lg flex items-center px-4 py-3 left-1/2',
    type === 'success' && 'border-2 border-green-600 bg-green-100',
    type === 'error' && 'border-2 border-red-600 bg-red-100',
    type === 'warning' && 'border-2 border-yellow-600 bg-yellow-100'
  )}
>
  <div class="mr-4">
    {#if type === 'success'}
      <span class="text-2xl text-green-600">
        <Icon
          name="success"
          class="font-black"
        />
      </span>
    {:else if type === 'error'}
      <span class="text-2xl text-red-600">
        <Icon
          name="close"
          class="font-black"
        />
      </span>
    {:else}
      <span class="text-2xl text-yellow-600">
        <Icon
          name="warn"
          class="font-black"
        />
      </span>
    {/if}
  </div>
  <div class="break-all">
    {message}
  </div>
</div>

<style>
  ._toast {
    transform: translateX(-50%);
  }
</style>
