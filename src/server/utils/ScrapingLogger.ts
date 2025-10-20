// 爬取流程专用日志记录器
import { Logger, LogLevel, type LogEntry } from './logger.ts';
import {
  formatTimestamp,
  calculateAverage,
  countByKey,
  shouldFilterLogMessage,
} from './validation.ts';
import type { ScrapingTask, TaskError } from '../../shared/types/scraper.ts';

export interface ScrapingLogEntry extends LogEntry {
  phase?:
    | 'INIT'
    | 'HOTEL_IPS'
    | 'CHANNEL_IPS'
    | 'CHANNEL_LIST'
    | 'FILE_GEN'
    | 'COMPLETE';
  ipAddress?: string;
  channelCount?: number;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
}

export interface ScrapingMetrics {
  startTime: Date;
  endTime?: Date;
  duration?: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalChannels: number;
  processedIPs: number;
  errors: TaskError[];
  averageRequestTime: number;
  requestsPerSecond: number;
}

export class ScrapingLogger extends Logger {
  private metrics: ScrapingMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageRequestTime: 0,
    totalChannels: 0,
    processedIPs: 0,
    startTime: new Date(),
    errors: [],
    requestsPerSecond: 0,
    endTime: undefined,
  };
  private requestTimes: number[] = [];
  private runLog: string[] = []; // 兼容旧系统的runLog

  constructor(configDir: string = './config') {
    super(configDir, { level: LogLevel.INFO });
    this.resetMetrics();
  }

  // 开始新的爬取任务
  startScrapingTask(taskId: string): void {
    this.resetMetrics();
    this.runLog = [];

    this.logStructured({
      level: LogLevel.INFO,
      message: '开始执行爬取任务',
      category: 'SCRAPING',
      taskId,
      phase: 'INIT',
    });

    this.pushLog('-------------------');
    this.pushLog('开始执行任务');
  }

  // 记录爬取阶段
  logPhase(
    phase: ScrapingLogEntry['phase'],
    message: string,
    taskId?: string,
    context?: any
  ): void {
    this.logStructured({
      level: LogLevel.INFO,
      message,
      category: 'SCRAPING',
      taskId,
      phase,
      context,
    });

    this.pushLog(message);
  }

  // 记录IP处理进度
  logIPProgress(
    ipAddress: string,
    channelCount: number,
    current: number,
    total: number,
    taskId?: string
  ): void {
    const percentage = Math.round((current / total) * 100);

    this.logStructured({
      level: LogLevel.INFO,
      message: `处理IP ${ipAddress}: 找到 ${channelCount} 个频道 (${current}/${total}, ${percentage}%)`,
      category: 'SCRAPING',
      taskId,
      phase: 'CHANNEL_IPS',
      ipAddress,
      channelCount,
      progress: { current, total, percentage },
    });

    this.pushLog(`处理IP ${ipAddress}: 找到 ${channelCount} 个频道`);
  }

  // 记录请求性能
  logRequest(
    url: string,
    duration: number,
    success: boolean,
    taskId?: string
  ): void {
    this.requestTimes.push(duration);
    this.metrics.totalRequests++;

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    this.debug(
      `HTTP请求 ${success ? '成功' : '失败'}: ${url} (${duration}ms)`,
      { url, duration, success },
      'HTTP',
      taskId
    );
  }

  // 记录错误
  logScrapingError(error: TaskError, taskId?: string): void {
    this.metrics.errors.push(error);

    this.logStructured({
      level: LogLevel.ERROR,
      message: error.message,
      category: 'SCRAPING',
      taskId,
      context: error.context,
    });

    this.pushLog(`错误: ${error.message}`);
  }

  // 完成爬取任务
  completeScrapingTask(
    taskId: string,
    totalChannels: number,
    processedIPs: number,
    success: boolean
  ): void {
    this.metrics.endTime = new Date();
    this.metrics.duration =
      this.metrics.endTime.getTime() - this.metrics.startTime.getTime();
    this.metrics.totalChannels = totalChannels;
    this.metrics.processedIPs = processedIPs;

    // 计算性能指标
    this.metrics.averageRequestTime = calculateAverage(this.requestTimes);

    if (this.metrics.duration > 0) {
      this.metrics.requestsPerSecond =
        (this.metrics.totalRequests / this.metrics.duration) * 1000;
    }

    const message = success
      ? `任务完成: 获取到 ${totalChannels} 个频道，处理了 ${processedIPs} 个IP地址`
      : `任务失败: 处理了 ${processedIPs} 个IP地址`;

    this.logStructured({
      level: success ? LogLevel.INFO : LogLevel.ERROR,
      message,
      category: 'SCRAPING',
      taskId,
      phase: 'COMPLETE',
      context: this.getMetricsSummary(),
    });

    this.pushLog(message);
    this.pushLog('本次任务执行完成');
  }

  // 兼容旧系统的pushLog函数 - 使用父类的info方法
  pushLog(message: string): void {
    // 使用共享的过滤函数
    if (shouldFilterLogMessage(message)) {
      return;
    }

    const timestamp = formatTimestamp(new Date());
    const logEntry = `${timestamp}  ${message}`;

    this.runLog.push(logEntry);
    // 使用父类的info方法，避免重复实现
    this.info(message);
  }

  // 获取运行日志（兼容旧API）
  getRunLog(): string[] {
    return [...this.runLog];
  }

  // 获取性能指标
  getMetrics(): ScrapingMetrics {
    return { ...this.metrics };
  }

  // 获取性能指标摘要
  getMetricsSummary(): any {
    return {
      duration: this.metrics.duration,
      totalRequests: this.metrics.totalRequests,
      successRate:
        this.metrics.totalRequests > 0
          ? (
              (this.metrics.successfulRequests / this.metrics.totalRequests) *
              100
            ).toFixed(2) + '%'
          : '0%',
      averageRequestTime: Math.round(this.metrics.averageRequestTime),
      requestsPerSecond: this.metrics.requestsPerSecond.toFixed(2),
      totalChannels: this.metrics.totalChannels,
      processedIPs: this.metrics.processedIPs,
      errorCount: this.metrics.errors.length,
    };
  }

  // 获取错误统计
  getErrorStats(): { [key: string]: number } {
    return countByKey(this.metrics.errors, (error) => error.type);
  }

  private resetMetrics(): void {
    this.metrics = {
      startTime: new Date(),
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalChannels: 0,
      processedIPs: 0,
      errors: [],
      averageRequestTime: 0,
      requestsPerSecond: 0,
    };
    this.requestTimes = [];
  }
}
