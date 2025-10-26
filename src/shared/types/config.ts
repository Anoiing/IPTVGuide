/**
 * 配置相关类型定义
 * 统一管理所有配置类型，避免重复定义
 */

/**
 * 数据源配置接口
 */
export interface DataSource {
  url: string;
  name: string;
  enabled: boolean;
}

/**
 * 系统配置接口
 * 统一的系统配置类型，整合所有配置选项
 */
export interface SystemConfig {
  // 数据源配置
  sources: DataSource[];
  
  // 调度配置
  schedule: {
    enabled: boolean;
    cron: string;
  };
  
  // 输出配置
  output: {
    format: string;
    filename: string;
  };
  
  // 过滤配置
  filters: {
    duplicates: boolean;
    invalid: boolean;
    minChannels: number;
  };
  
  // 网络配置
  network?: {
    timeout?: number;
    maxRetries?: number;
    requestDelay?: [number, number];
    customHeaders?: Record<string, string>;
    userAgent?: string;
  };
  
  // 日志配置
  logging?: {
    enableLogging?: boolean;
    logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    maxFileSize?: number;
    maxFiles?: number;
    enableJsonFormat?: boolean;
    enableCompression?: boolean;
  };
  
  // 监控配置
  monitoring?: {
    availabilityThreshold?: number;
    maxDaysSinceLastScrape?: number;
    enableNotifications?: boolean;
  };
  
  // 保持向后兼容的字段
  area?: string;
  preferredAddress?: string;
  channels?: number;
  blackList?: string[];
  dedup?: boolean;
  outputFormats?: ('m3u' | 'json' | 'txt')[];
}

/**
 * 请求选项接口
 */
export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  delay?: number;
  userAgent?: string;
}

/**
 * HTTP客户端配置接口
 */
export interface HttpClientConfig {
  baseURL?: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  rateLimit: {
    requestsPerSecond: number;
    burstSize: number;
  };
  cache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  headers: Record<string, string>;
  userAgent: string;
  followRedirects: boolean;
  maxRedirects: number;
  validateStatus: (status: number) => boolean;
}

/**
 * 日志配置接口
 */
export interface LoggerConfig {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  enableConsole: boolean;
  enableFile: boolean;
  maxFileSize: number;
  maxFiles: number;
  enableJsonFormat: boolean;
  enableCompression: boolean;
}

/**
 * 监控配置接口
 */
export interface MonitoringConfig {
  enabled: boolean;
  checkInterval: number;
  alertThresholds: {
    errorRate: number;
    responseTime: number;
    availability: number;
  };
  notifications: {
    email?: {
      enabled: boolean;
      smtp: string;
      from: string;
      to: string[];
    };
    webhook?: {
      enabled: boolean;
      url: string;
      headers?: Record<string, string>;
    };
  };
}

/**
 * Cron配置接口
 */
export interface CronConfig {
  enabled: boolean;
  expression: string;
  timezone?: string;
  description?: string;
}

/**
 * Cron验证结果接口
 */
export interface CronValidationResult {
  isValid: boolean;
  error?: string;
  nextRuns?: Date[];
}

/**
 * 服务容器配置接口
 */
export interface ServiceContainerConfig {
  configDir: string;
  dataDir: string;
  enableMonitoring: boolean;
  enableScheduler: boolean;
}

/**
 * 配置管理器选项接口
 */
export interface ConfigManagerOptions {
  configDir: string;
  configFile?: string;
  enableBackup?: boolean;
  backupDir?: string;
  maxBackups?: number;
  enableWatch?: boolean;
}

/**
 * 配置验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}