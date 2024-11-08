<script lang="ts">
  import { _config, _status } from '@/store';
  import { afterUpdate } from 'svelte';
  import {
    verifierCron,
    saveConfig,
    getConfig,
    getStatus,
    runOnce,
  } from '@/model';
  import cx from 'classnames';

  let areaValue: any = '';
  let cronValue: any = '';
  let dedupValue: boolean = true;
  let areaError: string = '';
  let cronError: string = '';
  let feedbackStatus: string = '';

  $: {
    areaValue = $_config?.area || '';
    cronValue = $_config?.cron || '';
    dedupValue = $_config?.dedup || false;
  }

  const handleSave = async () => {
    if (!areaValue) {
      areaError = '请填写省/市';
    }
    if (cronValue) {
      cronError = !(await verifierCron(cronValue))?.data
        ? '请填写正确的Cron表达式'
        : '';
    } else {
      cronValue = '* */2 * * *';
    }

    if (areaError || cronError) {
      return false;
    } else {
      saveConfig({
        area: areaValue,
        cron: cronValue,
        dedup: dedupValue,
      }).then(({ status, data }) => {
        if (status === 'success' && data) {
          getConfig();
          getStatus();
          feedback('success');
          window.setTimeout(() => {
            runOnce();
            _status.set('RUNNING');
          }, 1000);
        } else {
          feedback('error');
        }
      });
    }
  };

  const handleFocus = () => {
    areaError = '';
    cronError = '';
  };

  const feedback = (status: 'success' | 'error') => {
    feedbackStatus = status;
    window.setTimeout(() => {
      feedbackStatus = '';
    }, 3000);
  };
</script>

<div>
  <div class="relative flex items-center justify-between mb-4">
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
  <div class="flex flex-col items-center justify-center mb-4">
    <div class="flex items-start mb-4 max-w-96 w-full">
      <div class="flex-none w-24 text-lg font-normal leading-10 text-right">
        <b class="mr-1 font-bold text-red-500">*</b>省&nbsp;/&nbsp;市：
      </div>
      <div class="flex flex-col flex-1 w-full">
        <input
          class={cx(
            'flex-1 border-2 border-gray-300 h-10 leading-10 px-4 rounded focus:border-blue-500 placeholder:text-gray-300',
            areaError && 'border-red-500'
          )}
          placeholder="中国省份或市"
          value={areaValue}
          on:focus={handleFocus}
          on:change={(e) => {
            // @ts-ignore
            areaValue = e.target.value;
          }}
        />
        {#if areaError}
          <div class="mt-1 text-sm text-red-500">{areaError}</div>
        {/if}
      </div>
    </div>
    <div class="flex items-start mb-4 max-w-96 w-full">
      <div class="flex-none w-24 text-lg font-normal leading-10 text-right">
        定时任务：
      </div>
      <div class="flex flex-col flex-1 w-full">
        <input
          class={cx(
            'flex-1 border-2 border-gray-300 h-10 leading-10 px-4 rounded focus:border-blue-500 placeholder:text-gray-300',
            cronError && 'border-red-500'
          )}
          placeholder="* */2 * * *"
          value={cronValue}
          on:focus={handleFocus}
          on:change={(e) => {
            // @ts-ignore
            cronValue = e.target.value;
          }}
        />
        {#if cronError}
          <div class="mt-1 text-sm text-red-500">{cronError}</div>
        {/if}
      </div>
    </div>
    <div class="flex mb-4 max-w-96 w-full items-center">
      <div class="flex-none w-24 text-lg font-normal leading-10 text-right">
        频道去重：
      </div>
      <div class="flex flex-1 w-full relative items-center">
        <div
          role="none"
          class={cx(
            'w-14 h-7 rounded-full p-0.5 border-2 border-gray-300  hover:border-blue-500 cursor-pointer',
            dedupValue
              ? 'bg-blue-500 text-right border-blue-500'
              : 'bg-gray-200 text-left'
          )}
          on:click={() => {
            dedupValue = !dedupValue;
          }}
        >
          <div
            class={cx(
              'rounded-full w-5 h-5 inline-block',
              dedupValue ? 'bg-white' : 'bg-blue-500'
            )}
          ></div>
        </div>
        <span class="ml-3 text-gray-500">
          {dedupValue ? '开启' : '关闭'}
        </span>
      </div>
    </div>
    <div class="flex justify-center">
      <button
        class="px-8 py-1 text-base text-white rounded bg-indigo-1 hover:bg-indigo-600"
        on:click={handleSave}
      >
        保&nbsp;&nbsp;存
      </button>
    </div>
  </div>
</div>
