/**
 * 频道可用性监测系统类型定义
 */

import type { ChannelInfo } from '../../shared/types/scraper.js';

/**
 * 频道检查配置接口
 */
export interface ChannelCheckConfig {
  name: string;
  cronExpression: string;
  checkType: 'SAMPLE_CHECK' | 'FULL_CHECK' | 'PRIORITY_CHECK';
  sampleSize?: number; // 抽样检查的频道数量
  timeout?: number; // 单个频道检查超时时间
  retryCount?: number;
  checkMethod: 'HEAD_REQUEST' | 'STREAM_TEST' | 'CONTENT_DOWNLOAD';
  priorityChannels?: string[]; // 优先检查的频道名称
  notificationConfig?: NotificationConfig;
}

/**
 * 通知配置接口
 */
export interface NotificationConfig {
  enabled: boolean;
  onLowAvailability?: boolean; // 可用性低于阈值时通知
  onChannelFailure?: boolean; // 重要频道失效时通知
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
 * 爬取决策接口
 */
export interface ScrapingDecision {
  shouldScrape: boolean;
  reason:
    | 'AVAILABILITY_LOW'
    | 'NO_RECENT_DATA'
    | 'MANUAL_TRIGGER'
    | 'AVAILABILITY_OK';
  availabilityRate?: number;
  lastCheckTime?: Date;
}

/**
 * 频道可用性监控接口
 */
export interface ChannelAvailabilityMonitor {
  scheduleCheck(config: ChannelCheckConfig): string;
  cancelCheck(checkId: string): boolean;
  getCheckStatus(checkId: string): CheckStatus;
  getAllChecks(): ChannelCheck[];
  validateChannelUrls(
    channels: ChannelInfo[]
  ): Promise<ChannelValidationResult[]>;
  checkSingleChannel(channel: ChannelInfo): Promise<ChannelValidationResult>;
  checkAvailabilityAndScrapeIfNeeded(): Promise<ScrapingDecision>;
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
    byGroup: Record<
      string,
      {
        total: number;
        available: number;
        rate: number;
      }
    >;
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