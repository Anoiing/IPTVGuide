/**
 * HTTP客户端模块
 * 负责发送HTTP请求，支持重试、限流和User-Agent轮换
 * 
 * @implements {IHttpClient}
 */
import axios from 'axios';
import type { HttpClient as IHttpClient } from '../../shared/types/interfaces.js';
import type { RequestOptions } from '../../shared/types/scraper.js';
import { Logger } from '../utils/logger.js';
import { delay, exponentialBackoff, randomDelay } from '../utils/delay.js';

/**
 * HTTP客户端类
 * 提供HTTP请求功能，包括重试机制、频率限制和请求延迟
 */
export class HttpClient implements IHttpClient {
  /** 日志记录器 */
  private logger: Logger;
  
  /** 请求频率限制（每秒请求数），0表示无限制 */
  private rateLimit: number = 0;
  
  /** 最大重试次数 */
  private maxRetries: number = 2;
  
  /** 基础退避延迟（毫秒） */
  private baseBackoffMs: number = 3000;
  
  /** 上次请求时间戳 */
  private lastRequestTime: number = 0;
  
  /** 是否使用随机延迟 */
  private useRandomDelay: boolean = true;
  
  /** 随机延迟范围（秒） */
  private randomDelayRange: [number, number] = [1, 3];
  
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

  constructor(configDir: string = './config') {
    this.logger = new Logger(configDir);
  }

  /**
   * 发送POST请求
   * 
   * @param {string} url - 请求URL
   * @param {any} data - 请求数据
   * @param {RequestOptions} options - 请求选项
   * @returns {Promise<T>} 响应数据
   */
  async post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T> {
    // 简单的POST实现，主要用于接口兼容
    const response = await axios.post(url, data, {
      timeout: options?.timeout || 30000,
      headers: options?.headers || {},
    });
    return response.data as T;
  }

  /**
   * 更新配置
   * 
   * @param {Partial<any>} config - 配置对象
   * @returns {void}
   */
  updateConfig(config: Partial<any>): void {
    if (config.maxRetries !== undefined) {
      this.maxRetries = config.maxRetries;
    }
    if (config.timeout !== undefined) {
      this.baseBackoffMs = config.timeout;
    }
    if (config.rateLimit !== undefined) {
      this.rateLimit = config.rateLimit;
    }
    this.logger.info('HttpClient配置已更新', config);
  }

