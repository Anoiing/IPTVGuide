/**
 * 错误类型常量
 * 定义系统中所有可能的错误类型
 */
export const ErrorType = {
  // 验证错误
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // HTTP错误
  HTTP_ERROR: 'HTTP_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // 文件系统错误
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_PERMISSION_ERROR: 'FILE_PERMISSION_ERROR',
  DISK_SPACE_ERROR: 'DISK_SPACE_ERROR',

  // 业务逻辑错误
  PARSING_ERROR: 'PARSING_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  SCHEDULING_ERROR: 'SCHEDULING_ERROR',

  // 系统错误
  MEMORY_ERROR: 'MEMORY_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorType = typeof ErrorType[keyof typeof ErrorType];

/**
 * 错误严重程度常量
 */
export const ErrorSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type ErrorSeverity = typeof ErrorSeverity[keyof typeof ErrorSeverity];

/**
 * 错误上下文接口
 * 包含错误发生时的上下文信息
 */
export interface ErrorContext {
  method?: string;
  path?: string;
  body?: any;
  query?: any;
  url?: string;
  status?: number;
  code?: string;
  field?: string;
  value?: any;
  rule?: string;
  operation?: string;
  filePath?: string;
  expression?: string;
  component?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  [key: string]: any;
}

/**
 * 应用错误接口
 * 定义系统中统一的错误格式
 */
export interface AppError {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  originalError?: Error;
  details?: any;
  timestamp: Date;
  stack?: string;
  context?: ErrorContext;
  recoverable: boolean;
  retryable: boolean;
}

/**
 * 错误处理器配置接口
 */
export interface ErrorHandlerConfig {
  enableLogging: boolean;
  enableNotification: boolean;
  maxRetries: number;
  retryDelay: number;
}

/**
 * 错误历史记录接口
 */
export interface ErrorHistoryEntry {
  error: AppError;
  handledAt: Date;
  handler?: string;
}