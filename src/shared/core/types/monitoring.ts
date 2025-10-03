/**
 * 监控相关类型定义
 */

import type { ChannelInfo, ChannelValidationResult } from './channel.js';

export interface ChannelCheckConfig {
  name: string;
  cronExpression: string;
  checkType: 'SAMPLE_CHECK' | 'FULL_CHECK' | 'PRIORITY_CHECK';
  sampleSize?: number;
  timeout?: number;
  retryCount?: number;
  checkMethod: 'HEAD_REQUEST' | 'STREAM_TEST' | 'CONTENT_DOWNLOAD';
  priorityChannels?: string[];
  notificationConfig?: {
    enabled: boolean;
    onLowAvailability?: boolean;
    onChannelFailure?: boolean;
    webhookUrl?: string;
    emailConfig?: {
      smtp: string;
      from: string;
      to: string[];
    };
  };
}

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

export interface ChannelCheck {
  id: string;
  config: ChannelCheckConfig;
  status: CheckStatus;
  createdAt: Date;
  updatedAt: Date;
}

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