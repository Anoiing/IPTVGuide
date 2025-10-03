/**
 * 增强HTTP客户端
 * 提供连接池、缓存、并发控制和性能优化功能
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import https from 'https';
import http from 'http';
import { Logger } from '../utils/logger.js';
import { errorHandler, ErrorType } from '../../shared/core/ErrorHandler.js';

/**
 * HTTP客户端配置接口
 */
export interface HttpClientConfig {
  /** 请求超时时间（毫秒） */
  timeout: number;
  
  /** 最大重试次数 */
  maxRetries: number;
  
  /** 基础退避延迟（毫秒） */
  baseBackoffMs: number;
  
  /** 请求频率限制（每秒请求数），0表示无限制 */
  rateLimit: number;
  
  /** 最大并发请求数 */
  maxConcurrentRequests: number;
  
  /** 连接超时时间（毫秒） */
  connectionTimeout: number;
  
  /** 是否启用Keep-Alive */
  keepAlive: boolean;
  
  /** Keep-Alive时间（毫秒） */
  keepAliveMsecs: number;
  
  /** 最大套接字数 */
  maxSockets: number;
  
  /** 最大空闲套接字数 */
  maxFreeSockets: number;
  
  /** 是否启用缓存 */
  enableCaching: boolean;
  
  /** 缓存TTL（毫秒） */
  cacheTTL: number;
  
  /** 是否启用压缩 */
  enableCompression: boolean;
  
  /** 是否启用User-Agent轮换 */
  userAgentRotation: boolean;
  
  /** 自定义User-Agent列表 */
  customUserAgents?: string[];
}

/**
 * HTTP请求选项接口
 */
export interface HttpRequestOptions {
  /** 请求超时时间（毫秒） */
  timeout?: number;
  
  /** 重试次数 */
  retries?: number;
  
  /** 请求头 */
  headers?: Record<string, string>;
  
  /** 缓存键 */
  cacheKey?: string;
  
  /** 是否跳过缓存 */
  skipCache?: boolean;
}

/**
 * HTTP响应接口
 */
export interface HttpResponse<T = any> {
  /** 响应数据 */
  data: T;
  
  /** HTTP状态码 */
  status: number;
  
  /** HTTP状态文本 */
  statusText: string;
  
  /** 响应头 */
  headers: any;
  
  /** 是否来自缓存 */
  cached?: boolean;
  
  /** 响应时间戳 */
  timestamp: Date;
}

/**
 * 缓存条目接口
 */
export interface CacheEntry<T = any> {
  /** 缓存数据 */
  data: T;
  
  /** 时间戳 */
  timestamp: number;
  
  /** TTL（毫秒） */
  ttl: number;
}

/**
 * 增强HTTP客户端类
 * 提供连接池、缓存、并发控制和性能优化的HTTP客户端
 */
export class EnhancedHttpClient {
  /** Axios实例 */
  private axiosInstance: AxiosInstance;
  
  /** 日志记录器 */
  private logger: Logger;
  
  /** HTTP客户端配置 */
  private config: HttpClientConfig;
  
  /** 请求队列 */
  private requestQueue: Array<() => Promise<any>> = [];
  
  /** 活跃请求数 */
  private activeRequests: number = 0;
  
  /** 缓存 */
  private cache: Map<string, CacheEntry> = new Map();
  
  /** 速率限制队列 */
  private rateLimitQueue: Array<() => void> = [];
  
  /** 上次请求时间 */
  private lastRequestTime: number = 0;
  
  /** User-Agent列表 */
  private userAgents: string[] = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  
  /** 当前User-Agent索引 */
  private currentUserAgentIndex: number = 0;

  // 需要阻止的数据采集域名
  private blockedDomains: string[] = [
    's4.histats.com',
    'www.googletagmanager.com',
    'www.google-analytics.com',
    'googletagmanager.com',
    'google-analytics.com',
    'histats.com',
    'doubleclick.net',
    'googlesyndication.com',
    'facebook.com/tr',
    'connect.facebook.net',
  ];

