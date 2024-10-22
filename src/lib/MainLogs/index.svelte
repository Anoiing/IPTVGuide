<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { _logs, _status, getLogs } from '@/store';

  let t: any = null;
  let status_unsubscribe: any;

  onMount(() => {
    getLogs();
    status_unsubscribe = _status.subscribe((v) => {
      if (v === 'RUNNING') {
        t = window.setInterval(() => {
          getLogs();
        }, 1000);
      } else {
        window.clearInterval(t);
        t = null;
      }
    });
  });

  onDestroy(() => {
    try {
      status_unsubscribe();
    } catch (error) {}
  });
</script>

<div class="mt-6">
  <h1 class="text-xl font-extrabold">执行日志 👀</h1>
  <div class="mt-4 overflow-y-auto _log_wrap">
    {#if $_logs}
      <div class="text-xs break-all whitespace-pre-line">
        {$_logs}
      </div>
    {:else}
      <div class="text-center">暂无数据</div>
    {/if}
  </div>
</div>

<style>
  ._log_wrap {
    height: calc(100vh - 390px);
  }
</style>
