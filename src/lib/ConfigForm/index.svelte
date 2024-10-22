<script lang="ts">
  import { onMount } from 'svelte';
  import { verifierCron, saveConfig, getConfig } from './model';
  import cx from 'classnames';
  import toast from '@/lib/Toast';

  let areaRef: any;
  let cronRef: any;
  let areaError: string = '';
  let cronError: string = '';

  onMount(async () => {
    const { data } = await getConfig();
    areaRef.value = data.area || '';
    cronRef.value = data.cron || '';
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
      cronRef.value = '* 2 * * *';
    }

    if (areaError || cronError) {
      return false;
    } else {
      saveConfig({ area: areaRef.value, cron: cronRef.value }).then(
        ({ status, data }) => {
          if (status === 'success' && data) {
            toast.success('保存成功！');
          } else {
            toast.error('保存失败，请重试！');
          }
        }
      );
    }
  };
</script>

<div class="h-[300px]">
  <div class="mb-8">
    <h1 class="text-xl font-extrabold">配置项 ⚙️</h1>
  </div>
  <div class="pl-10 pr-20 ">
    <div class="flex items-start mb-8">
      <div class="flex-none w-24 text-lg font-normal leading-10">
        <b class="mr-1 font-bold text-red-500 ">*</b>省&nbsp;/&nbsp;市：
      </div>
      <div class="flex flex-col w-full">
        <input
          bind:this={areaRef}
          class={cx(
            'flex-1 border-2 border-gray-300 h-10 leading-10 px-4 rounded focus:border-blue-500 placeholder:text-gray-300',
            areaError && 'border-red-500'
          )}
          placeholder="中国省份或市"
          on:focus={() => (areaError = '')}
        />
        {#if areaError}
          <div class="mt-1 text-sm text-red-500">{areaError}</div>
        {/if}
      </div>
    </div>
    <div class="flex items-start mb-8">
      <div class="flex-none w-24 text-lg font-normal leading-10 ">
        定时任务：
      </div>
      <div class="flex flex-col w-full">
        <input
          bind:this={cronRef}
          class={cx(
            'flex-1 border-2 border-gray-300 h-10 leading-10 px-4 rounded focus:border-blue-500 placeholder:text-gray-300',
            cronError && 'border-red-500'
          )}
          placeholder="* 2 * * *"
          on:focus={() => (cronError = '')}
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
