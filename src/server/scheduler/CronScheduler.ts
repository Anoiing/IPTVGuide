// Cron调度器模块
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { Logger } from '../utils/logger.ts';
import { ScraperEngine } from '../scraper/ScraperEngine.ts';
import { ConfigManager } from '../scraper/ConfigManager.ts';
import { FileGenerator } from '../scraper/FileGenerator.ts';
import { CronConfigManager } from './CronConfigManager.ts';
import type { ScrapingResult } from '../../shared/types/scraper.ts';

export interface CronSchedulerOptions {
  configDir?: string;
  outputDir?: string;
  timezone?: string;
}

export interface SchedulerStatus {
  isRunning: boolean;
  cronExpression: string | null;
  nextExecution: Date | null;
  lastExecution: Date | null;
  taskCount: number;
}

export class CronScheduler {
  private logger: Logger;
  private scraperEngine: ScraperEngine;
  private configManager: ConfigManager;
  private cronConfigManager: CronConfigManager;
  private fileGenerator: FileGenerator;
  private scheduledTask: ScheduledTask | null = null;
  private timezone: string;
  private lastExecution: Date | null = null;

  constructor(options: CronSchedulerOptions = {}) {
    const {
      configDir = './config',
      outputDir = './output',
      timezone = 'Asia/Shanghai',
    } = options;

    this.timezone = timezone;
    this.logger = new Logger(configDir);
    this.scraperEngine = new ScraperEngine(configDir);
    this.configManager = new ConfigManager(configDir);
    this.cronConfigManager = new CronConfigManager(configDir, timezone);
    this.fileGenerator = new FileGenerator(outputDir);
  }

