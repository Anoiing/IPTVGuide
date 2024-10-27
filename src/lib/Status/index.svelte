<script lang="ts">
  import { _config, _status } from '@/store';
  import { getStatus, getConfig } from '@/model';
  import { onDestroy, onMount } from 'svelte';

  const STATUS: any = {
    NOT_CONFIGURED: '未配置',
    WAIT_EXECUTION: '等待运行',
    RUNNING: '运行中...',
  };

  let t: any;
  let status_unsubscribe: any;

  onMount(() => {
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
</script>

<div>
  <div class="">
    <h1 class="text-xl font-extrabold">当前状态 😎</h1>
    <h3
      class="py-1 my-2 text-lg font-bold leading-10 text-center rounded bg-gray-50"
    >
      {STATUS[$_status] || '获取状态失败'}
    </h3>
  </div>
</div>
