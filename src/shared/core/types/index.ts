/**
 * 核心数据类型定义
 * 提供更严格的类型安全和更好的代码组织
 */

// 频道信息接口
export interface ChannelInfo {
  name: string;
  url: string;
  group?: string;
  logo?: string;
  epg?: string;
  quality?: 'SD' | 'HD' | 'FHD' | '4K';
  language?: string;
  country?: string;
  bitrate?: number;
  codec?: string;
}

// IP信息接口
export interface IPInfo {
  address: string;
  port?: number;
  status: 'active' | 'inactive' | 'blacklisted';
  channelCount: number;
  lastChecked: Date;
  responseTime?: number;
  latency?: number;
}

// 分页信息接口
export interface PaginationInfo {
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  totalItems?: number;
  itemsPerPage: number;
}

// 爬取结果接口
export interface ScrapingResult {
  success: boolean;
  channelsByIP: Record<string, ChannelInfo[]>;
  totalChannels: number;
  processedIPs: string[];
  errors: string[];
  warnings?: string[];
  skipReason?: string;
  duration?: number;
  timestamp: Date;
  metadata?: {
    sourceCount: number;
    uniqueChannels: number;
    duplicateChannels: number;
  };
}

// 爬取状态枚举
export type ScrapingStatus = 'IDLE' | 'RUNNING' | 'STOPPING' | 'ERROR';

// 任务错误接口
export interface TaskError {
  timestamp: Date;
  type: 'HTTP_ERROR' | 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'SCRAPING_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'CONFIG_ERROR';
  message: string;
  context?: any;
  stack?: string;
}

// 爬取任务接口
export interface ScrapingTask {
  id: string;
  status: ScrapingStatus;
  startTime: Date;
  endTime?: Date;
  progress: {
    currentStep: string;
    processedIPs: number;
    totalIPs: number;
    foundChannels: number;
    currentIP?: string;
    estimatedTimeRemaining?: number;
  };
  errors: TaskError[];
  warnings?: string[];
}

// 请求选项接口
export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  userAgent?: string;
  followRedirects?: boolean;
  maxRedirects?: number;
  proxy?: {
    host: string;
    port: number;
    auth?: {
      username: string;
      password: string;
    };
  };
}

// 监控配置接口
export interface MonitoringConfig {
  enabled: boolean;
  checkInterval?: string;
  checkMethod: 'HEAD_REQUEST' | 'STREAM_TEST' | 'CONTENT_DOWNLOAD';
  sampleSize?: number;
  timeout?: number;
  retryCount?: number;
  priorityChannels?: string[];
  availabilityThreshold?: number;
  notifications?: {
    enabled: boolean;
    webhookUrl?: string;
    emailConfig?: {
      smtp: string;
      from: string;
      to: string[];
    };
  };
}

// 系统配置接口
export interface SystemConfig {
  // 基础配置
  cron: string;
  preferredAddress: string;
  channels: number;
  blackList: string[];
  dedup: boolean;
  requestDelay: [number, number]; // [min, max] seconds
  maxRetries: number;
  
  // 输出配置
  output: {
    formats: ('m3u' | 'json' | 'txt')[];
    filename: string;
    includeMetadata: boolean;
    groupBy: 'none' | 'group' | 'country' | 'language';
  };
  
  // 网络配置
  network: {
    timeout: number;
    maxConcurrentRequests: number;
    rateLimit: number;
    userAgentRotation: boolean;
    customUserAgents?: string[];
  };
  
  // 监控配置
  monitoring?: MonitoringConfig;
  
  // 可用性阈值
  availabilityThreshold?: number;
  maxDaysSinceLastScrape?: number;
  
  // 高级配置
  advanced?: {
    enableCaching: boolean;
    cacheTTL: number;
    enableCompression: boolean;
    customHeaders?: Record<string, string>;
  };
}

// 频道检查配置接口
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

// 检查状态接口
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

// 频道检查结果接口
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

// 频道验证结果接口
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

// 爬取决策接口
export interface ScrapingDecision {
  shouldScrape: boolean;
  reason: 'AVAILABILITY_LOW' | 'NO_RECENT_DATA' | 'MANUAL_TRIGGER' | 'AVAILABILITY_OK';
  availabilityRate?: number;
  lastCheckTime?: Date;
}

// 频道检查接口
export interface ChannelCheck {
  id: string;
  config: ChannelCheckConfig;
  status: CheckStatus;
  createdAt: Date;
  updatedAt: Date;
}

// 系统数据接口
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