  /**
   * 启动定时任务
   * @param cronExpression cron表达式
   * @returns 是否启动成功
   */
  start(cronExpression: string): boolean {
    try {
      // 验证cron表达式
      if (!cron.validate(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      // 停止现有任务
      this.stop();

      // 创建新的定时任务
      this.scheduledTask = cron.schedule(
        cronExpression,
        async () => {
          this.logger.info('Executing scheduled scraping task');
          await this.executeScrapingTask();
        },
        {
          scheduled: true,
          timezone: this.timezone,
        }
      );

      this.logger.info(
        `Cron scheduler started with expression: ${cronExpression}`
      );
      return true;
    } catch (error) {
      this.logger.error('Failed to start cron scheduler', error);
      return false;
    }
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      if ('destroy' in this.scheduledTask) {
        (this.scheduledTask as any).destroy();
      }
      this.scheduledTask = null;
      this.logger.info('Cron scheduler stopped');
    }
  }

  /**
   * 重启定时任务
   * @param cronExpression 新的cron表达式
   * @returns 是否重启成功
   */
  restart(cronExpression: string): boolean {
    this.logger.info('Restarting cron scheduler');
    this.stop();
    return this.start(cronExpression);
  }

  /**
   * 获取调度器状态
   * @returns 调度器状态信息
   */
  getStatus(): SchedulerStatus {
    const isRunning = this.scheduledTask !== null;
    let cronExpression: string | null = null;
    let nextExecution: Date | null = null;

    if (this.scheduledTask) {
      try {
        // 从配置中获取cron表达式
        const config = this.configManager.loadConfig();
        cronExpression = config.cron || null;

        // 获取下次执行时间（这是一个近似值，因为node-cron没有直接提供这个API）
        if (cronExpression) {
          // 这里可以使用cron-parser库来计算下次执行时间，但为了简化，我们暂时返回null
          nextExecution = null;
        }
      } catch (error) {
        this.logger.error('Failed to get scheduler status', error);
      }
    }

    return {
      isRunning,
      cronExpression,
      nextExecution,
      lastExecution: this.lastExecution,
      taskCount: isRunning ? 1 : 0,
    };
  }

  /**
   * 验证cron表达式
   * @param cronExpression cron表达式
   * @returns 是否有效
   */
  static validateCronExpression(cronExpression: string): boolean {
    return cron.validate(cronExpression);
  }

  /**
   * 手动执行一次爬取任务
   * @returns 执行结果
   */
  async executeOnce(): Promise<ScrapingResult> {
    this.logger.info('Manual scraping task triggered');
    return await this.executeScrapingTask();
  }

  /**
   * 执行爬取任务的核心方法
   * @returns 爬取结果
   */
  private async executeScrapingTask(): Promise<ScrapingResult> {
    try {
      this.lastExecution = new Date();
      this.logger.info('Starting scraping task');

      const result: ScrapingResult = await this.scraperEngine.startScraping();

      if (result.success && result.totalChannels > 0) {
        // 生成输出文件
        this.fileGenerator.generateJSON(result.channelsByIP);
        this.fileGenerator.generateTXT(result.channelsByIP);
        this.fileGenerator.generateM3U(result.channelsByIP);

        // 更新首选地址（选择频道数最多的IP）
        const bestIP = Object.entries(result.channelsByIP).sort(
          ([, a], [, b]) => b.length - a.length
        )[0];

        if (bestIP) {
          this.configManager.updatePreferredAddress(
            bestIP[0],
            bestIP[1].length
          );
        }

        this.logger.info(
          `Scraping completed successfully: ${
            result.totalChannels
          } channels from ${Object.keys(result.channelsByIP).length} IPs`
        );
      } else {
        this.logger.error(
          'Scraping failed or no channels found',
          result.errors
        );
      }

      return result;
    } catch (error) {
      this.logger.error('Scraping task failed', error);
      throw error;
    }
  }

  /**
   * 从配置文件初始化定时任务
   * @returns 是否初始化成功
   */
  initializeFromConfig(): boolean {
    try {
      const config = this.configManager.loadConfig();
      if (config.cron) {
        return this.start(config.cron);
      }
      return true; // 没有配置cron也算成功
    } catch (error) {
      this.logger.error('Failed to initialize scheduler from config', error);
      return false;
    }
  }

  /**
   * 更新cron配置并重启任务
   * @param cronExpression 新的cron表达式
   * @returns 是否更新成功
   */
  updateCronConfig(cronExpression: string): boolean {
    try {
      // 验证cron表达式
      const validation =
        this.cronConfigManager.validateCronExpression(cronExpression);
      if (!validation.isValid) {
        this.logger.error(
          `Invalid cron expression: ${validation.errors.join(', ')}`
        );
        return false;
      }

      // 检查是否需要重启
      if (this.cronConfigManager.needsRestart(cronExpression)) {
        // 更新配置
        if (!this.cronConfigManager.updateCronExpression(cronExpression)) {
          return false;
        }

        // 重启任务
        return this.restart(cronExpression);
      }

      return true;
    } catch (error) {
      this.logger.error('Failed to update cron config', error);
      return false;
    }
  }

  /**
   * 获取cron配置信息
   * @returns cron配置对象
   */
  getCronConfig() {
    return this.cronConfigManager.getCronConfig();
  }

  /**
   * 获取cron表达式模板
   * @returns 模板列表
   */
  getCronTemplates() {
    return this.cronConfigManager.getCronTemplates();
  }

  /**
   * 验证cron表达式
   * @param cronExpression cron表达式
   * @returns 验证结果
   */
  validateCronExpression(cronExpression: string) {
    return this.cronConfigManager.validateCronExpression(cronExpression);
  }

  /**
   * 启用定时任务
   * @param cronExpression 可选的cron表达式
   * @returns 是否启用成功
   */
  enableCron(cronExpression?: string): boolean {
    try {
      if (!this.cronConfigManager.enableCron(cronExpression)) {
        return false;
      }

      const config = this.cronConfigManager.getCronConfig();
      if (config) {
        return this.start(config.expression);
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to enable cron', error);
      return false;
    }
  }

  /**
   * 禁用定时任务
   * @returns 是否禁用成功
   */
  disableCron(): boolean {
    try {
      this.stop();
      return this.cronConfigManager.disableCron();
    } catch (error) {
      this.logger.error('Failed to disable cron', error);
      return false;
    }
  }

  /**
   * 重置cron配置为默认值
   * @returns 是否重置成功
   */
  resetCronConfig(): boolean {
    try {
      if (!this.cronConfigManager.resetToDefault()) {
        return false;
      }

      const config = this.cronConfigManager.getCronConfig();
      if (config) {
        return this.restart(config.expression);
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to reset cron config', error);
      return false;
    }
  }

  /**
   * 销毁调度器，清理资源
   */
  destroy(): void {
    this.stop();
    this.logger.info('Cron scheduler destroyed');
  }
}
