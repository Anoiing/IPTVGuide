/**
 * 增强日志系统实现
 * 提供结构化日志、日志轮转、过滤和查询功能
 */

import fs from 'fs';
import path from 'path';
import { LogLevel } from './types.js';
import type { LogEntry, LoggerConfig, LogFilter, LogStats } from './types.js';
import { formatTimestamp } from '../utils/validation.js';
import type { ErrorType } from '../../shared/core/error/types.js';
import zlib from 'zlib';

export class Logger {
  private configDir: string;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private logFilePath: string;
  private compressedLogDir: string;

  constructor(configDir: string = './config', config?: Partial<LoggerConfig>) {
    this.configDir = configDir;
    this.logFilePath = `${configDir}/app.log`;
    this.compressedLogDir = `${configDir}/logs`;
    
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      enableJsonFormat: true,
      enableCompression: true,
      ...config,
    };

    // 确保日志目录存在
    this.ensureLogDirectories();
    
    // 初始化日志缓冲区
    this.initializeLogBuffer();
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * DEBUG级别日志
   */
  debug(
    message: string,
    context?: any,
    category?: string,
    taskId?: string
  ): void {
    this.writeLog(LogLevel.DEBUG, message, context, category, taskId);
  }

  /**
   * INFO级别日志
   */
  info(
    message: string,
    context?: any,
    category?: string,
    taskId?: string
  ): void {
    this.writeLog(LogLevel.INFO, message, context, category, taskId);
  }

  /**
   * WARN级别日志
   */
  warn(
    message: string,
    context?: any,
    category?: string,
    taskId?: string
  ): void {
    this.writeLog(LogLevel.WARN, message, context, category, taskId);
  }

  /**
   * ERROR级别日志
   */
  error(
    message: string,
    error?: any,
    category?: string,
    taskId?: string,
    errorType?: ErrorType
  ): void {
    const context = error
      ? {
          message: error.message || String(error),
          stack: error.stack,
          ...error,
        }
      : undefined;
      
    this.writeLog(LogLevel.ERROR, message, context, category, taskId, errorType);
  }

  /**
   * 结构化日志记录
   */
  logStructured(entry: Omit<LogEntry, 'timestamp' | 'id'>): void {
    const fullEntry: LogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      ...entry,
    };

