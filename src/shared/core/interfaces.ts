/**
 * 核心模块接口定义
 * 提供清晰的模块接口契约
 */

import type { 
  ChannelInfo, 
  IPInfo,
  ChannelValidationResult
} from './types/channel.js';

import type {
  ScrapingResult,
  ScrapingStatus,
  ScrapingTask,
  ScrapingDecision
} from './types/scraper.js';

import type {
  SystemConfig,
  RequestOptions
} from './types/config.js';

import type {
  ChannelCheckConfig,
  CheckStatus,
  ChannelCheckResult,
  ChannelCheck
} from './types/monitoring.js';

// HTTP客户端接口
export interface HttpClient {
  get<T = string>(url: string, options?: RequestOptions): Promise<T>;
  post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;
  setRateLimit(requestsPerSecond: number): void;
  setRetryConfig(maxRetries: number, backoffMs: number): void;
  updateConfig(config: Partial<any>): void;
}

// HTML解析器接口
export interface HtmlParser {
  parseHotelIPs(html: string): string[];
  parseChannelIPs(html: string): string[];
  parseChannelList(html: string): ChannelInfo[];
  parsePagination(html: string): any;
}

// 爬取引擎接口
export interface ScraperEngine {
  startScraping(): Promise<ScrapingResult>;
  stopScraping(): void;
  getStatus(): ScrapingStatus;
  getProgress(): any;
  getErrors(): any[];
  checkAvailabilityAndScrapeIfNeeded(): Promise<ScrapingDecision>;
}

// 配置管理器接口
export interface ConfigManager {
  loadConfig(): SystemConfig;
  saveConfig(config: Partial<SystemConfig>): void;
  addToBlacklist(ip: string): void;
  isBlacklisted(ip: string): boolean;
  removeFromBlacklist(ip: string): void;
  getBlacklist(): string[];
  clearBlacklist(): void;
  updatePreferredAddress(address: string, channelCount: number): void;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

// 文件生成器接口
export interface FileGenerator {
  generateJSON(channels: Record<string, ChannelInfo[]>): Promise<void>;
  generateTXT(channels: Record<string, ChannelInfo[]>): Promise<void>;
  generateM3U(channels: Record<string, ChannelInfo[]>): Promise<void>;
  generateEPG?(channels: Record<string, ChannelInfo[]>): Promise<void>;
}

// 频道可用性监控接口
export interface ChannelAvailabilityMonitor {
  scheduleCheck(config: ChannelCheckConfig): string;
  cancelCheck(checkId: string): boolean;
  getCheckStatus(checkId: string): CheckStatus;
  getAllChecks(): ChannelCheck[];
  validateChannelUrls(channels: ChannelInfo[]): Promise<ChannelValidationResult[]>;
  checkSingleChannel(channel: ChannelInfo): Promise<ChannelValidationResult>;
  checkAvailabilityAndScrapeIfNeeded(): Promise<ScrapingDecision>;
}

// 安全管理器接口
export interface SecurityManager {
  validateInput(input: any, fieldName: string, rules: any): any;
  sanitizeInput(input: string): string;
  validatePath(filePath: string, basePath: string): boolean;
  generateSecurityHeaders(): Record<string, string>;
  validateCronExpression(cron: string): any;
  validateIPAddress(ip: string): any;
  validateURL(url: string): any;
}

// 增强配置管理器接口
export interface EnhancedConfigManager {
  getConfig(): SystemConfig;
  saveConfiguration(config: Partial<SystemConfig>): void;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  watch(key: string, callback: (value: any) => void): void;
  createBackup(name?: string): any;
  restoreBackup(backupId: string): void;
  listBackups(): any[];
  deleteBackup(backupId: string): void;
  close(): void;
}

// 增强HTTP客户端接口
export interface EnhancedHttpClient {
  get<T = string>(url: string, options?: any): Promise<any>;
  post<T = any>(url: string, data?: any, options?: any): Promise<any>;
  updateConfig(config: Partial<any>): void;
  getConfig(): any;
  clearCache(): void;
  getCacheStats(): { size: number; maxSize: number };
}