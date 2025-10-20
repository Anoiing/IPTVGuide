import { createFrontendNetworkError } from './FrontendErrorHandler.ts';

/**
 * API响应接口
 */
interface ApiResponse<T = any> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
  error?: string;
}

/**
 * HTTP请求配置接口
 */
interface RequestConfig {
  timeout?: number;
  retries?: number;
  cache?: boolean;
  cacheTTL?: number;
}

/**
 * 缓存条目接口
 */
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

/**
 * 统一的API服务类
 * 提供HTTP请求、错误处理、缓存和重试机制
 */
class ApiService {
  private cache = new Map<string, CacheEntry>();
  private readonly defaultConfig: RequestConfig = {
    timeout: 10000,
    retries: 3,
    cache: true,
    cacheTTL: 5 * 60 * 1000, // 5分钟
  };

  /**
   * 发送GET请求
   * @param url 请求URL
   * @param config 请求配置
   * @returns Promise<ApiResponse>
   */
  async get<T = any>(
    url: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const cacheKey = `GET:${url}`;

    // 检查缓存
    if (finalConfig.cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < cached.ttl) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    return this.executeRequest('GET', url, null, finalConfig, cacheKey);
  }

  /**
   * 发送POST请求
   * @param url 请求URL
   * @param data 请求数据
   * @param config 请求配置
   * @returns Promise<ApiResponse>
   */
  async post<T = any>(
    url: string,
    data: any = null,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const finalConfig = { ...this.defaultConfig, ...config };
    return this.executeRequest('POST', url, data, finalConfig);
  }

  /**
   * 发送PATCH请求
   * @param url 请求URL
   * @param data 请求数据
   * @param config 请求配置
   * @returns Promise<ApiResponse>
   */
  async patch<T = any>(
    url: string,
    data: any = null,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const finalConfig = { ...this.defaultConfig, ...config };
    return this.executeRequest('PATCH', url, data, finalConfig);
  }

  /**
   * 执行HTTP请求
   * @param method HTTP方法
   * @param url 请求URL
   * @param data 请求数据
   * @param config 请求配置
   * @param cacheKey 缓存键
   * @returns Promise<ApiResponse>
   */
  private async executeRequest<T = any>(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    data: any,
    config: RequestConfig,
    cacheKey?: string
  ): Promise<ApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= (config.retries || 1); attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          config.timeout || 10000
        );

        const requestOptions: RequestInit = {
          method,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
        };

        if (data && (method === 'POST' || method === 'PATCH')) {
          requestOptions.body = JSON.stringify(data);
        }

        const response = await fetch(url, requestOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result: ApiResponse<T> = await response.json();

        // 缓存成功的GET请求结果
        if (
          method === 'GET' &&
          config.cache &&
          cacheKey &&
          result.status === 'success'
        ) {
          this.cache.set(cacheKey, {
            data: result,
            timestamp: Date.now(),
            ttl: config.cacheTTL || this.defaultConfig.cacheTTL!,
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // 如果是最后一次尝试，抛出错误
        if (attempt === config.retries) {
          break;
        }

        // 等待后重试
        await this.delay(Math.pow(2, attempt - 1) * 1000);
      }
    }

    // 处理最终错误
    createFrontendNetworkError(lastError || new Error('Request failed'), url);

    return {
      status: 'error',
      error: lastError?.message || 'Request failed',
    };
  }

  /**
   * 延迟执行
   * @param ms 延迟毫秒数
   * @returns Promise<void>
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 清理过期缓存
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清空所有缓存
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}

// 创建单例实例
const apiService = new ApiService();

/**
 * 系统相关API
 */
export class SystemAPI {
  /**
   * 获取系统配置
   * @returns Promise<ApiResponse>
   */
  static async getConfig(): Promise<ApiResponse> {
    return apiService.get('/api/config', { cache: true, cacheTTL: 5000 });
  }

  /**
   * 更新系统配置
   * @param config - 配置对象
   * @returns Promise<ApiResponse<any>>
   */
  static async updateConfig(config: any): Promise<ApiResponse<any>> {
    return apiService.post('/api/saveConfig', config);
  }

  /**
   * 获取系统状态
   * @returns Promise<ApiResponse>
   */
  static async getStatus(): Promise<ApiResponse> {
    return apiService.get('/api/getStatus', { cache: true, cacheTTL: 2000 });
  }

  /**
   * 获取系统日志
   * @param limit 日志条数限制
   * @returns Promise<ApiResponse>
   */
  static async getLogs(limit: number = 100): Promise<ApiResponse> {
    return apiService.get(`/api/getLogs?limit=${limit}`, { cache: false });
  }
}

/**
 * 任务相关API
 */
export class TaskAPI {
  /**
   * 立即运行一次任务
   * @returns Promise<ApiResponse>
   */
  static async runOnce(): Promise<ApiResponse> {
    return apiService.get('/api/runOnce');
  }

  /**
   * 取消当前任务
   * @returns Promise<ApiResponse>
   */
  static async cancel(): Promise<ApiResponse> {
    return apiService.get('/api/cancel');
  }

  /**
   * 获取任务历史
   * @param limit 历史记录条数限制
   * @returns Promise<ApiResponse>
   */
  static async getHistory(limit: number = 50): Promise<ApiResponse> {
    return apiService.get(`/api/task/history?limit=${limit}`);
  }
}

// 定期清理过期缓存
setInterval(() => {
  apiService.clearExpiredCache();
}, 5 * 60 * 1000); // 每5分钟清理一次

export { apiService as ApiService };
