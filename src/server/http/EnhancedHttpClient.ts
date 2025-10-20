/**
 * 增强HTTP客户端
 * 提供连接池、缓存、并发控制和性能优化功能
 */
import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import https from 'https';
import http from 'http';
import { Logger } from '../utils/logger.ts';
import { errorHandler, ErrorType } from '../../shared/core/ErrorHandler.ts';

/**
 * HTTP客户端配置接口
 */
export interface HttpClientConfig {
  timeout: number;
  maxRetries: number;
  baseBackoffMs: number;
  rateLimit: number;
  maxConcurrentRequests: number;
  connectionTimeout: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  maxSockets: number;
  maxFreeSockets: number;
  enableCaching: boolean;
  cacheTTL: number;
  enableCompression: boolean;
  userAgentRotation: boolean;
  customUserAgents?: string[];
}

/**
 * HTTP请求选项接口
 */
export interface HttpRequestOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  cacheKey?: string;
  skipCache?: boolean;
}

/**
 * HTTP响应接口
 */
export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: any;
  cached?: boolean;
  timestamp: Date;
}

/**
 * 缓存条目接口
 */
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
}

/**
 * 增强HTTP客户端类
 * 提供连接池、缓存、并发控制等高级功能
 */
export class EnhancedHttpClient {
  private axiosInstance: AxiosInstance;
  private logger: Logger;
  private config: HttpClientConfig;
  private requestQueue: Array<() => Promise<any>> = [];
  private activeRequests: number = 0;
  private cache: Map<string, CacheEntry> = new Map();
  private rateLimitQueue: Array<() => void> = [];
  private lastRequestTime: number = 0;
  private sessionCookies: Map<string, string> = new Map();
  private sessionInitialized: Map<string, boolean> = new Map();
  
  private userAgents: string[] = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  
  private currentUserAgentIndex: number = 0;
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
   * @param configDir 配置目录路径
   * @param config HTTP客户端配置
   */
  constructor(configDir: string = './config', config?: Partial<HttpClientConfig>) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      baseBackoffMs: 1000,
      rateLimit: 0,
      maxConcurrentRequests: 10,
      connectionTimeout: 5000,
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 10,
      enableCaching: true,
      cacheTTL: 300000,
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
      responseType: 'text', // 确保以文本形式接收响应
      responseEncoding: 'utf8', // 明确指定UTF-8编码
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

    this.logger.info(`正在访问: ${url}`);

    // 确保会话已初始化
    await this.ensureSessionInitialized(url);

    // 检查缓存
    if (this.config.enableCaching && !options?.skipCache) {
      const cacheKey = options?.cacheKey || url;
      const cachedResponse = this.getFromCache<T>(cacheKey);
      if (cachedResponse) {
        this.logger.debug(`使用缓存响应: ${url}`);
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

    this.logger.info(`正在POST访问: ${url}`);

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

        // 准备请求头
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        
        // 构建完整的请求头
        const headers: Record<string, string> = {
          ...effectiveOptions.headers
        };
        
        // 添加Referer头（对于非主页请求）
        if (urlObj.pathname !== '/' && !headers['Referer'] && !headers['referer']) {
          headers['Referer'] = `${urlObj.protocol}//${domain}/`;
        }
        
        // 添加Cookie头
        const domainCookies = this.getDomainCookies(domain);
        if (domainCookies && !headers['Cookie'] && !headers['cookie']) {
          headers['Cookie'] = domainCookies;
        }

        const config: AxiosRequestConfig = {
          method,
          url,
          timeout: effectiveOptions.timeout,
          headers,
          data: method === 'POST' ? data : undefined,
          maxRedirects: 5, // 允许最多5次重定向
          validateStatus: (status) => status < 400 // 只有4xx和5xx才被认为是错误
        };

        const response: AxiosResponse<T> = await this.axiosInstance(config);

        // 检测重定向
        if (response.request && response.request.res && response.request.res.responseUrl) {
          const finalUrl = response.request.res.responseUrl;
          if (finalUrl !== url) {
            this.logger.warn(`检测到重定向: ${url} -> ${finalUrl}`);
            
            // 检查是否被重定向到主页或登录页
            const originalDomain = new URL(url).hostname;
            const finalDomain = new URL(finalUrl).hostname;
            
            if (originalDomain === finalDomain) {
              // 同域重定向，可能是路径变化
              this.logger.info(`同域重定向: ${url} -> ${finalUrl}`);
            } else {
              // 跨域重定向，可能有问题
              this.logger.error(`跨域重定向: ${url} -> ${finalUrl}`);
            }
            
            // 检查是否重定向到主页
            const finalPath = new URL(finalUrl).pathname;
            if (finalPath === '/' || finalPath === '/index.php' || finalPath === '/index.html') {
              this.logger.error(`可能被重定向到主页，需要鉴权: ${url} -> ${finalUrl}`);
            }
          }
        }

        // 检查响应状态
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        this.logger.debug(`HTTP ${method} 成功 (${response.status}): ${url}`);

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

  /**
   * 确保会话已初始化
   * 对于需要鉴权的网站，先访问主页获取必要的cookie
   */
  private async ensureSessionInitialized(url: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // 检查是否已经初始化过该域名的会话
      if (this.sessionInitialized.get(domain)) {
        return;
      }

      this.logger.info(`初始化会话: ${domain}`);
      
      // 访问主页获取初始cookie
      const homeUrl = `${urlObj.protocol}//${domain}/`;
      
      try {
        const homeResponse = await this.makeRequest<string>('GET', homeUrl, null, {
          timeout: 10000,
          skipCache: true
        });
        
        // 提取并保存cookie
        if (homeResponse.headers && homeResponse.headers['set-cookie']) {
          const cookies = homeResponse.headers['set-cookie'];
          if (Array.isArray(cookies)) {
            cookies.forEach(cookie => {
              const cookieParts = cookie.split(';')[0].split('=');
              if (cookieParts.length === 2) {
                this.sessionCookies.set(`${domain}_${cookieParts[0]}`, cookieParts[1]);
              }
            });
          }
        }
        
        this.sessionInitialized.set(domain, true);
        this.logger.info(`会话初始化成功: ${domain}`);
        
      } catch (error) {
        this.logger.warn(`会话初始化失败: ${domain}, 错误: ${error instanceof Error ? error.message : String(error)}`);
        // 即使初始化失败，也标记为已尝试，避免重复尝试
        this.sessionInitialized.set(domain, true);
      }
      
    } catch (error) {
      this.logger.error(`会话初始化过程出错: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取域名的cookie字符串
   */
  private getDomainCookies(domain: string): string {
    const cookies: string[] = [];
    
    for (const [key, value] of this.sessionCookies.entries()) {
      if (key.startsWith(`${domain}_`)) {
        const cookieName = key.substring(domain.length + 1);
        cookies.push(`${cookieName}=${value}`);
      }
    }
    
    return cookies.join('; ');
  }
}