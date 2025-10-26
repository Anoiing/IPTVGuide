/**
 * 监控相关类型定义
 * 统一管理所有监控类型，避免重复定义
 */

import type { ChannelInfo } from './channel';

/**
 * 频道检查配置接口
 */
export interface ChannelCheckConfig {
  name: string;
  cronExpression: string;
  checkType: 'SAMPLE_CHECK' | 'FULL_CHECK' | 'PRIORITY_CHECK';
  sampleSize?: number;
  timeout?: number;
  retryCount?: number;
  checkMethod: 'HEAD_REQUEST' | 'STREAM_TEST' | 'CONTENT_DOWNLOAD';
  priorityChannels?: string[];
  notificationConfig?: NotificationConfig;
}

/**
 * 通知配置接口
 */
export interface NotificationConfig {
  enabled: boolean;
  onLowAvailability?: boolean;
  onChannelFailure?: boolean;
  webhookUrl?: string;
  emailConfig?: {
    smtp: string;
    from: string;
    to: string[];
  };
}

/**
 * 检查状态接口
 */
export interface CheckStatus {
  checkId: string;
  lastRunTime?: Date;
  nextRunTime?: Date;
  status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress?: {
    total: number;
    checked: number;
    currentChannel?: string;
  };
  results?: ChannelCheckResult;
}

/**
 * 频道检查结果接口
 */
export interface ChannelCheckResult {
  totalChecked: number;
  availableCount: number;
  unavailableCount: number;
  availabilityRate: number;
  workingChannels: ChannelValidationResult[];
  failedChannels: ChannelValidationResult[];
  checkDuration: number;
  timestamp: Date;
  summary: {
    byGroup: Record<string, { total: number; available: number; rate: number }>;
    topFailureReasons: { reason: string; count: number }[];
  };
}

/**
 * 频道验证结果接口
 */
export interface ChannelValidationResult {
  channel: ChannelInfo;
  isAvailable: boolean;
  responseTime?: number;
  errorMessage?: string;
  httpStatus?: number;
  streamInfo?: {
    contentType?: string;
    contentLength?: number;
    isStreamable?: boolean;
  };
  checkedAt: Date;
}

/**
 * 频道检查接口
 */
export interface ChannelCheck {
  id: string;
  config: ChannelCheckConfig;
  status: CheckStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 系统统计接口
 */
export interface SystemStats {
  uptime: number;
  channels: {
    total: number;
    available: number;
  };
  lastUpdate: Date;
  scrapingStats?: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
    lastRunTime?: Date;
  };
}

/**
 * 系统数据接口
 */
export interface SystemData {
  scrapingMetrics: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageDuration: number;
    lastRunTime?: Date;
    channelsFound: number;
    ipsProcessed: number;
  };

  channelAvailabilityMetrics: {
    totalChannelsChecked: number;
    lastCheckTime?: Date;
    currentAvailabilityRate: number;
    averageAvailabilityRate: number;
    workingChannels: number;
    failedChannels: number;
    checkDuration: number;
    byGroup: Record<string, {
      total: number;
      available: number;
      rate: number;
    }>;
    topFailureReasons: {
      reason: string;
      count: number;
    }[];
    trendsData: {
      timestamp: Date;
      availabilityRate: number;
      totalChecked: number;
    }[];
  };
}

/**
 * 任务进度接口
 */
export interface TaskProgress {
  taskId: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  currentStep?: string;
  totalSteps?: number;
  completedSteps?: number;
  estimatedTimeRemaining?: number;
  metadata?: Record<string, any>;
}

/**
 * 性能指标接口
 */
export interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIO: {
    bytesIn: number;
    bytesOut: number;
  };
  responseTime: number;
  throughput: number;
  errorRate: number;
}

/**
 * 错误报告接口
 */
export interface ErrorReport {
  id: string;
  timestamp: Date;
  type: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * 系统警报接口
 */
export interface SystemAlert {
  id: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  source: string;
  metadata?: Record<string, any>;
}

/**
 * 监控数据接口
 */
export interface MonitoringData {
  timestamp: Date;
  systemStats: SystemStats;
  activeTasks: TaskProgress[];
  recentLogs: any[];
  alerts: SystemAlert[];
  performanceMetrics?: PerformanceMetrics;
}