<script lang="ts">
  import { _config, _status } from '@/store';
  import {
    cancel,
    initTask,
    runOnce,
    addBlacklist,
    clearLog,
    getConfig,
    getStatus,
    getLogs,
  } from '@/model';
  import { onMount } from 'svelte';

  let feedbackStatus: string = '';

  onMount(() => {
    initTask();
  });

  const handleRunOnce = async () => {
    await runOnce();
    _status.set('RUNNING');
  };

  const handleCancel = async () => {
    await cancel();
    getStatus();
  };

  const handleAddBlacklist = async () => {
    await addBlacklist($_config.preferredAddress).then(({ status, data }) => {
      if (status === 'success' && data) {
        feedback('success');
        getConfig();
        handleRunOnce();
      } else {
        feedback('fail');
      }
    });
  };

  const feedback = (status: 'success' | 'fail') => {
    feedbackStatus = status;
    window.setTimeout(() => {
      feedbackStatus = '';
    }, 3000);
  };

  const handleClearLog = async () => {
    await clearLog();
    getLogs();
  };
</script>

<div>
  <div class="relative flex items-center justify-between mb-4">
    <h1 class="text-xl font-extrabold">搜刮结果 😝</h1>
    {#if feedbackStatus === 'success'}
      <div class="absolute text-center text-green-500 -ml-14 left-1/2">
        添加黑名单成功
      </div>
    {:else if feedbackStatus === 'fail'}
      <div class="absolute text-center text-red-500 -ml-14 left-1/2">
        添加黑名单失败，请重试
      </div>
    {/if}
  </div>
  <div class="py-4 text-center rounded bg-gray-50">
    {#if $_status === 'RUNNING'}
      等待执行完成...
    {:else if $_config.preferredAddress}
      {$_config.preferredAddress} [共{$_config.channels || '-'}个频道]
    {:else}
      暂无数据
    {/if}
  </div>

  <div class="grid grid-cols-2 mt-12">
    {#if $_status === 'WAIT_EXECUTION'}
      <div class="flex flex-col items-center">
        <button
          class="px-8 py-1 text-base text-white rounded bg-indigo-1 hover:bg-indigo-600"
          on:click={handleRunOnce}
        >
          手动运行
        </button>
        <div class="mt-4 text-xs text-slate-400">立即手动触发一次执行任务</div>
      </div>
    {/if}
    {#if $_status === 'RUNNING'}
      <div class="flex flex-col items-center">
        <button
          class="px-8 py-1 text-base text-white bg-yellow-400 rounded hover:bg-yellow-500"
          on:click={handleCancel}
        >
          停止运行
        </button>
        <div class="mt-4 text-xs text-slate-400">立即取消当前执行中的任务</div>
      </div>
    {/if}
    {#if $_config.preferredAddress}
      <div class="flex flex-col items-center">
        <button
          class="px-8 py-1 text-base text-white rounded bg-slate-400 hover:bg-slate-600"
          on:click={handleAddBlacklist}
        >
          加入黑名单
        </button>
        <div class="mt-4 text-xs text-slate-400">
          将当前结果地址加入黑名单并立即重新执行一次任务
        </div>
      </div>
    {/if}
    <div class="flex flex-col items-center">
      <button
        class="px-8 py-1 text-base text-white rounded bg-slate-400 hover:bg-slate-600"
        on:click={handleClearLog}
      >
        清空日志
      </button>
      <div class="mt-4 text-xs text-slate-400">清空所有的执行日志</div>
    </div>
  </div>
</div>
