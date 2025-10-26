/**
 * 日志系统类型定义
 * 重新导出统一的日志类型
 */

export {
  LogLevel,
  type LogEntry,
  type ScrapingLogEntry,
  type ScrapingMetrics,
  type LogFilter,
  type LogStats
} from '../../shared/types/logging';

import type { LogLevel } from '../../shared/types/logging';

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  maxFileSize: number;
  maxFiles: number;
  enableJsonFormat: boolean;
  enableCompression: boolean;
}