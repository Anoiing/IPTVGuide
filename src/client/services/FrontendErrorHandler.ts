/**
 * 前端错误处理器
 * 基于共享错误处理器的前端适配版本
 */

import { 
  ErrorType, 
  ErrorSeverity, 
  type ErrorContext, 
  type AppError, 
  type ErrorHandlerConfig 
} from '../../shared/core/error/types';

/**
 * 前端错误处理器类
 * 提供前端专用的错误处理功能
 */
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
   * @param error - 错误对象
   * @param context - 错误上下文
   * @returns 应用错误对象
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
   * 创建应用错误
   * @param type - 错误类型
   * @param message - 错误消息
   * @param details - 错误详情
   * @param severity - 错误严重程度
   * @returns 应用错误对象
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
   * @param url - 请求URL
   * @param status - HTTP状态码
   * @param message - 错误消息
   * @returns 应用错误对象
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
   * @param error - 网络错误对象
   * @param url - 请求URL
   * @returns 应用错误对象
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
   * @param field - 字段名
   * @param value - 字段值
   * @param rule - 验证规则
   * @returns 应用错误对象
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
   * @param message - 错误消息
   * @param config - 配置对象
   * @returns 应用错误对象
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
   * @param message - 错误消息
   * @param details - 错误详情
   * @returns 应用错误对象
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
   * @param message - 错误消息
   * @param details - 错误详情
   * @returns 应用错误对象
   */
  handleScrapingError(message: string, details?: any): AppError {
    return this.handleParsingError(message, details);
  }

  /**
   * 文件系统错误处理
   * @param operation - 操作类型
   * @param path - 文件路径
   * @param error - 错误对象
   * @returns 应用错误对象
   */
  handleFileSystemError(operation: string, path: string, error: any): AppError {
    let errorType = ErrorType.SYSTEM_ERROR;
    let severity = ErrorSeverity.HIGH;

    // 根据错误代码确定具体的错误类型
    if (error.code === 'ENOENT') {
      errorType = ErrorType.SYSTEM_ERROR;
      severity = ErrorSeverity.HIGH;
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      errorType = ErrorType.SYSTEM_ERROR;
      severity = ErrorSeverity.HIGH;
    } else if (error.code === 'ENOSPC') {
      errorType = ErrorType.SYSTEM_ERROR;
      severity = ErrorSeverity.HIGH;
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
   * @param expression - Cron表达式
   * @param error - 错误对象
   * @returns 应用错误对象
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
   * @param expression - Cron表达式
   * @param error - 错误对象
   * @returns 应用错误对象
   */
  handleCronError(expression: string, error: any): AppError {
    return this.handleSchedulingError(expression, error);
  }

  /**
   * 添加错误监听器
   * @param listener - 错误监听器函数
   */
  addErrorListener(listener: (error: AppError) => void): void {
    this.errorListeners.push(listener);
  }

  /**
   * 移除错误监听器
   * @param listener - 错误监听器函数
   */
  removeErrorListener(listener: (error: AppError) => void): void {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  /**
   * 重试操作
   * @param operation - 要重试的操作
   * @param maxRetries - 最大重试次数
   * @param delay - 重试延迟
   * @returns 操作结果
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

  /**
   * 标准化错误对象
   * @param error - 原始错误
   * @param context - 错误上下文
   * @returns 标准化的应用错误
   */
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

  /**
   * 检查是否为应用错误对象
   * @param error - 错误对象
   * @returns 是否为应用错误
   */
  private isAppError(error: any): error is AppError {
    return (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'severity' in error
    );
  }

  /**
   * 检测错误类型
   * @param error - 错误对象
   * @returns 错误类型
   */
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
      return ErrorType.SYSTEM_ERROR;
    }

    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return ErrorType.SYSTEM_ERROR;
    }

    if (error.code === 'ENOSPC') {
      return ErrorType.SYSTEM_ERROR;
    }

    // 内存错误
    if (error.code === 'ENOMEM' || error.message?.includes('out of memory')) {
      return ErrorType.SYSTEM_ERROR;
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

  /**
   * 检测错误严重程度
   * @param error - 错误对象
   * @param type - 错误类型
   * @returns 错误严重程度
   */
  private detectSeverity(_error: any, type: ErrorType): ErrorSeverity {
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

  /**
   * 检查错误是否可恢复
   * @param type - 错误类型
   * @returns 是否可恢复
   */
  private isRecoverable(type: ErrorType): boolean {
    return [
      ErrorType.NETWORK_ERROR,
      ErrorType.HTTP_ERROR,
      ErrorType.TIMEOUT_ERROR,
      ErrorType.PARSING_ERROR,
      ErrorType.VALIDATION_ERROR,
      ErrorType.SCHEDULING_ERROR,
    ].includes(type as any);
  }

  /**
   * 检查错误是否可重试
   * @param type - 错误类型
   * @returns 是否可重试
   */
  private isRetryable(type: ErrorType): boolean {
    return [
      ErrorType.NETWORK_ERROR,
      ErrorType.HTTP_ERROR,
      ErrorType.TIMEOUT_ERROR,
      ErrorType.PARSING_ERROR,
    ].includes(type as any);
  }

  /**
   * 记录错误到控制台
   * @param error - 应用错误对象
   */
  private logError(error: AppError): void {
    const logData = {
      id: error.id,
      type: error.type,
      severity: error.severity,
      message: error.message,
      timestamp: error.timestamp,
      context: error.context,
      stack: error.stack,
    };

    const logMessage = `[前端错误] ${error.type} - ${error.message}`;

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        console.error(`[CRITICAL] ${logMessage}`, logData);
        break;
      case ErrorSeverity.HIGH:
        console.error(`[HIGH] ${logMessage}`, logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(`[MEDIUM] ${logMessage}`, logData);
        break;
      case ErrorSeverity.LOW:
        console.info(`[LOW] ${logMessage}`, logData);
        break;
    }
  }

  /**
   * 通知错误监听器
   * @param error - 应用错误对象
   */
  private notifyListeners(error: AppError): void {
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch (listenerError) {
        console.error('[前端错误处理器] 监听器执行失败:', listenerError);
      }
    });
  }

  /**
   * 生成错误ID
   * @returns 唯一错误ID
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 创建单例实例
const frontendErrorHandler = new FrontendErrorHandler();

// 导出便捷函数
export const createFrontendNetworkError = (error: any, url?: string) =>
  frontendErrorHandler.handleNetworkError(error, url);

// 导出类型
export { ErrorType, ErrorSeverity, type ErrorContext, type AppError, type ErrorHandlerConfig };