  /**
   * 构造函数
   * @param {string} configDir - 配置目录路径
   * @param {Partial<HttpClientConfig>} config - HTTP客户端配置
   */
  constructor(configDir: string = './config', config?: Partial<HttpClientConfig>) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      baseBackoffMs: 1000,
      rateLimit: 0, // 0 = no limit
      maxConcurrentRequests: 10,
      connectionTimeout: 5000,
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 10,
      enableCaching: true,
      cacheTTL: 300000, // 5 minutes
      enableCompression: true,
      userAgentRotation: true,
      ...config
    };

    this.logger = new Logger(configDir);

    // 创建HTTP和HTTPS代理
    const httpAgent = new http.Agent({
      keepAlive: this.config.keepAlive,
      keepAliveMsecs: this.config.keepAliveMsecs,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.connectionTimeout,
    });

    const httpsAgent = new https.Agent({
      keepAlive: this.config.keepAlive,
      keepAliveMsecs: this.config.keepAliveMsecs,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.connectionTimeout,
      rejectUnauthorized: false, // 注意：在生产环境中应该设置为true
    });

    // 创建Axios实例
    this.axiosInstance = axios.create({
      timeout: this.config.timeout,
      httpAgent,
      httpsAgent,
      decompress: this.config.enableCompression,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // 只对5xx错误重试
    });

    // 添加请求拦截器
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // 添加默认头部
        const defaultHeaders = {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
        };
        
        // 合并头部
        Object.assign(config.headers || {}, defaultHeaders);

        // 添加User-Agent
        if (this.config.userAgentRotation) {
          config.headers['User-Agent'] = this.getNextUserAgent();
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 添加响应拦截器
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        // 处理429限流错误
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '5', 10) * 1000;
          this.logger.warn(`Rate limited (429), waiting ${retryAfter}ms before retry`);
          return new Promise((resolve) => {
            setTimeout(() => resolve(this.axiosInstance(error.config)), retryAfter);
          });
        }
        return Promise.reject(error);
      }
    );

    // 启动缓存清理定时器
    if (this.config.enableCaching) {
      setInterval(() => this.cleanupCache(), 60000); // 每分钟清理一次
    }
  }

  /**
   * GET请求
   */
  /**
   * GET请求
   * 发送HTTP GET请求，支持缓存、重试和并发控制
   * 
   * @template T - 响应数据类型
   * @param {string} url - 请求URL
   * @param {HttpRequestOptions} [options] - 请求选项
   * @returns {Promise<HttpResponse<T>>} HTTP响应
   * @throws {Error} 当请求失败且所有重试都用尽时抛出
   * 
   * @example
   * ```typescript
   * const httpClient = new EnhancedHttpClient('./config');
   * const response = await httpClient.get<string>('https://example.com/api/data');
   * console.log(response.data);
   * ```
   */
  async get<T = string>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    // 检查是否为被阻止的域名
    if (this.isBlockedDomain(url)) {
      this.logger.info(`阻止数据采集请求: ${url}`);
      throw new Error(`Blocked tracking domain: ${url}`);
    }

    // 检查缓存
    if (this.config.enableCaching && !options?.skipCache) {
      const cacheKey = options?.cacheKey || url;
      const cachedResponse = this.getFromCache<T>(cacheKey);
      if (cachedResponse) {
        return {
          ...cachedResponse,
          cached: true,
          timestamp: new Date()
        };
      }
    }

    // 创建请求函数
    const requestFn = () => this.makeRequest<T>('GET', url, null, options);

    // 应用并发控制
    return this.enqueueRequest<T>(requestFn);
  }

  /**
   * POST请求
   */
  /**
   * POST请求
   * 发送HTTP POST请求，支持重试和并发控制
   * 
   * @template T - 响应数据类型
   * @param {string} url - 请求URL
   * @param {any} [data] - 请求数据
   * @param {HttpRequestOptions} [options] - 请求选项
   * @returns {Promise<HttpResponse<T>>} HTTP响应
   * @throws {Error} 当请求失败且所有重试都用尽时抛出
   */
  async post<T = any>(url: string, data?: any, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    // 检查是否为被阻止的域名
    if (this.isBlockedDomain(url)) {
      this.logger.info(`阻止数据采集请求: ${url}`);
      throw new Error(`Blocked tracking domain: ${url}`);
    }

    // 创建请求函数
    const requestFn = () => this.makeRequest<T>('POST', url, data, options);

    // 应用并发控制
    return this.enqueueRequest<T>(requestFn);
  }

  /**
   * 执行HTTP请求
   */
  private async makeRequest<T>(
    method: 'GET' | 'POST',
    url: string,
    data: any,
    options?: HttpRequestOptions
  ): Promise<HttpResponse<T>> {
    const effectiveOptions = {
      timeout: this.config.timeout,
      retries: this.config.maxRetries,
      ...options
    };

    // 应用速率限制
    await this.applyRateLimit();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= effectiveOptions.retries; attempt++) {
      try {
        this.logger.debug(`HTTP ${method} (第 ${attempt + 1}/${effectiveOptions.retries + 1} 次尝试): ${url}`);

        const config: AxiosRequestConfig = {
          method,
          url,
          timeout: effectiveOptions.timeout,
          headers: effectiveOptions.headers,
          data: method === 'POST' ? data : undefined
        };

        const response: AxiosResponse<T> = await this.axiosInstance(config);

        // 检查响应状态
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const httpResponse: HttpResponse<T> = {
          data: response.data,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          timestamp: new Date()
        };

        // 缓存响应
        if (this.config.enableCaching && !options?.skipCache) {
          const cacheKey = options?.cacheKey || url;
          this.setCache(cacheKey, httpResponse);
        }

        this.logger.debug(`HTTP ${method} 成功 (${response.status}): ${url}`);
        return httpResponse;
      } catch (error: any) {
        lastError = error;

        if (axios.isAxiosError(error)) {
          const axiosError = error;
          if (
            axiosError.code === 'ECONNABORTED' ||
            axiosError.code === 'ETIMEDOUT'
          ) {
            this.logger.warn(`请求超时，第 ${attempt + 1} 次尝试: ${url}`);
          } else if (axiosError.response?.status === 429) {
            // 429错误，等待后重试
            const retryAfter = parseInt(axiosError.response.headers['retry-after'] || '5', 10) * 1000;
            this.logger.warn(`Rate limited (429), waiting ${retryAfter}ms before retry: ${url}`);
            await this.delay(retryAfter);
            continue;
          } else if (
            axiosError.response?.status &&
            axiosError.response.status >= 500
          ) {
            this.logger.warn(
              `服务器错误 ${axiosError.response.status}，第 ${attempt + 1} 次尝试: ${url}`
            );
          } else {
            // 4xx错误或其他错误，不重试
            this.logger.error(`HTTP错误: ${axiosError.message}: ${url}`);
            throw error;
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`网络错误: ${errorMessage}: ${url}`);
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < effectiveOptions.retries) {
          const backoffMs = this.exponentialBackoff(attempt, this.config.baseBackoffMs);
          this.logger.info(`等待 ${backoffMs}ms 后重试: ${url}`);
          await this.delay(backoffMs);
        }
      }
    }

    // 所有重试都失败了
    const errorMessage = `获取失败，已尝试 ${effectiveOptions.retries + 1} 次: ${lastError?.message}`;
    this.logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  /**
   * 应用速率限制
   */
  private async applyRateLimit(): Promise<void> {
    if (this.config.rateLimit <= 0) return;

    const minInterval = 1000 / this.config.rateLimit; // 最小间隔毫秒数
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await this.delay(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * 将请求加入队列
   */
  private async enqueueRequest<T>(requestFn: () => Promise<HttpResponse<T>>): Promise<HttpResponse<T>> {
    return new Promise((resolve, reject) => {
      const wrappedRequest = async () => {
        try {
          // 检查并发限制
          while (this.activeRequests >= this.config.maxConcurrentRequests) {
            await this.delay(100);
          }

          this.activeRequests++;
          const result = await requestFn();
          this.activeRequests--;
          resolve(result);
        } catch (error) {
          this.activeRequests--;
          reject(error);
        }
      };

      this.requestQueue.push(wrappedRequest);

      // 处理队列
      this.processQueue();
    });
  }

  /**
   * 处理请求队列
   */
  private async processQueue(): Promise<void> {
    while (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
      const request = this.requestQueue.shift();
      if (request) {
        request();
      }
    }
  }

  /**
   * 从缓存获取数据
   */
  private getFromCache<T>(key: string): HttpResponse<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as HttpResponse<T>;
  }

  /**
   * 设置缓存
   */
  private setCache<T>(key: string, data: HttpResponse<T>): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: this.config.cacheTTL
    });
  }

  /**
   * 清理过期缓存
   */
  private cleanupCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`清理了 ${cleanedCount} 个过期缓存项`);
    }
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.info('缓存已清空');
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.maxSockets
    };
  }

  /**
   * 指数退避延迟
   */
  private exponentialBackoff(attempt: number, baseMs: number): number {
    return Math.min(baseMs * Math.pow(2, attempt), 30000); // 最大30秒
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取下一个User-Agent
   */
  private getNextUserAgent(): string {
    if (!this.config.customUserAgents || this.config.customUserAgents.length === 0) {
      const userAgent = this.userAgents[this.currentUserAgentIndex];
      this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % this.userAgents.length;
      return userAgent;
    } else {
      const userAgent = this.config.customUserAgents[this.currentUserAgentIndex];
      this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % this.config.customUserAgents.length;
      return userAgent;
    }
  }

  /**
   * 检查是否为被阻止的域名
   */
  private isBlockedDomain(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      return this.blockedDomains.some((domain) => {
        return hostname === domain || hostname.endsWith('.' + domain);
      });
    } catch (error) {
      // 如果URL解析失败，不阻止请求
      return false;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<HttpClientConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('HTTP客户端配置已更新');
  }

  /**
   * 获取当前配置
   */
  getConfig(): HttpClientConfig {
    return { ...this.config };
  }
}