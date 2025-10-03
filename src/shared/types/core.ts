/**
 * 核心类型定义
 * 统一管理所有核心类型，避免重复定义
 */

// 基础响应类型
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message: string;
  data: T | null;
  error: any;
  timestamp?: Date;
}

// 系统状态类型
export type SystemStatus =
  | 'NOT_CONFIGURED'
  | 'WAIT_EXECUTION'
  | 'RUNNING'
  | 'ERROR'
  | 'IDLE'
  | 'STOPPING';

// 应用状态类型（保持向后兼容）
export type AppStatus = SystemStatus | string;

// 数据源配置
export interface DataSource {
  url: string;
  name: string;
  enabled: boolean;
}

// 系统配置类型
export interface SystemConfig {
  sources: DataSource[];
  schedule: {
    enabled: boolean;
    cron: string;
  };
  output: {
    format: string;
    filename: string;
  };
  filters: {
    duplicates: boolean;
    invalid: boolean;
    minChannels: number;
  };
  // 保持向后兼容的字段
  area?: string;
  preferredAddress?: string;
  channels?: number;
  blackList?: string[];
  dedup?: boolean;
  requestDelay?: [number, number];
  maxRetries?: number;
  enableLogging?: boolean;
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  outputFormats?: ('m3u' | 'json' | 'txt')[];
  customHeaders?: Record<string, string>;
  timeout?: number;
}

// 频道信息类型
export interface ChannelInfo {
  name: string;
  url: string;
  group?: string;
  logo?: string;
  epg?: string;
  quality?: 'SD' | 'HD' | '4K';
  language?: string;
  country?: string;
}

// 分页信息类型
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  totalItems?: number;
}

// 爬取结果类型
export interface ScrapingResult {
  success: boolean;
  channels: Record<string, ChannelInfo[]>;
  totalChannels: number;
  processedIPs: number;
  failedIPs: string[];
  duration: number;
  timestamp: Date;
  errors?: string[];
  warnings?: string[];
}

// 爬取状态类型
export type ScrapingStatus = 'IDLE' | 'RUNNING' | 'STOPPING' | 'ERROR';

// 请求选项类型
export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  delay?: number;
  userAgent?: string;
}

// 日志条目类型
export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  category?: string;
  context?: Record<string, any>;
}

// 系统统计类型
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

// 任务信息类型
export interface TaskInfo {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  result?: any;
  error?: string;
}

// 监控数据类型
export interface MonitoringData {
  timestamp: Date;
  systemStats: SystemStats;
  activeTasks: TaskInfo[];
  recentLogs: LogEntry[];
  alerts: Alert[];
}

// 警报类型
export interface Alert {
  id: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  source: string;
}

// 配置验证结果类型
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// 文件信息类型
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  mtime: Date;
  type: 'file' | 'directory';
}

// 备份信息类型
export interface BackupInfo {
  id: string;
  name: string;
  timestamp: Date;
  size: number;
  description?: string;
}

// 用户偏好设置类型
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: 'zh-CN' | 'en-US';
  autoRefresh: boolean;
  refreshInterval: number;
  notifications: boolean;
  compactMode: boolean;
}

// 组件状态类型
export interface ComponentState {
  loading: boolean;
  error: string | null;
  data: any;
  lastUpdated?: Date;
}

// 表单状态类型
export interface FormState<T = any> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  isValid: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
}

// 路由信息类型
export interface RouteInfo {
  path: string;
  name: string;
  title: string;
  icon?: string;
  badge?: string | number;
  hidden?: boolean;
  children?: RouteInfo[];
}

// 主题配置类型
export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  shadowColor: string;
  borderRadius: string;
  fontSize: {
    small: string;
    medium: string;
    large: string;
  };
  spacing: {
    small: string;
    medium: string;
    large: string;
  };
}

// 性能指标类型
export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;

  timestamp: Date;
}

// 缓存配置类型
export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in seconds
  maxSize: number;
  strategy: 'LRU' | 'FIFO' | 'LFU';
}

// WebSocket消息类型
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
  id?: string;
}

// 导出所有类型的联合类型，便于类型检查
export type AllTypes =
  | ApiResponse
  | SystemStatus
  | SystemConfig
  | ChannelInfo
  | PaginationInfo
  | ScrapingResult
  | ScrapingStatus
  | RequestOptions
  | LogEntry
  | SystemStats
  | TaskInfo
  | MonitoringData
  | Alert
  | ValidationResult
  | FileInfo
  | BackupInfo
  | UserPreferences
  | ComponentState
  | FormState
  | RouteInfo
  | ThemeConfig
  | PerformanceMetrics
  | CacheConfig
  | WebSocketMessage;
