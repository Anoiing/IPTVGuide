<script lang="ts">
  import { onMount } from 'svelte';
  import {
    systemStatus,
    systemConfig,
    appStore,
  } from '../shared/stores/AppStore.js';
  import { SystemAPI, TaskAPI } from './services/ApiService.js';
  import NotificationToast from './components/NotificationToast.svelte';

  let isLoading = true;
  let cronExpression = '';
  let isTaskRunning = false;
  let isButtonLoading = false;

  // 状态配置映射
  const statusConfig = {
    NOT_CONFIGURED: {
      label: '未配置',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    WAIT_EXECUTION: {
      label: '等待运行',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    RUNNING: {
      label: '运行中',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    ERROR: { label: '执行错误', color: 'text-red-600', bgColor: 'bg-red-100' },
    IDLE: { label: '空闲', color: 'text-gray-600', bgColor: 'bg-gray-100' },
    STOPPING: {
      label: '停止中',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  };

  // 响应式状态
  $: currentStatus = $systemStatus;
  $: currentConfig = $systemConfig;
  $: statusInfo = statusConfig[currentStatus] || statusConfig.NOT_CONFIGURED;
  $: isTaskRunning = currentStatus === 'RUNNING';
  $: buttonText = isTaskRunning ? '停止' : '启动';
  $: buttonColor = isTaskRunning
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-green-500 hover:bg-green-600';

  /**
   * 初始化应用
   */
  onMount(async () => {
    try {
      appStore.initialize();
      await Promise.all([loadSystemConfig(), loadSystemStatus()]);
      setupPolling();
      isLoading = false;
    } catch (error) {
      console.error('App initialization error:', error);
      appStore.handleError(error, 'app-initialization');
      isLoading = false;
    }
  });

  /**
   * 加载系统配置
   */
  async function loadSystemConfig() {
    try {
      const response = await SystemAPI.getConfig();
      if (response.status === 'success' && response.data) {
        appStore.setConfig(response.data);
        cronExpression = response.data.schedule?.cron || '';
      }
    } catch (error) {
      appStore.handleError(error, 'load-config');
    }
  }

  /**
   * 加载系统状态
   */
  async function loadSystemStatus() {
    try {
      const response = await SystemAPI.getStatus();
      if (response.status === 'success' && response.data) {
        appStore.setStatus(response.data);
      }
    } catch (error) {
      appStore.handleError(error, 'load-status');
    }
  }

  /**
   * 设置定时轮询更新
   */
  function setupPolling() {
    setInterval(async () => {
      await loadSystemStatus();
    }, 5000);
  }

  /**
   * 处理启动/停止按钮点击
   */
  async function handleToggleTask() {
    if (isButtonLoading) return;

    isButtonLoading = true;
    try {
      if (isTaskRunning) {
        // 停止任务
        const response = await TaskAPI.cancel();
        if (response.status === 'success') {
          appStore.addNotification({
            id: `task-stop-${Date.now()}`,
            type: 'SUCCESS',
            title: '任务停止',
            message: '任务已成功停止',
            timestamp: new Date(),
            acknowledged: false,
            source: 'task-control',
          });
        }
      } else {
        // 启动任务
        const response = await TaskAPI.runOnce();
        if (response.status === 'success') {
          appStore.addNotification({
            id: `task-start-${Date.now()}`,
            type: 'SUCCESS',
            title: '任务启动',
            message: '任务已成功启动',
            timestamp: new Date(),
            acknowledged: false,
            source: 'task-control',
          });
        }
      }
    } catch (error) {
      appStore.handleError(error, isTaskRunning ? 'task-stop' : 'task-start');
    } finally {
      isButtonLoading = false;
    }
  }

  /**
   * 保存Cron表达式配置
   */
  async function saveCronExpression() {
    if (!cronExpression.trim()) return;

    try {
      const updatedConfig = {
        ...currentConfig,
        schedule: {
          ...currentConfig.schedule,
          cron: cronExpression.trim(),
          enabled: true,
        },
      };

      const response = await SystemAPI.updateConfig(updatedConfig);
      if (response.status === 'success') {
        appStore.setConfig(updatedConfig);
        appStore.addNotification({
          id: `config-update-${Date.now()}`,
          type: 'SUCCESS',
          title: '配置更新',
          message: 'Cron表达式已成功保存',
          timestamp: new Date(),
          acknowledged: false,
          source: 'config-update',
        });
      }
    } catch (error) {
      appStore.handleError(error, 'config-update');
    }
  }
</script>

<div
  class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center"
>
  {#if isLoading}
    <!-- 加载状态 -->
    <div class="flex flex-col items-center space-y-4">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"
      ></div>
      <p class="text-gray-600">正在加载系统数据...</p>
    </div>
  {:else}
    <!-- 极简单一界面 -->
    <div
      class="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 w-full max-w-md"
    >
      <!-- 标题 -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900 mb-4">IPTV 管理系统</h1>
        <!-- 状态显示 -->
        <div
          class="inline-flex items-center justify-center space-x-3 px-6 py-3 rounded-full {statusInfo.bgColor} border-2 border-opacity-20 border-current"
        >
          <div
            class="w-4 h-4 rounded-full {statusInfo.bgColor
              .replace('bg-', 'bg-')
              .replace('-100', '-500')} animate-pulse"
          ></div>
          <span class="text-lg {statusInfo.color} font-semibold"
            >{statusInfo.label}</span
          >
        </div>
      </div>

      <!-- Cron表达式输入 -->
      <div class="mb-6">
        <label for="cron" class="block text-sm font-medium text-gray-700 mb-2">
          定时任务表达式
        </label>
        <div class="flex space-x-2">
          <input
            id="cron"
            type="text"
            bind:value={cronExpression}
            placeholder="0 */6 * * *"
            class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <button
            on:click={saveCronExpression}
            disabled={!cronExpression.trim()}
            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium transition-colors"
          >
            保存
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-1">
          例: 0 */6 * * * (每6小时执行一次)
        </p>
      </div>

      <!-- 启动/停止按钮 -->
      <div class="text-center">
        <button
          on:click={handleToggleTask}
          disabled={isButtonLoading}
          class="w-full py-3 px-6 {buttonColor} text-white rounded-lg font-medium text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {#if isButtonLoading}
            <div
              class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"
            ></div>
            <span>处理中...</span>
          {:else}
            <span>{buttonText}</span>
          {/if}
        </button>
      </div>
    </div>
  {/if}

  <!-- 通知提示 -->
  <NotificationToast />
</div>
