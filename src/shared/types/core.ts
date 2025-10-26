/**
 * 核心类型定义 (向后兼容的包装器)
 * 使用新的统一类型系统
 */

// 重新导出所有类型以保持向后兼容性
export type {
  // API相关
  ApiResponse,
  PaginationInfo,
  // 频道相关
  ChannelInfo,
  IPInfo,
  ChannelValidationResult,
  // 系统相关
  SystemConfig,
  SystemStatus,
  SystemStats,
  SystemData,
  SystemAlert,
  // 爬取相关
  ScrapingResult,
  ScrapingTask,
  ScrapingProgress,
  // 日志相关
  LogEntry,
  // 调度相关
  TaskInfo,
  // 配置相关
  RequestOptions
} from './index';

// 导入具体类型用于类型别名
import type { SystemStatus, SystemStats, TaskInfo, LogEntry } from './index';

// 保持向后兼容的类型别名
export type AppStatus = SystemStatus | string;

// 数据源配置
export interface DataSource {
  url: string;
  name: string;
  enabled: boolean;
}

// 爬取状态类型
export { ScrapingStatus } from './scraper';

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

// 配置验证结果类型（本地定义，避免冲突）
export interface ConfigValidationResult {
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

// 性能指标类型
export interface PerformanceMetrics {
  responseTime: number;
  throughput: number;
  errorRate: number;
  timestamp: Date;
}
