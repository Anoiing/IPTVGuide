/**
 * 爬虫相关类型定义
/**
 * 爬取相关类型定义
 */

import type { ChannelInfo, IPInfo } from './channel';

// 重新导出 ChannelInfo 和 IPInfo 类型
export type { ChannelInfo, IPInfo };

/**
 * 爬取状态枚举
 */
export enum ScrapingStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

/**
 * 任务错误接口
 */
export interface TaskError {
  type: string;
  message: string;
  context?: any;
  timestamp?: Date;
}

/**
 * 爬取结果接口
 * 统一的爬取结果类型，兼容不同的使用场景
 */
export interface ScrapingResult {
  success: boolean;
  // 频道数据 - 支持两种格式
  channels?: ChannelInfo[];
  channelsByIP?: Record<string, ChannelInfo[]>;
  // 统计信息
  totalChannels: number;
  validChannels?: number;
  duplicateChannels?: number;
  // IP处理信息
  processedIPs: string[];
  totalIPs?: number;
  // 时间信息
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  timestamp: Date;
  // 错误和警告
  errors: TaskError[];
  warnings?: string[];
  // 其他信息
  skipReason?: string;
  ipResults?: IPInfo[];
  metadata?: {
    sourceCount: number;
    uniqueChannels: number;
    duplicateChannels: number;
  };
}

/**
 * 爬取配置接口
 */
export interface ScrapingConfig {
  maxConcurrency: number;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  enableValidation: boolean;
  outputFormat: 'txt' | 'm3u' | 'json';
  outputPath: string;
}

/**
 * 爬取进度接口
 */
export interface ScrapingProgress {
  current: number;
  total: number;
  percentage: number;
  phase: string;
  currentIP?: string;
  channelsFound?: number;
}

/**
 * 爬取任务接口
 */
export interface ScrapingTask {
  id: string;
  name: string;
  status: ScrapingStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  result?: ScrapingResult;
  error?: TaskError;
  errors: TaskError[];
  config: ScrapingConfig;
  progress: ScrapingProgress;
  scrapingResult?: ScrapingResult;
}

/**
 * 爬虫引擎选项接口
 */
export interface ScraperEngineOptions {
  configDir: string;
  maxConcurrency: number;
  timeout: number;
  retryAttempts: number;
  enableLogging: boolean;
  enableMetrics: boolean;
}

/**
 * 频道发现结果接口
 */
export interface ChannelDiscoveryResult {
  ip: string;
  channels: ChannelInfo[];
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * IP发现结果接口
 */
export interface IPDiscoveryResult {
  ips: string[];
  source: string;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * 爬取统计接口
 */
export interface ScrapingStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsPerSecond: number;
  totalChannelsFound: number;
  uniqueChannelsFound: number;
  duplicateChannelsFound: number;
}

/**
 * 爬取错误接口
 */
export interface ScrapingError {
  type: 'NETWORK' | 'TIMEOUT' | 'PARSING' | 'VALIDATION' | 'UNKNOWN';
  message: string;
  url?: string;
  ip?: string;
  timestamp: Date;
  context?: any;
}
