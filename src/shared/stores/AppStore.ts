/**
 * 统一状态管理系统
 * 整合所有状态管理，减少Store数量，提高性能
 */

import { writable, derived, type Writable, type Readable } from 'svelte/store';
import type {
  SystemConfig,
  SystemStatus,
  SystemStats,
  TaskInfo,
  Alert,
  UserPreferences,
  ComponentState,
} from '../types/core.js';
import { errorHandler } from '../core/error/LightweightErrorHandler.js';

// 系统状态接口
interface SystemState {
  config: SystemConfig;
  status: SystemStatus;
  activeTasks: TaskInfo[];
  lastUpdated: Date | null;
}

// UI状态接口
interface UIState {
  loading: boolean;
  error: string | null;
  notifications: Alert[];
  preferences: UserPreferences;
  sidebarOpen: boolean;
}

// 监控状态接口
interface MonitoringState {
  alerts: Alert[];
  isPolling: boolean;
  pollInterval: number;
}

// 应用状态接口
interface AppState {
  system: SystemState;
  ui: UIState;
  monitoring: MonitoringState;
  initialized: boolean;
}

// 默认状态
const defaultSystemConfig: SystemConfig = {
  sources: [],
  schedule: {
    enabled: false,
    cron: '0 6 * * *',
  },
  output: {
    format: 'm3u',
    filename: 'iptv_channels',
  },
  filters: {
    duplicates: true,
    invalid: true,
    minChannels: 10,
  },
  // 保持向后兼容的字段
  area: '浙江',
  preferredAddress: '',
  channels: 0,
  blackList: [],
  dedup: true,
  requestDelay: [1, 3],
  maxRetries: 3,
  enableLogging: true,
  logLevel: 'INFO',
  outputFormats: ['m3u', 'json', 'txt'],
  timeout: 30000,
};

const defaultUserPreferences: UserPreferences = {
  theme: 'auto',
  language: 'zh-CN',
  autoRefresh: true,
  refreshInterval: 30000,
  notifications: true,
  compactMode: false,
};

const defaultAppState: AppState = {
  system: {
    config: defaultSystemConfig,
    status: 'NOT_CONFIGURED',
    activeTasks: [],
    lastUpdated: null,
  },
  ui: {
    loading: false,
    error: null,
    notifications: [],
    preferences: defaultUserPreferences,
    sidebarOpen: true,
  },
  monitoring: {
    alerts: [],
    isPolling: false,
    pollInterval: 30000,
  },
  initialized: false,
};

