/**
 * 系统配置相关类型定义
 */

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
  monitoring?: {
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
  };
  
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