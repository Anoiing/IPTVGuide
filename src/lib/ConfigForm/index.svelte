<script lang="ts">
  import { _config, getConfig } from '@/store';
  import { afterUpdate } from 'svelte';
  import { verifierCron, saveConfig } from './model';
  import cx from 'classnames';

  let areaRef: any;
  let cronRef: any;
  let areaError: string = '';
  let cronError: string = '';
  let feedbackStatus: string = '';
  let fill: boolean = false;

  afterUpdate(() => {
    if (areaRef && cronRef && !fill) {
      areaRef.value = $_config?.area || '';
      cronRef.value = $_config?.cron || '';
    }
  });

  const handleSave = async () => {
    if (!areaRef.value) {
      areaError = '请填写省/市';
    }
    if (cronRef.value) {
      cronError = !(await verifierCron(cronRef.value))?.data
        ? '请填写正确的Cron表达式'
        : '';
    } else {
      cronRef.value = '* */2 * * *';
    }

    if (areaError || cronError) {
      return false;
    } else {
      saveConfig({ area: areaRef.value, cron: cronRef.value }).then(
        ({ status, data }) => {
          if (status === 'success' && data) {
            getConfig();
            feedback('success');
          } else {
            feedback('error');
          }
        }
      );
    }
  };

  const handleFocus = () => {
    areaError = '';
    cronError = '';
    fill = true;
  };

  const feedback = (status: 'success' | 'error') => {
    feedbackStatus = status;
    window.setTimeout(() => {
      feedbackStatus = '';
    }, 3000);
  };
</script>

<div class="h-[300px]">
  <div class="relative flex items-center justify-between mb-8">
    <h1 class="text-xl font-extrabold">配置项 ⚙️</h1>
    {#if feedbackStatus === 'success'}
      <div class="absolute -ml-8 text-center text-green-500 left-1/2">
        保存成功
      </div>
    {:else if feedbackStatus === 'error'}
      <div class="absolute -ml-8 text-center text-red-500 left-1/2">
        保存失败，请重试
      </div>
    {/if}
  </div>
  <div class="flex flex-col items-center justify-center">
    <div class="flex items-start mb-8 max-w-96">
      <div class="flex-none w-24 text-lg font-normal leading-10">
        <b class="mr-1 font-bold text-red-500">*</b>省&nbsp;/&nbsp;市：
      </div>
      <div class="flex flex-col flex-1 w-full">
        <input
          bind:this={areaRef}
          class={cx(
            'flex-1 border-2 border-gray-300 h-10 leading-10 px-4 rounded focus:border-blue-500 placeholder:text-gray-300',
            areaError && 'border-red-500'
          )}
          placeholder="中国省份或市"
          on:focus={handleFocus}
        />
        {#if areaError}
          <div class="mt-1 text-sm text-red-500">{areaError}</div>
        {/if}
      </div>
    </div>
    <div class="flex items-start mb-8 max-w-96">
      <div class="flex-none w-24 text-lg font-normal leading-10">
        定时任务：
      </div>
      <div class="flex flex-col flex-1 w-full">
        <input
          bind:this={cronRef}
          class={cx(
            'flex-1 border-2 border-gray-300 h-10 leading-10 px-4 rounded focus:border-blue-500 placeholder:text-gray-300',
            cronError && 'border-red-500'
          )}
          placeholder="* */2 * * *"
          on:focus={handleFocus}
        />
        {#if cronError}
          <div class="mt-1 text-sm text-red-500">{cronError}</div>
        {/if}
      </div>
    </div>

    <div class="flex justify-center">
      <button
        class="px-8 py-1 text-lg text-white rounded bg-indigo-1 hover:bg-indigo-600"
        on:click={handleSave}
      >
        保&nbsp;&nbsp;存
      </button>
    </div>
  </div>
</div>