// 创建主状态Store
const createAppStore = () => {
  const { subscribe, set, update } = writable<AppState>(defaultAppState);

  return {
    subscribe,

    // 系统配置相关方法
    setConfig: (config: Partial<SystemConfig>) => {
      update((state) => ({
        ...state,
        system: {
          ...state.system,
          config: { ...state.system.config, ...config },
          lastUpdated: new Date(),
        },
      }));
    },

    setStatus: (status: SystemStatus) => {
      update((state) => ({
        ...state,
        system: {
          ...state.system,
          status,
          lastUpdated: new Date(),
        },
      }));
    },

    setActiveTasks: (tasks: TaskInfo[]) => {
      update((state) => ({
        ...state,
        system: {
          ...state.system,
          activeTasks: tasks,
          lastUpdated: new Date(),
        },
      }));
    },

    // UI状态相关方法
    setLoading: (loading: boolean) => {
      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          loading,
        },
      }));
    },

    setError: (error: string | null) => {
      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          error,
        },
      }));
    },

    addNotification: (notification: Alert) => {
      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          notifications: [...state.ui.notifications, notification],
        },
      }));
    },

    removeNotification: (id: string) => {
      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          notifications: state.ui.notifications.filter((n) => n.id !== id),
        },
      }));
    },

    clearNotifications: () => {
      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          notifications: [],
        },
      }));
    },

    setPreferences: (preferences: Partial<UserPreferences>) => {
      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          preferences: { ...state.ui.preferences, ...preferences },
        },
      }));
    },

    toggleSidebar: () => {
      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          sidebarOpen: !state.ui.sidebarOpen,
        },
      }));
    },

    // 监控相关方法

    setAlerts: (alerts: Alert[]) => {
      update((state) => ({
        ...state,
        monitoring: {
          ...state.monitoring,
          alerts,
        },
      }));
    },

    addAlert: (alert: Alert) => {
      update((state) => ({
        ...state,
        monitoring: {
          ...state.monitoring,
          alerts: [...state.monitoring.alerts, alert],
        },
      }));
    },

    removeAlert: (id: string) => {
      update((state) => ({
        ...state,
        monitoring: {
          ...state.monitoring,
          alerts: state.monitoring.alerts.filter((a) => a.id !== id),
        },
      }));
    },

    acknowledgeAlert: (id: string) => {
      update((state) => ({
        ...state,
        monitoring: {
          ...state.monitoring,
          alerts: state.monitoring.alerts.map((a) =>
            a.id === id ? { ...a, acknowledged: true } : a
          ),
        },
      }));
    },

    setPolling: (isPolling: boolean) => {
      update((state) => ({
        ...state,
        monitoring: {
          ...state.monitoring,
          isPolling,
        },
      }));
    },

    setPollInterval: (interval: number) => {
      update((state) => ({
        ...state,
        monitoring: {
          ...state.monitoring,
          pollInterval: interval,
        },
      }));
    },

    // 初始化方法
    initialize: () => {
      update((state) => ({
        ...state,
        initialized: true,
      }));
    },

    // 重置方法
    reset: () => {
      set(defaultAppState);
    },

    // 错误处理方法
    handleError: (error: any, context?: string) => {
      const appError = errorHandler.handle(error, { context });

      update((state) => ({
        ...state,
        ui: {
          ...state.ui,
          error: appError.message,
        },
        monitoring: {
          ...state.monitoring,
          alerts: [
            ...state.monitoring.alerts,
            {
              id: appError.id,
              type:
                appError.severity === 'CRITICAL'
                  ? 'CRITICAL'
                  : appError.severity === 'HIGH'
                  ? 'ERROR'
                  : appError.severity === 'MEDIUM'
                  ? 'WARNING'
                  : 'INFO',
              title: `${appError.type} 错误`,
              message: appError.message,
              timestamp: appError.timestamp,
              acknowledged: false,
              source: context || 'system',
            },
          ],
        },
      }));

      return appError;
    },
  };
};

// 创建全局Store实例
export const appStore = createAppStore();

// 导出派生状态
export const systemConfig: Readable<SystemConfig> = derived(
  appStore,
  ($appStore) => $appStore.system.config
);

export const systemStatus: Readable<SystemStatus> = derived(
  appStore,
  ($appStore) => $appStore.system.status
);

export const activeTasks: Readable<TaskInfo[]> = derived(
  appStore,
  ($appStore) => $appStore.system.activeTasks
);

export const uiLoading: Readable<boolean> = derived(
  appStore,
  ($appStore) => $appStore.ui.loading
);

export const uiError: Readable<string | null> = derived(
  appStore,
  ($appStore) => $appStore.ui.error
);

export const notifications: Readable<Alert[]> = derived(
  appStore,
  ($appStore) => $appStore.ui.notifications
);

export const userPreferences: Readable<UserPreferences> = derived(
  appStore,
  ($appStore) => $appStore.ui.preferences
);

export const sidebarOpen: Readable<boolean> = derived(
  appStore,
  ($appStore) => $appStore.ui.sidebarOpen
);

export const alerts: Readable<Alert[]> = derived(
  appStore,
  ($appStore) => $appStore.monitoring.alerts
);

export const isPolling: Readable<boolean> = derived(
  appStore,
  ($appStore) => $appStore.monitoring.isPolling
);

export const pollInterval: Readable<number> = derived(
  appStore,
  ($appStore) => $appStore.monitoring.pollInterval
);

// 兼容性导出
let configValue: SystemConfig = defaultSystemConfig;
let statusValue: SystemStatus = 'NOT_CONFIGURED';

const configUnsubscribe = systemConfig.subscribe((value) => {
  configValue = value;
});
const statusUnsubscribe = systemStatus.subscribe((value) => {
  statusValue = value;
});

export const _config: Writable<SystemConfig> = {
  subscribe: systemConfig.subscribe,
  set: (value: SystemConfig) => appStore.setConfig(value),
  update: (updater: (value: SystemConfig) => SystemConfig) => {
    appStore.setConfig(updater(configValue));
  },
};

export const _status: Writable<SystemStatus> = {
  subscribe: systemStatus.subscribe,
  set: (value: SystemStatus) => appStore.setStatus(value),
  update: (updater: (value: SystemStatus) => SystemStatus) => {
    appStore.setStatus(updater(statusValue));
  },
};

export type { AppState, SystemState, UIState, MonitoringState };