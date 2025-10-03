/**
 * 前端错误处理器
 * 专为浏览器环境设计的轻量级错误处理模块
 */

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

// 定义错误上下文接口
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

// 定义应用错误接口
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

// 定义错误处理器配置接口
export interface ErrorHandlerConfig {
  enableLogging: boolean;
  enableNotification: boolean;
  maxRetries: number;
  retryDelay: number;
}

export class FrontendErrorHandler {
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
   * 创建特定类型的错误
   */
  createError(
    type: ErrorType,
    message: string,
    details?: any,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM
  ): AppError {
    return {
      id: this.generateErrorId(),
      type,
      severity,
      message,
      details,
      timestamp: new Date(),
      recoverable: this.isRecoverable(type),
      retryable: this.isRetryable(type),
      context: {},
    };
  }

  /**
   * HTTP错误处理
   */
  handleHttpError(url: string, status: number, message: string): AppError {
    const appError = this.createError(
      ErrorType.HTTP_ERROR,
      `HTTP错误 ${status}: ${message}`,
      { url, status },
      status >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM
    );

    return this.handle(appError);
  }

  /**
   * 网络错误处理
   */
  handleNetworkError(error: any, url?: string): AppError {
    const appError = this.createError(
      ErrorType.NETWORK_ERROR,
      `网络请求失败: ${error.message || '未知错误'}`,
      { url, status: error.status, code: error.code },
      ErrorSeverity.MEDIUM
    );

    return this.handle(appError);
  }

  /**
   * 验证错误处理
   */
  handleValidationError(field: string, value: any, rule: string): AppError {
    const appError = this.createError(
      ErrorType.VALIDATION_ERROR,
      `字段验证失败: ${field}`,
      { field, value, rule },
      ErrorSeverity.LOW
    );

    return this.handle(appError);
  }

  /**
   * 配置错误处理
   */
  handleConfigError(message: string, config?: any): AppError {
    const appError = this.createError(
      ErrorType.CONFIGURATION_ERROR,
      `配置错误: ${message}`,
      config,
      ErrorSeverity.HIGH
    );

    return this.handle(appError);
  }

  /**
   * 解析错误处理
   */
  handleParsingError(message: string, details?: any): AppError {
    const appError = this.createError(
      ErrorType.PARSING_ERROR,
      `解析错误: ${message}`,
      details,
      ErrorSeverity.MEDIUM
    );

    return this.handle(appError);
  }

  /**
   * 爬取错误处理 (向后兼容)
   */
  handleScrapingError(message: string, details?: any): AppError {
    return this.handleParsingError(message, details);
  }

  /**
   * 文件系统错误处理
   */
  handleFileSystemError(operation: string, path: string, error: any): AppError {
    let errorType = ErrorType.SYSTEM_ERROR;
    let severity = ErrorSeverity.HIGH;

    // 根据错误代码确定具体的错误类型
    if (error.code === 'ENOENT') {
      errorType = ErrorType.FILE_NOT_FOUND;
      severity = ErrorSeverity.MEDIUM;
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      errorType = ErrorType.FILE_PERMISSION_ERROR;
      severity = ErrorSeverity.HIGH;
    } else if (error.code === 'ENOSPC') {
      errorType = ErrorType.DISK_SPACE_ERROR;
      severity = ErrorSeverity.CRITICAL;
    }

    const appError = this.createError(
      errorType,
      `文件系统错误: ${operation} 操作失败`,
      { operation, path, error: error.message, code: error.code },
      severity
    );

    return this.handle(appError);
  }

  /**
   * 调度错误处理
   */
  handleSchedulingError(expression: string, error: any): AppError {
    const appError = this.createError(
      ErrorType.SCHEDULING_ERROR,
      `定时任务错误: ${error.message}`,
      { expression },
      ErrorSeverity.MEDIUM
    );

    return this.handle(appError);
  }

  /**
   * Cron错误处理 (向后兼容)
   */
  handleCronError(expression: string, error: any): AppError {
    return this.handleSchedulingError(expression, error);
  }

  /**
   * 添加错误监听器
   */
  addErrorListener(listener: (error: AppError) => void): void {
    this.errorListeners.push(listener);
  }

  /**
   * 移除错误监听器
   */
  removeErrorListener(listener: (error: AppError) => void): void {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
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
export const frontendErrorHandler = new FrontendErrorHandler();

// 导出便捷方法
export const handleFrontendError = (error: any, context?: ErrorContext) =>
  frontendErrorHandler.handle(error, context);

export const createFrontendHttpError = (url: string, status: number, message: string) =>
  frontendErrorHandler.handleHttpError(url, status, message);

export const createFrontendNetworkError = (error: any, url?: string) =>
  frontendErrorHandler.handleNetworkError(error, url);

export const createFrontendValidationError = (
  field: string,
  value: any,
  rule: string
) => frontendErrorHandler.handleValidationError(field, value, rule);

export const createFrontendConfigError = (message: string, config?: any) =>
  frontendErrorHandler.handleConfigError(message, config);

export const createFrontendParsingError = (message: string, details?: any) =>
  frontendErrorHandler.handleParsingError(message, details);

export const createFrontendScrapingError = (message: string, details?: any) =>
  frontendErrorHandler.handleScrapingError(message, details);

export const createFrontendFileSystemError = (
  operation: string,
  path: string,
  error: any
) => frontendErrorHandler.handleFileSystemError(operation, path, error);

export const createFrontendSchedulingError = (expression: string, error: any) =>
  frontendErrorHandler.handleSchedulingError(expression, error);

export const createFrontendCronError = (expression: string, error: any) =>
  frontendErrorHandler.handleCronError(expression, error);