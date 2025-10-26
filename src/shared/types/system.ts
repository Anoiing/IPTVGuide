/**
 * 系统相关类型定义
 * 统一管理所有系统类型，避免重复定义
 */

import type { LogEntry } from './logging';
import type { TaskInfo } from './scheduler';

/**
 * 系统状态类型
 */
export type SystemStatus = 'NOT_CONFIGURED' | 'WAIT_EXECUTION' | 'RUNNING' | 'ERROR' | 'IDLE' | 'STOPPING';

/**
 * 系统状态详情接口
 */
export interface SystemStatusInfo {
  isRunning: boolean;
  uptime: number;
  version: string;
  environment: 'development' | 'production' | 'test';
  lastUpdate?: Date;
  health: 'healthy' | 'warning' | 'error';
  services: ServiceStatus[];
}

/**
 * 服务状态接口
 */
export interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error';
  uptime?: number;
  lastCheck: Date;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * 系统统计接口
 */
export interface SystemStats {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  processes: {
    total: number;
    running: number;
    sleeping: number;
  };
}

/**
 * 系统数据接口
 */
export interface SystemData {
  status: SystemStatus;
  statusInfo?: SystemStatusInfo;
  stats: SystemStats;
  logs: LogEntry[];
  tasks: TaskInfo[];
  alerts: SystemAlert[];
  timestamp: Date;
}

/**
 * 系统警报接口
 */
export interface SystemAlert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  source: string;
  metadata?: Record<string, any>;
}

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  availability: number;
  timestamp: Date;
  endpoint?: string;
  method?: string;
}

/**
 * 错误报告接口
 */
export interface ErrorReport {
  id: string;
  type: 'system' | 'application' | 'network' | 'database';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  stackTrace?: string;
  context?: Record<string, any>;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

/**
 * 系统状态枚举
 */
export enum SystemState {
  INITIALIZING = 'INITIALIZING',
  RUNNING = 'RUNNING',
  STOPPING = 'STOPPING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR',
  MAINTENANCE = 'MAINTENANCE'
}

/**
 * 用户偏好设置接口
 */
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
    desktop: boolean;
  };
  dashboard: {
    refreshInterval: number;
    defaultView: string;
    widgets: string[];
  };
}

/**
 * 应用配置接口
 */
export interface AppConfig {
  name: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  debug: boolean;
  port: number;
  host: string;
  database: {
    url: string;
    maxConnections: number;
    timeout: number;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  logging: {
    level: string;
    format: string;
    destination: string;
  };
}