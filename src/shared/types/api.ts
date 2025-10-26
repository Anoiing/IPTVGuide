/**
 * API相关类型定义
 * 统一管理所有API类型，避免重复定义
 */

/**
 * 标准API响应接口
 */
export interface ApiResponse<T = any> {
  status: 'success' | 'error';
  message: string;
  data: T | null;
  error: any;
  timestamp?: Date;
}

/**
 * HTTP请求选项接口
 */
export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  cache?: boolean;
  validateStatus?: (status: number) => boolean;
}

/**
 * HTTP响应接口
 */
export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  config: HttpRequestOptions;
  cached?: boolean;
  responseTime?: number;
}

/**
 * 缓存条目接口
 */
export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

/**
 * 请求配置接口
 */
export interface RequestConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
}

/**
 * 分页信息接口
 */
export interface PaginationInfo {
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  totalItems?: number;
  itemsPerPage: number;
}

/**
 * 分页响应接口
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationInfo;
}

/**
 * 验证结果接口
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * 文件信息接口
 */
export interface FileInfo {
  name: string;
  path: string;
  size: number;
  mtime: Date;
  type: 'file' | 'directory';
}

/**
 * 备份信息接口
 */
export interface BackupInfo {
  id: string;
  name: string;
  timestamp: Date;
  size: number;
  description?: string;
}

/**
 * WebSocket消息接口
 */
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
  id?: string;
}