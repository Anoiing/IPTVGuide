// 集成的爬取系统 - 简化版本
import { ScraperEngine } from '../scraper/ScraperEngine';
import { Logger } from '../logging/Logger';
import { progressMonitor } from './ProgressMonitor';
import { monitoringService } from './MonitoringService';
import { errorHandler } from '../../shared/core/ErrorHandler';
import type { ScrapingResult } from '../../shared/types/scraper';

export class IntegratedScrapingSystem {
  private scraperEngine: ScraperEngine;
  private logger: Logger;
  private configDir: string;

  constructor(configDir: string = './config') {
    this.configDir = configDir;

    // 初始化日志系统
    this.logger = new Logger(configDir);

    // 初始化爬取引擎
    this.scraperEngine = new ScraperEngine(configDir);
  }

  // 启动完整的爬取系统
  async startScraping(): Promise<ScrapingResult> {
    const taskId = `scraping-${Date.now()}`;

    try {
      // 启动监控服务
      monitoringService.start();

      // 创建任务
      const task = progressMonitor.createTask(taskId, '频道爬取任务');

      // 更新任务状态
      progressMonitor.updateTask(taskId, {
        status: 'RUNNING',
        currentItem: '初始化爬取系统',
      });

      // 执行爬取
      const result = await this.executeScrapingWithMonitoring(taskId);

      // 完成任务
      progressMonitor.updateTask(taskId, {
        status: result.success ? 'COMPLETED' : 'FAILED',
        progress: 100,
      });

      return result;
    } catch (error) {
      progressMonitor.updateTask(taskId, {
        status: 'FAILED',
        errors: [(error as Error).message],
      });

      return {
        success: false,
        totalChannels: 0,
        processedIPs: [],
        timestamp: new Date(),
        errors: [{
          type: 'SYSTEM',
          message: (error as Error).message,
          timestamp: new Date()
        }]
      };
    } finally {
      // 停止监控服务
      monitoringService.stop();
    }
  }

  // 获取日志记录器（用于外部访问）
  getLogger() {
    return this.logger;
  }

  // 获取进度监控器（用于外部访问）
  getProgressMonitor() {
    return progressMonitor;
  }

  // 获取监控服务（用于外部访问）
  getMonitoringService() {
    return monitoringService;
  }

  // 停止爬取
  stopScraping(): void {
    this.scraperEngine.stopScraping();
    monitoringService.stop();
  }

  private async executeScrapingWithMonitoring(
    taskId: string
  ): Promise<ScrapingResult> {
    const startTime = Date.now();

    try {
      // 记录性能指标
      progressMonitor.recordMetrics(taskId, {
        requestsPerSecond: 0,
        averageResponseTime: 0,
        successRate: 100,
        uptime: process.uptime(),
      });

      // 执行实际的爬取
      const result = await this.scraperEngine.startScraping();

      const duration = Date.now() - startTime;

      // 记录完成后的性能指标
      const processedCount = Array.isArray(result.processedIPs) ? result.processedIPs.length : result.processedIPs;
      progressMonitor.recordMetrics(taskId, {
        requestsPerSecond: processedCount / (duration / 1000),
        averageResponseTime: duration / Math.max(processedCount, 1),
        successRate: result.success ? 100 : 0,
        uptime: process.uptime(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // 报告错误
      progressMonitor.reportError({
        taskId,
        errorType: 'SCRAPING_ERROR',
        errorMessage: (error as Error).message,
        context: { duration },
      });

      throw error;
    }
  }
}

// 使用示例
export async function createAndRunIntegratedSystem(
  configDir?: string
): Promise<ScrapingResult> {
  const system = new IntegratedScrapingSystem(configDir);

  try {
    const result = await system.startScraping();

    // 输出最终统计
    const stats = progressMonitor.getOverallStatistics();
    console.log('最终监控报告:', stats);

    return result;
  } catch (error) {
    errorHandler.handle(error, {
      context: 'IntegratedScrapingSystem.executeScrapingWithMonitoring'
    });
    throw error;
  }
}
