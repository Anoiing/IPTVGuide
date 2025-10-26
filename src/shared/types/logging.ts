/**
 * 日志相关类型定义
 * 统一管理所有日志类型，避免重复定义
 */

import type { ErrorType } from '../core/error/types';

/**
 * 日志级别常量
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

/**
 * 日志条目接口
 */
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: any;
  category?: string;
  taskId?: string;
  phase?: string;
  ipAddress?: string;
  channelCount?: number;
  progress?: any;
  errorType?: ErrorType;
  stackTrace?: string;
}

/**
 * 爬取日志条目接口
 */
export interface ScrapingLogEntry extends LogEntry {
  phase: 'INIT' | 'IP_DISCOVERY' | 'CHANNEL_SCRAPING' | 'VALIDATION' | 'COMPLETION';
  ipAddress?: string;
  channelCount?: number;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
}

/**
 * 爬取指标接口
 */
export interface ScrapingMetrics {
  totalIPs: number;
  processedIPs: number;
  successfulIPs: number;
  failedIPs: number;
  totalChannels: number;
  validChannels: number;
  duplicateChannels: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageRequestTime: number;
  requestsPerSecond: number;
  errors: any[];
}

/**
 * 日志过滤器接口
 */
export interface LogFilter {
  level?: LogLevel;
  category?: string;
  taskId?: string;
  startDate?: Date;
  endDate?: Date;
  searchTerm?: string;
}

/**
 * 日志统计接口
 */
export interface LogStats {
  totalEntries: number;
  byLevel: Record<LogLevel, number>;
  byCategory: Record<string, number>;
  errorsByType: Record<ErrorType, number>;
  startDate: Date;
  endDate: Date;
}