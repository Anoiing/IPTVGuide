/**
 * 统一API服务
 * 整合所有API调用，提供统一的错误处理和缓存机制
 */

import {
  frontendErrorHandler,
  createFrontendNetworkError,
} from './FrontendErrorHandler.js';
import type {
  ApiResponse,
  SystemConfig,
  SystemStatus,
  ValidationResult,
} from '../../shared/types/core.js';

// API配置
interface ApiConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  retryDelay: number;
  enableCache: boolean;
  cacheTimeout: number;
}

// 缓存项
interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

// 请求选项
interface RequestOptions {
  timeout?: number;
  retries?: number;
  cache?: boolean;
  cacheTTL?: number;
  headers?: Record<string, string>;
}

class ApiService {
  private config: ApiConfig;
  private cache = new Map<string, CacheItem<any>>();
  private abortControllers = new Map<string, AbortController>();

  constructor(config?: Partial<ApiConfig>) {
    this.config = {
      baseURL: '',
      timeout: 30000,
      retries: 3,
      retryDelay: 1000,
      enableCache: true,
      cacheTimeout: 60000, // 1分钟
      ...config,
    };
  }

  /**
   * GET请求
   */
  async get<T = any>(
    url: string,
    params?: Record<string, any>,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const fullUrl = this.buildUrl(url, params);
    const cacheKey = `GET:${fullUrl}`;

    // 检查缓存
    if (options?.cache !== false && this.config.enableCache) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        return {
          status: 'success',
          message: '操作成功',
          data: cached,
          error: null,
          timestamp: new Date(),
        };
      }
    }

    return this.request<T>('GET', fullUrl, undefined, options, cacheKey);
  }

  /**
   * POST请求
   */
  async post<T = any>(
    url: string,
    data?: any,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const fullUrl = this.buildUrl(url);
    return this.request<T>('POST', fullUrl, data, options);
  }

  private async request<T>(
    method: string,
    url: string,
    data?: any,
    options?: RequestOptions,
    cacheKey?: string
  ): Promise<ApiResponse<T>> {
    const requestId = `${method}:${url}`;
    
    try {
      // 创建AbortController
      const controller = new AbortController();
      this.abortControllers.set(requestId, controller);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        signal: controller.signal,
      };

      if (data && method !== 'GET') {
        fetchOptions.body = JSON.stringify(data);
      }

      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        const error = createFrontendNetworkError(
          new Error(`HTTP ${response.status}: ${response.statusText}`),
          url
        );
        throw error;
      }

      const result = await response.json();
      
      // 缓存成功的GET请求结果
      if (method === 'GET' && cacheKey && result.status === 'success') {
        this.setCache(cacheKey, result.data, options?.cacheTTL);
      }

      return result;
    } catch (error: any) {
      const appError = frontendErrorHandler.handle(error);
      return {
        status: 'error',
        message: appError.message,
        data: null,
        error: appError,
        timestamp: new Date(),
      };
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  private buildUrl(path: string, params?: Record<string, any>): string {
    const url = new URL(path, this.config.baseURL || window.location.origin);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  private getFromCache<T>(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  private setCache<T>(key: string, data: T, ttl?: number): void {
    if (!this.config.enableCache) return;

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.cacheTimeout,
    };

    this.cache.set(key, item);

    // 清理过期缓存
    if (this.cache.size > 100) {
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > v.ttl) {
          this.cache.delete(k);
        }
      }
    }
  }
}

// 创建全局实例
export const apiService = new ApiService();

/**
 * 系统API
 */
export class SystemAPI {
  /**
   * 获取系统配置
   */
  static async getConfig(): Promise<ApiResponse<SystemConfig>> {
    return apiService.get<SystemConfig>('/api/getConfig');
  }

  /**
   * 保存系统配置
   */
  static async saveConfig(
    config: Partial<SystemConfig>
  ): Promise<ApiResponse<boolean>> {
    return apiService.post<boolean>('/api/saveConfig', config);
  }

  /**
   * 更新系统配置
   */
  static async updateConfig(
    config: Partial<SystemConfig>
  ): Promise<ApiResponse<SystemConfig>> {
    return apiService.post<SystemConfig>('/api/updateConfig', config);
  }

  /**
   * 获取系统状态
   */
  static async getStatus(): Promise<ApiResponse<SystemStatus>> {
    return apiService.get<SystemStatus>('/api/getStatus');
  }
}

/**
 * 任务API
 */
export class TaskAPI {
  /**
   * 执行一次任务
   */
  static async runOnce(): Promise<ApiResponse<boolean>> {
    return apiService.get<boolean>('/api/runOnce');
  }

  /**
   * 取消任务
   */
  static async cancel(): Promise<ApiResponse<boolean>> {
    return apiService.get<boolean>('/api/cancel');
  }
}
