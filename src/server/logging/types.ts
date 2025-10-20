/**
 * 增强日志系统接口定义
 */

import type { ErrorType } from '../../shared/core/error/types.ts';

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
 * 日志配置接口
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  maxFileSize: number; // in bytes
  maxFiles: number;
  enableJsonFormat: boolean; // 是否启用JSON格式日志
  enableCompression: boolean; // 是否启用日志压缩
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