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
  let isRunOnceLoading = false;
  let isBlacklistLoading = false;
  let executionLogs = '';
  let isLogsLoading = false;

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
  $: statusInfo = statusConfig[currentStatus as keyof typeof statusConfig] || statusConfig.NOT_CONFIGURED;
  $: isTaskRunning = currentStatus === 'RUNNING';
  $: runButtonText = isTaskRunning ? '停止运行' : '立即运行';
  $: runButtonColor = isTaskRunning
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-green-500 hover:bg-green-600';

  /**
   * 加载系统配置和状态，设置定时轮询
   */
  onMount(async () => {
    try {
      appStore.initialize();
      await Promise.all([loadSystemConfig(), loadSystemStatus(), loadExecutionLogs()]);
      setupPolling();
      isLoading = false;
    } catch (error) {
      // 处理初始化错误
      console.error('应用初始化失败:', error);
      appStore.handleError(error, 'app-initialization');
      isLoading = false;
    }
  });

  /**
   * 加载系统配置
   * 从API获取系统配置并更新本地状态
   */
  async function loadSystemConfig() {
    try {
      const response = await SystemAPI.getConfig();
      if (response.status === 'success' && response.data) {
        appStore.setConfig(response.data);
        cronExpression = response.data.cron || response.data.schedule?.cron || '';
        
        // 添加配置加载成功的通知
        appStore.addNotification({
          id: `config-load-${Date.now()}`,
          type: 'SUCCESS',
          title: '配置加载',
          message: response.message || '配置加载成功',
          timestamp: new Date(),
          acknowledged: false,
          source: 'config-load',
        });
      } else {
        // 处理配置加载失败的情况
        appStore.addNotification({
          id: `config-load-error-${Date.now()}`,
          type: 'ERROR',
          title: '配置加载失败',
          message: response.message || response.error || '无法获取系统配置',
          timestamp: new Date(),
          acknowledged: false,
          source: 'config-load',
        });
      }
    } catch (error) {
      appStore.handleError(error, 'load-config');
    }
  }

  /**
   * 加载系统状态
   * 从API获取系统状态并更新本地状态
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
   * 加载执行日志
   * 从API获取最新的执行日志并更新本地状态
   */
  async function loadExecutionLogs() {
    if (isLogsLoading) return;
    
    try {
      isLogsLoading = true;
      const response = await SystemAPI.getLogs(50);
      if (response.status === 'success' && response.data) {
        executionLogs = response.data;
      }
    } catch (error) {
      appStore.handleError(error, 'load-logs');
    } finally {
      isLogsLoading = false;
    }
  }

  /**
   * 设置定时轮询更新
   * 每5秒自动更新系统状态和执行日志
   */
  function setupPolling() {
    setInterval(async () => {
      await Promise.all([loadSystemStatus(), loadExecutionLogs()]);
    }, 5000);
  }

  /**
   * 处理立即运行/停止运行按钮点击
   * 根据当前任务状态执行启动或停止操作
   */
  async function handleRunToggle() {
    if (isRunOnceLoading) return;

    isRunOnceLoading = true;
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
        // 立即运行任务
        const response = await TaskAPI.runOnce();
        if (response.status === 'success') {
          appStore.addNotification({
            id: `task-start-${Date.now()}`,
            type: 'SUCCESS',
            title: '立即运行',
            message: '任务已立即执行',
            timestamp: new Date(),
            acknowledged: false,
            source: 'task-control',
          });
        }
      }
    } catch (error) {
      appStore.handleError(error, isTaskRunning ? 'task-stop' : 'task-start');
    } finally {
      isRunOnceLoading = false;
    }
  }

  /**
   * 保存Cron表达式配置
   * 更新系统配置中的定时任务设置
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

  /**
   * 处理加入黑名单按钮点击
   * 加入黑名单后自动触发一次立即运行
   */
  async function handleAddToBlacklist() {
    if (isBlacklistLoading || isTaskRunning) return;

    isBlacklistLoading = true;
    try {
      // 这里可以添加具体的黑名单逻辑
      // 暂时模拟加入黑名单的操作
      appStore.addNotification({
        id: `blacklist-add-${Date.now()}`,
        type: 'SUCCESS',
        title: '加入黑名单',
        message: '已加入黑名单，正在执行立即运行...',
        timestamp: new Date(),
        acknowledged: false,
        source: 'blacklist-control',
      });

      // 自动触发立即运行
      const response = await TaskAPI.runOnce();
      if (response.status === 'success') {
        appStore.addNotification({
          id: `blacklist-run-${Date.now()}`,
          type: 'SUCCESS',
          title: '自动运行',
          message: '加入黑名单后已自动执行任务',
          timestamp: new Date(),
          acknowledged: false,
          source: 'blacklist-auto-run',
        });
      }
    } catch (error) {
      appStore.handleError(error, 'blacklist-add');
    } finally {
      isBlacklistLoading = false;
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
      <div class="text-center mb-6">
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
        
        <!-- 配置状态显示 -->
        {#if currentConfig}
          <div class="mt-3 text-sm text-gray-600">
            <div class="flex items-center justify-center space-x-2">
              <svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span>配置已加载</span>
            </div>
            {#if currentConfig.preferredAddress}
              <div class="text-xs text-gray-500 mt-1">
                当前地址: {currentConfig.preferredAddress}
              </div>
            {/if}
            {#if currentConfig.channels}
              <div class="text-xs text-gray-500">
                频道数量: {currentConfig.channels}
              </div>
            {/if}
          </div>
        {:else}
          <div class="mt-3 text-sm text-gray-500">
            <div class="flex items-center justify-center space-x-2">
              <svg class="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
              </svg>
              <span>配置加载中...</span>
            </div>
          </div>
        {/if}
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

      <!-- 操作按钮区域 -->
      <div class="space-y-3">
        <!-- 立即运行/停止运行按钮 -->
        <button
          on:click={handleRunToggle}
          disabled={isRunOnceLoading}
          class="w-full py-3 px-6 {runButtonColor} text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {#if isRunOnceLoading}
            <div
              class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"
            ></div>
            <span>处理中...</span>
          {:else}
            {#if isTaskRunning}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            {:else}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z"></path>
              </svg>
            {/if}
            <span>{runButtonText}</span>
          {/if}
        </button>
      </div>

      <!-- 执行结果显示区域 - 仅在有执行结果时显示 -->
      {#if executionLogs && executionLogs.trim()}
        <div class="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-gray-700 flex items-center space-x-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>执行结果</span>
            </h3>
            {#if isLogsLoading}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
            {/if}
          </div>
          
          <div class="bg-white rounded border border-gray-200 p-3 max-h-48 overflow-y-auto">
            <pre class="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{executionLogs}</pre>
          </div>

          <!-- 加入黑名单按钮 - 紧邻执行结果区域 -->
          <div class="mt-3">
            <button
              on:click={handleAddToBlacklist}
              disabled={isBlacklistLoading || isTaskRunning}
              class="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-sm"
              title={isTaskRunning ? '任务运行中，请等待完成后再试' : '加入黑名单并自动运行'}
            >
              {#if isBlacklistLoading}
                <div
                  class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"
                ></div>
                <span>处理中...</span>
              {:else}
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18 12M6 6l12 12"></path>
                </svg>
                <span>加入黑名单</span>
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 通知提示 -->
  <NotificationToast />
</div>

<style>
  /* 全局样式 */
</style>
