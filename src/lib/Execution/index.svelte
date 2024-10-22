<script lang="ts">
  import { _config, _status, getStatus, getConfig } from '@/store';
  import { onDestroy, onMount } from 'svelte';
  import { initTask, runOnce, cancel } from './model';

  const STATUS: any = {
    NOT_CONFIGURED: '未配置',
    WAIT_EXECUTION: '等待运行',
    RUNNING: '运行中...',
  };

  let t: any;
  let status_unsubscribe: any;

  onMount(() => {
    initTask();
    getStatus();

    status_unsubscribe = _status.subscribe((v) => {
      if (v === 'RUNNING') {
        t = window.setInterval(() => {
          getStatus();
        }, 2000);
      } else {
        getConfig();
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

  const handleRunOnce = async () => {
    await runOnce();
    _status.set('RUNNING');
  };

  const handleCancel = async () => {
    await cancel();
    getStatus();
  };
</script>

<div>
  <div class="h-44">
    <h1 class="text-xl font-extrabold">当前状态 😎</h1>
    <h3
      class="py-3 my-6 text-lg font-bold leading-10 text-center rounded bg-gray-50"
    >
      {STATUS[$_status] || '获取状态失败'}
    </h3>
    {#if $_status === 'WAIT_EXECUTION'}
      <div class="flex justify-center">
        <button
          class="px-8 py-1 text-base text-white rounded bg-indigo-1 hover:bg-indigo-600"
          on:click={handleRunOnce}
        >
          立即运行一次
        </button>
      </div>
    {/if}
    {#if $_status === 'RUNNING'}
      <div class="flex justify-center">
        <button
          class="px-8 py-1 text-base text-white bg-yellow-400 rounded hover:bg-yellow-500"
          on:click={handleCancel}
        >
          停止运行
        </button>
      </div>
    {/if}
  </div>
</div>
