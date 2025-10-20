/**
 * 统一错误处理系统导出
 * 提供全局错误处理、错误分类和错误恢复机制
 */

// 从错误处理模块导出所有内容
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
} from './error/ErrorHandler.ts';

// 从类型模块导出枚举
export { ErrorType, ErrorSeverity } from './error/types.ts';

