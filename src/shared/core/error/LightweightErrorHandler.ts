/**
 * 前端兼容的轻量级错误处理器
 * 用于替代后端的完整错误处理器，避免导入Node.js模块
 */

import type { 
  ErrorContext, 
  AppError, 
  ErrorHandlerConfig 
} from './types.js';

// 定义错误类型枚举（前端兼容版本）
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

// 定义错误严重程度枚举（前端兼容版本）
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export class LightweightErrorHandler {
  private config: ErrorHandlerConfig;
  private errorListeners: ((error: AppError) => void)[] = [];

  constructor(config?: Partial<ErrorHandlerConfig>) {
    this.config = {
      enableLogging: true,
      enableNotification: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...config,
    };
  }

  /**
   * 处理错误
   */
  handle(error: Error | AppError | any, context?: ErrorContext): AppError {
    const appError = this.normalizeError(error, context);

    // 记录错误到控制台
    if (this.config.enableLogging) {
      this.logError(appError);
    }

    // 通知监听器
    this.notifyListeners(appError);

    return appError;
  }

  /**
   * 重试操作
   */
  async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.maxRetries,
    delay: number = this.config.retryDelay
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        // 等待后重试
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }

    throw this.handle(lastError);
  }

  private normalizeError(error: any, context?: ErrorContext): AppError {
    if (this.isAppError(error)) {
      return {
        ...error,
        context: { ...error.context, ...context },
        originalError:
          error.originalError || (error instanceof Error ? error : undefined),
      };
    }

    const errorType = this.detectErrorType(error);
    const severity = this.detectSeverity(error, errorType);

    return {
      id: this.generateErrorId(),
      type: errorType,
      severity,
      message: error.message || String(error),
      originalError: error instanceof Error ? error : undefined,
      details: error,
      timestamp: new Date(),
      stack: error.stack,
      context: context || {},
      recoverable: this.isRecoverable(errorType),
      retryable: this.isRetryable(errorType),
    };
  }

  private isAppError(error: any): error is AppError {
    return (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'severity' in error
    );
  }

  private detectErrorType(error: any): ErrorType {
    // 网络相关错误
    if (
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ECONNRESET'
    ) {
      return ErrorType.NETWORK_ERROR;
    }

    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return ErrorType.TIMEOUT_ERROR;
    }

    // HTTP错误
    if (error.response?.status || error.status) {
      return ErrorType.HTTP_ERROR;
    }

    // 文件系统错误
    if (error.code === 'ENOENT') {
      return ErrorType.FILE_NOT_FOUND;
    }

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return ErrorType.FILE_PERMISSION_ERROR;
    }

    if (error.code === 'ENOSPC') {
      return ErrorType.DISK_SPACE_ERROR;
    }

    // 内存错误
    if (error.code === 'ENOMEM' || error.message?.includes('out of memory')) {
      return ErrorType.MEMORY_ERROR;
    }

    // 业务逻辑错误
    if (
      error.message?.includes('cron') ||
      error.message?.includes('schedule') ||
      error.message?.includes('定时')
    ) {
      return ErrorType.SCHEDULING_ERROR;
    }

    if (error.message?.includes('config') || error.message?.includes('配置')) {
      return ErrorType.CONFIGURATION_ERROR;
    }

    if (
      error.message?.includes('validation') ||
      error.message?.includes('验证')
    ) {
      return ErrorType.VALIDATION_ERROR;
    }

    if (
      error.message?.includes('parse') ||
      error.message?.includes('解析') ||
      error.message?.includes('scraping') ||
      error.message?.includes('爬取')
    ) {
      return ErrorType.PARSING_ERROR;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  private detectSeverity(error: any, type: ErrorType): ErrorSeverity {
    switch (type) {
      case ErrorType.VALIDATION_ERROR:
        return ErrorSeverity.LOW;

      case ErrorType.HTTP_ERROR:
      case ErrorType.NETWORK_ERROR:
      case ErrorType.TIMEOUT_ERROR:
      case ErrorType.PARSING_ERROR:
      case ErrorType.SCHEDULING_ERROR:
        return ErrorSeverity.MEDIUM;

      case ErrorType.CONFIGURATION_ERROR:
      case ErrorType.FILE_NOT_FOUND:
      case ErrorType.FILE_PERMISSION_ERROR:
        return ErrorSeverity.HIGH;

      case ErrorType.DISK_SPACE_ERROR:
      case ErrorType.MEMORY_ERROR:
      case ErrorType.SYSTEM_ERROR:
        return ErrorSeverity.CRITICAL;

      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  private isRecoverable(type: ErrorType): boolean {
    return [
      ErrorType.NETWORK_ERROR,
      ErrorType.HTTP_ERROR,
      ErrorType.TIMEOUT_ERROR,
      ErrorType.PARSING_ERROR,
      ErrorType.VALIDATION_ERROR,
      ErrorType.SCHEDULING_ERROR,
    ].includes(type);
  }

  private isRetryable(type: ErrorType): boolean {
    return [
      ErrorType.NETWORK_ERROR,
      ErrorType.HTTP_ERROR,
      ErrorType.TIMEOUT_ERROR,
      ErrorType.PARSING_ERROR,
    ].includes(type);
  }

  private logError(error: AppError): void {
    const logMessage = `[${error.severity}] ${error.type}: ${error.message}`;
    
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        console.error(logMessage, error.details);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(logMessage, error.details);
        break;
      case ErrorSeverity.LOW:
        console.info(logMessage, error.details);
        break;
    }
  }

  private notifyListeners(error: AppError): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError);
      }
    });
  }

  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例实例
export const errorHandler = new LightweightErrorHandler();

// 导出便捷方法
export const handleError = (error: any, context?: ErrorContext) =>
  errorHandler.handle(error, context);