<script lang="ts">
  import { _config, _status } from '@/store';
</script>

<div>
  <div class="mb-4">
    <h1 class="text-xl font-extrabold">搜刮结果 😝</h1>
  </div>
  <div class="text-center">
    {#if $_status === 'RUNNING'}
      等待执行完成...
    {:else if $_config.preferredAddress}
      {$_config.preferredAddress} [{$_config.channels || '-'}个频道]
    {:else}
      暂无数据
    {/if}
  </div>
</div>
