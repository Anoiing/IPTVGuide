<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getStatus, runOnce, cancel } from './model';

  const STATUS: any = {
    NOT_CONFIGURED: '未配置',
    WAIT_EXECUTION: '等待运行',
    RUNNING: '运行中...',
  };

  let status: string = 'WAIT_EXECUTION';
  let t: any;

  onMount(() => {
    t = window.setInterval(() => {
      getSystemStatus();
    }, 3000);
  });

  onDestroy(() => {
    window.clearInterval(t);
    t = undefined;
  });

  const getSystemStatus = async () => {
    status = (await getStatus())?.data;
  };

  const handleRunOnce = async () => {
    await runOnce();
    getSystemStatus();
  };

  const handleCancel = async () => {
    await cancel();
    getSystemStatus();
  };
</script>

<div>
  <div class="h-44">
    <h1 class="text-xl font-extrabold">当前状态 😎</h1>
    <h3
      class="py-3 mx-4 my-6 text-lg font-bold leading-10 text-center rounded bg-gray-50"
    >
      {STATUS[status] || '获取状态失败'}
    </h3>
    {#if status === 'WAIT_EXECUTION'}
      <div class="flex justify-center">
        <button
          class="px-8 py-1 text-base text-white rounded bg-indigo-1 hover:bg-indigo-600"
          on:click={handleRunOnce}
        >
          立即运行一次
        </button>
      </div>
    {/if}
    {#if status === 'RUNNING'}
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