    if (fullEntry.level >= this.config.level) {
      this.logBuffer.push(fullEntry);
      this.writeToOutputs(fullEntry);
    }
  }

  /**
   * 获取最近的日志条目
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logBuffer.slice(-count);
  }

  /**
   * 按类别获取日志
   */
  getLogsByCategory(category: string, count: number = 100): LogEntry[] {
    const filtered = this.logBuffer.filter(
      (entry) => entry.category === category
    );
    return filtered.slice(-count);
  }

  /**
   * 按任务ID获取日志
   */
  getLogsByTaskId(taskId: string): LogEntry[] {
    return this.logBuffer.filter((entry) => entry.taskId === taskId);
  }

  /**
   * 按过滤条件查询日志
   */
  queryLogs(filter: LogFilter, limit: number = 100): LogEntry[] {
    let filtered = [...this.logBuffer];

    if (filter.level !== undefined) {
      filtered = filtered.filter(entry => entry.level >= filter.level!);
    }

    if (filter.category) {
      filtered = filtered.filter(entry => entry.category === filter.category);
    }

    if (filter.taskId) {
      filtered = filtered.filter(entry => entry.taskId === filter.taskId);
    }

    if (filter.startDate) {
      filtered = filtered.filter(entry => entry.timestamp >= filter.startDate!);
    }

    if (filter.endDate) {
      filtered = filtered.filter(entry => entry.timestamp <= filter.endDate!);
    }

    if (filter.searchTerm) {
      const term = filter.searchTerm.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.message.toLowerCase().includes(term) ||
        (entry.context && JSON.stringify(entry.context).toLowerCase().includes(term))
      );
    }

    return filtered.slice(-limit);
  }

  /**
   * 获取日志统计信息
   */
  getLogStats(): LogStats {
    const entries = this.logBuffer;
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        byLevel: { [LogLevel.DEBUG]: 0, [LogLevel.INFO]: 0, [LogLevel.WARN]: 0, [LogLevel.ERROR]: 0 },
        byCategory: {},
        errorsByType: {
          VALIDATION_ERROR: 0,
          HTTP_ERROR: 0,
          NETWORK_ERROR: 0,
          TIMEOUT_ERROR: 0,
          FILE_NOT_FOUND: 0,
          FILE_PERMISSION_ERROR: 0,
          DISK_SPACE_ERROR: 0,
          PARSING_ERROR: 0,
          CONFIGURATION_ERROR: 0,
          SCHEDULING_ERROR: 0,
          MEMORY_ERROR: 0,
          SYSTEM_ERROR: 0,
          UNKNOWN_ERROR: 0
        },
        startDate: new Date(),
        endDate: new Date()
      };
    }

    const stats: LogStats = {
      totalEntries: entries.length,
      byLevel: { [LogLevel.DEBUG]: 0, [LogLevel.INFO]: 0, [LogLevel.WARN]: 0, [LogLevel.ERROR]: 0 },
      byCategory: {},
      errorsByType: {
        VALIDATION_ERROR: 0,
        HTTP_ERROR: 0,
        NETWORK_ERROR: 0,
        TIMEOUT_ERROR: 0,
        FILE_NOT_FOUND: 0,
        FILE_PERMISSION_ERROR: 0,
        DISK_SPACE_ERROR: 0,
        PARSING_ERROR: 0,
        CONFIGURATION_ERROR: 0,
        SCHEDULING_ERROR: 0,
        MEMORY_ERROR: 0,
        SYSTEM_ERROR: 0,
        UNKNOWN_ERROR: 0
      },
      startDate: new Date(Math.min(...entries.map(e => e.timestamp.getTime()))),
      endDate: new Date(Math.max(...entries.map(e => e.timestamp.getTime())))
    };

    entries.forEach(entry => {
      // 按级别统计
      stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
      
      // 按类别统计
      if (entry.category) {
        stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
      }
      
      // 按错误类型统计
      if (entry.errorType) {
        stats.errorsByType[entry.errorType] = (stats.errorsByType[entry.errorType] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * 清理旧日志
   */
  clearOldLogs(): void {
    const maxEntries = 10000;
    if (this.logBuffer.length > maxEntries) {
      this.logBuffer = this.logBuffer.slice(-maxEntries);
    }
  }

  /**
   * 导出日志到文件
   */
  exportLogs(filePath: string, filter?: LogFilter): void {
    let entries = filter ? this.queryLogs(filter) : this.logBuffer;
    
    const logData = entries.map(entry => 
      this.config.enableJsonFormat 
        ? JSON.stringify(entry) 
        : this.formatLogEntry(entry)
    ).join('\n');
    
    fs.writeFileSync(filePath, logData, 'utf8');
  }

  /**
   * 重置日志缓冲区（主要用于测试）
   */
  reset(): void {
    this.logBuffer = [];
  }

  private writeLog(
    level: LogLevel,
    message: string,
    context?: any,
    category?: string,
    taskId?: string,
    errorType?: ErrorType
  ): void {
    if (level >= this.config.level) {
      const entry: LogEntry = {
        id: this.generateLogId(),
        timestamp: new Date(),
        level,
        message,
        context,
        category,
        taskId,
        errorType,
        stackTrace: context?.stack
      };

      this.logBuffer.push(entry);
      this.writeToOutputs(entry);
    }
  }

  private writeToOutputs(entry: LogEntry): void {
    // 输出到控制台
    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }

    // 保存到文件
    if (this.config.enableFile) {
      this.writeToFile(entry);
    }
  }

  private writeToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const timestamp = formatTimestamp(entry.timestamp);

    let logLine = `${timestamp} [${levelName}]`;

    if (entry.category) {
      logLine += ` [${entry.category}]`;
    }

    if (entry.taskId) {
      logLine += ` [${entry.taskId}]`;
    }

    logLine += ` ${entry.message}`;

    // 添加上下文信息（仅在DEBUG级别显示）
    if (entry.context && entry.level === LogLevel.DEBUG) {
      logLine += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logLine);
        break;
      case LogLevel.WARN:
        console.warn(logLine);
        break;
      case LogLevel.INFO:
        console.info(logLine);
        break;
      default:
        console.log(logLine);
    }
  }

  private writeToFile(entry: LogEntry): void {
    try {
      // 检查文件大小，如果超过限制则轮转
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        if (stats.size > this.config.maxFileSize) {
          this.rotateLogFile();
        }
      }

      const logLine = this.config.enableJsonFormat 
        ? JSON.stringify(entry) 
        : this.formatLogEntry(entry);
        
      fs.appendFileSync(this.logFilePath, logLine + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const timestamp = formatTimestamp(entry.timestamp);

    let logLine = `${timestamp} [${levelName}]`;

    if (entry.category) {
      logLine += ` [${entry.category}]`;
    }

    if (entry.taskId) {
      logLine += ` [${entry.taskId}]`;
    }

    logLine += ` ${entry.message}`;

    if (entry.context) {
      logLine += ` | Context: ${JSON.stringify(entry.context)}`;
    }

    return logLine;
  }

  private rotateLogFile(): void {
    try {
      // 确保压缩日志目录存在
      if (!fs.existsSync(this.compressedLogDir)) {
        fs.mkdirSync(this.compressedLogDir, { recursive: true });
      }

      // 获取现有的日志文件列表
      const existingLogs = fs.readdirSync(this.compressedLogDir)
        .filter(file => file.startsWith('app.log.'))
        .sort()
        .reverse();

      // 删除最老的日志文件（如果超过最大文件数）
      if (existingLogs.length >= this.config.maxFiles) {
        const oldestFile = existingLogs[existingLogs.length - 1];
        fs.unlinkSync(path.join(this.compressedLogDir, oldestFile));
      }

      // 生成新的日志文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newLogFileName = `app.log.${timestamp}`;
      const newLogPath = path.join(this.compressedLogDir, newLogFileName);

      // 移动当前日志文件
      fs.renameSync(this.logFilePath, newLogPath);

      // 如果启用压缩，则压缩文件
      if (this.config.enableCompression) {
        const compressedPath = newLogPath + '.gz';
        const gzip = zlib.createGzip();
        const input = fs.createReadStream(newLogPath);
        const output = fs.createWriteStream(compressedPath);
        
        input.pipe(gzip).pipe(output);
        
        // 压缩完成后删除原始文件
        output.on('finish', () => {
          fs.unlinkSync(newLogPath);
        });
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  private ensureLogDirectories(): void {
    try {
      // 确保配置目录存在
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      
      // 确保压缩日志目录存在
      if (!fs.existsSync(this.compressedLogDir)) {
        fs.mkdirSync(this.compressedLogDir, { recursive: true });
      }
    } catch (error) {
      console.error('Failed to create log directories:', error);
    }
  }

  private initializeLogBuffer(): void {
    try {
      // 尝试从现有日志文件加载最近的日志条目
      if (fs.existsSync(this.logFilePath)) {
        const logData = fs.readFileSync(this.logFilePath, 'utf8');
        const lines = logData.split('\n').filter(line => line.trim() !== '');
        
        // 只加载最近的1000条日志到缓冲区
        const recentLines = lines.slice(-1000);
        
        for (const line of recentLines) {
          try {
            if (this.config.enableJsonFormat && line.startsWith('{')) {
              const entry = JSON.parse(line) as LogEntry;
              entry.timestamp = new Date(entry.timestamp);
              this.logBuffer.push(entry);
            }
            // 对于非JSON格式的日志，我们不解析回LogEntry对象
          } catch (parseError) {
            // 忽略解析错误
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize log buffer:', error);
    }
  }

  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}