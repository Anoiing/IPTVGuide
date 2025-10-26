/**
 * 统一类型系统入口文件
 * 导出所有类型定义，提供统一的导入接口
 */

// API相关类型
export type {
  ApiResponse,
  HttpRequestOptions,
  HttpResponse,
  CacheEntry,
  RequestConfig,
  PaginationInfo,
  PaginatedResponse,
  ValidationResult,
  FileInfo,
  BackupInfo,
  WebSocketMessage
} from './api';

// 频道相关类型
export type {
  ChannelInfo,
  ChannelsByIP,
  IPInfo,
  ChannelValidationResult
} from './channel';

// 配置相关类型
export type {
  DataSource,
  SystemConfig,
  RequestOptions,
  HttpClientConfig,
  LoggerConfig,
  MonitoringConfig,
  CronConfig,
  CronValidationResult,
  ServiceContainerConfig,
  ConfigManagerOptions
} from './config';

// 日志相关类型
export type {
  LogEntry,
  ScrapingLogEntry,
  ScrapingMetrics,
  LogFilter,
  LogStats
} from './logging';

// 监控相关类型
export type {
  ChannelCheckConfig,
  NotificationConfig,
  CheckStatus,
  ChannelCheckResult,
  ChannelCheck,
  TaskProgress,
  MonitoringData
} from './monitoring';

// 调度器相关类型
export type {
  CronSchedulerOptions,
  SchedulerStatus,
  TaskInfo,
  ScrapingDecision,
  ScheduledTask
} from './scheduler';

// 爬虫相关类型
export type {
  ScrapingResult,
  ScrapingConfig,
  ScrapingProgress,
  ScrapingTask,
  ScraperEngineOptions,
  ChannelDiscoveryResult,
  IPDiscoveryResult,
  ScrapingStats,
  ScrapingError
} from './scraper';

// 系统相关类型
export type {
  SystemStatus,
  ServiceStatus,
  UserPreferences,
  AppConfig
} from './system';

// 重新导出系统相关类型，避免重复
export type {
  SystemStats,
  SystemData,
  SystemAlert,
  PerformanceMetrics,
  ErrorReport
} from './system';

// 导出枚举
export { ScrapingStatus } from './scraper';
export { SystemState } from './system';
export { LogLevel } from './logging';