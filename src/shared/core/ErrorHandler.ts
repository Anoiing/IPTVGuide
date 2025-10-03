/**
 * 统一错误处理系统 (向后兼容的包装器)
 * 提供全局错误处理、错误分类和错误恢复机制
 */

// 从新的错误处理模块导入
export { 
  type ErrorContext, 
  type AppError, 
  type ErrorHandlerConfig,
  ErrorHandler,
  errorHandler,
  handleError,
  createHttpError,
  createNetworkError,
  createValidationError,
  createConfigError,
  createParsingError,
  createScrapingError,
  createFileSystemError,
  createSchedulingError,
  createCronError
} from './error/ErrorHandler.js';

export enum ErrorType {
  // 验证错误
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  // HTTP错误
  HTTP_ERROR = 'HTTP_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // 文件系统错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_PERMISSION_ERROR = 'FILE_PERMISSION_ERROR',
  DISK_SPACE_ERROR = 'DISK_SPACE_ERROR',

  // 业务逻辑错误
  PARSING_ERROR = 'PARSING_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SCHEDULING_ERROR = 'SCHEDULING_ERROR',

  // 系统错误
  MEMORY_ERROR = 'MEMORY_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