  /**
   * 发送GET请求
   * 支持重试、限流和随机延迟
   * 
   * @param {string} url - 请求URL
   * @param {RequestOptions} [options] - 请求选项
   * @returns {Promise<string>} 响应数据
   * @throws {Error} 当请求失败且所有重试都用尽时抛出
   * 
   * @example
   * ```typescript
   * const httpClient = new HttpClient('./config');
   * const data = await httpClient.get('https://example.com/api/data');
   * ```
   */
  async get<T = string>(url: string, options?: RequestOptions): Promise<T> {
    // 检查是否为被阻止的域名
    if (this.isBlockedDomain(url)) {
      this.logger.info(`阻止数据采集请求: ${url}`);
      throw new Error(`Blocked tracking domain: ${url}`);
    }

    const effectiveOptions = {
      timeout: 60000,
      retries: this.maxRetries,
      ...options,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= effectiveOptions.retries; attempt++) {
      try {
        // 应用频率限制和随机延迟
        await this.applyRateLimit();

        // 添加随机延迟以避免被识别为机器人
        if (this.useRandomDelay && attempt === 0) {
          const delayMs = randomDelay(
            this.randomDelayRange[0],
            this.randomDelayRange[1]
          );
          await delay(delayMs);
        }

        // 准备请求头
        const headers = {
          'User-Agent': this.getNextUserAgent(),
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          Referer: 'https://tonkiang.us/',
          'Cache-Control': 'max-age=0',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          ...effectiveOptions.headers,
        };

        this.logger.info(
          `HTTP GET (第 ${attempt + 1}/${effectiveOptions.retries + 1} 次尝试)`
        );

        const response = await axios.get(url, {
          timeout: effectiveOptions.timeout,
          headers,
          validateStatus: (status: number) => status < 500, // 只对5xx错误重试
        });

        // 检查响应状态
        if (response.status === 429) {
          // 处理限流
          const retryAfter =
            parseInt(response.headers['retry-after'] || '5', 10) * 1000;
          const retryAfterSeconds = (retryAfter / 1000).toFixed(1);
          this.logger.warn(
            `Rate limited (429), waiting ${retryAfterSeconds}秒 before retry`
          );
          await delay(retryAfter);
          continue;
        }

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        this.logger.info(`HTTP GET 成功 (${response.status})`);
        return response.data;
      } catch (error: unknown) {
        lastError = error as Error;

        if (axios.isAxiosError(error)) {
          const axiosError = error as any;
          if (
            axiosError.code === 'ECONNABORTED' ||
            axiosError.code === 'ETIMEDOUT'
          ) {
            this.logger.warn(`请求超时，第 ${attempt + 1} 次尝试`);
          } else if (axiosError.response?.status === 429) {
            // 429错误已在上面处理
            continue;
          } else if (
            axiosError.response?.status &&
            axiosError.response.status >= 500
          ) {
            this.logger.warn(
              `服务器错误 ${axiosError.response.status}，第 ${
                attempt + 1
              } 次尝试`
            );
          } else {
            // 4xx错误或其他错误，不重试
            this.logger.error(`HTTP错误: ${axiosError.message}`);
            throw error;
          }
        } else {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          this.logger.error(`网络错误: ${errorMessage}`);
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < effectiveOptions.retries) {
          const backoffMs = exponentialBackoff(attempt, this.baseBackoffMs);
          const backoffSeconds = (backoffMs / 1000).toFixed(1);
          this.logger.info(`等待 ${backoffSeconds}秒 后重试`);
          await delay(backoffMs);
        }
      }
    }

    // 所有重试都失败了
    const errorMessage = `获取失败，已尝试 ${
      effectiveOptions.retries + 1
    } 次: ${lastError?.message}`;
    this.logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  /**
   * 设置请求频率限制
   * 
   * @param {number} requestsPerSecond - 每秒请求数
   * @returns {void}
   */
  setRateLimit(requestsPerSecond: number): void {
    this.rateLimit = requestsPerSecond;
    this.logger.info(`设置请求限制为每秒 ${requestsPerSecond} 个请求`);
  }

  /**
   * 设置重试配置
   * 
   * @param {number} maxRetries - 最大重试次数
   * @param {number} backoffMs - 基础退避延迟（毫秒）
   * @returns {void}
   */
  setRetryConfig(maxRetries: number, backoffMs: number): void {
    this.maxRetries = maxRetries;
    this.baseBackoffMs = backoffMs;
    const backoffSeconds = (backoffMs / 1000).toFixed(1);
    this.logger.info(
      `重试配置已更新: 最大重试=${maxRetries}次, 基础延迟=${backoffSeconds}秒`
    );
  }

  setRandomDelay(
    enabled: boolean,
    minSeconds: number = 1,
    maxSeconds: number = 3
  ): void {
    this.useRandomDelay = enabled;
    this.randomDelayRange = [minSeconds, maxSeconds];
    this.logger.info(
      `随机延迟${enabled ? '已启用' : '已禁用'}: ${minSeconds}-${maxSeconds}秒`
    );
  }

  private async applyRateLimit(): Promise<void> {
    if (this.rateLimit <= 0) return;

    const minInterval = 1000 / this.rateLimit; // 最小间隔毫秒数
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await delay(waitTime);
    }

    this.lastRequestTime = Date.now();
  }

  private getNextUserAgent(): string {
    const userAgent = this.userAgents[this.currentUserAgentIndex];
    this.currentUserAgentIndex =
      (this.currentUserAgentIndex + 1) % this.userAgents.length;
    return userAgent;
  }

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
}
