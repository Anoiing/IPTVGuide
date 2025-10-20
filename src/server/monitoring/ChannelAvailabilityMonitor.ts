/**
 * 频道可用性监测系统实现
 */

import cron from 'node-cron';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import type { 
  ChannelCheckConfig, 
  CheckStatus, 
  ChannelCheckResult, 
  ChannelValidationResult, 
  ScrapingDecision,
  ChannelCheck,
  NotificationConfig,
  ChannelAvailabilityMonitor
} from './types.ts';
import type { ChannelInfo } from '../../shared/types/scraper.ts';
import { Logger } from '../utils/logger.ts';
import { ConfigManager } from '../scraper/ConfigManager.ts';
import { errorHandler, ErrorType } from '../../shared/core/ErrorHandler.ts';

export class ChannelAvailabilityMonitorImpl implements ChannelAvailabilityMonitor {
  private configManager: ConfigManager;
  private logger: Logger;
  private checks: Map<string, ChannelCheck> = new Map();
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();
  private dataDir: string;

  constructor(configDir: string = './config', dataDir: string = './output') {
    this.configManager = new ConfigManager(configDir);
    this.logger = new Logger(configDir);
    this.dataDir = dataDir;
    
    // 确保数据目录存在
    this.ensureDataDirectory();
    
    // 加载已保存的检查任务
    this.loadChecks();
  }

  /**
   * 安排频道检查任务
   */
  scheduleCheck(config: ChannelCheckConfig): string {
    try {
      const checkId = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const check: ChannelCheck = {
        id: checkId,
        config,
        status: {
          checkId,
          status: 'SCHEDULED',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      this.checks.set(checkId, check);
      
      // 安排定时任务
      if (config.cronExpression) {
        const task = cron.schedule(config.cronExpression, () => {
          this.executeCheck(checkId);
        });
        
        this.scheduledTasks.set(checkId, task);
      }
      
      // 保存检查任务
      this.saveChecks();
      
      this.logger.info(`Scheduled channel check: ${checkId}`, { config }, 'MONITOR');
      
      return checkId;
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'scheduleCheck' 
      });
      this.logger.error('Failed to schedule channel check', appError, 'MONITOR');
      throw appError;
    }
  }

  /**
   * 取消频道检查任务
   */
  cancelCheck(checkId: string): boolean {
    try {
      const check = this.checks.get(checkId);
      if (!check) {
        return false;
      }
      
      // 停止定时任务
      const task = this.scheduledTasks.get(checkId);
      if (task) {
        task.stop();
        this.scheduledTasks.delete(checkId);
      }
      
      // 删除检查任务
      this.checks.delete(checkId);
      
      // 保存检查任务
      this.saveChecks();
      
      this.logger.info(`Cancelled channel check: ${checkId}`, {}, 'MONITOR');
      
      return true;
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'cancelCheck' 
      });
      this.logger.error('Failed to cancel channel check', appError, 'MONITOR');
      return false;
    }
  }

  /**
   * 获取检查状态
   */
  getCheckStatus(checkId: string): CheckStatus {
    const check = this.checks.get(checkId);
    if (!check) {
      throw new Error(`Check not found: ${checkId}`);
    }
    
    return check.status;
  }

  /**
   * 获取所有检查任务
   */
  getAllChecks(): ChannelCheck[] {
    return Array.from(this.checks.values());
  }

  /**
   * 验证频道URL列表
   */
  async validateChannelUrls(
    channels: ChannelInfo[]
  ): Promise<ChannelValidationResult[]> {
    this.logger.info(`Validating ${channels.length} channels`, {}, 'MONITOR');
    
    const results: ChannelValidationResult[] = [];
    
    for (const channel of channels) {
      try {
        const result = await this.checkSingleChannel(channel);
        results.push(result);
      } catch (error) {
        const appError = errorHandler.handle(error, { 
          component: 'ChannelAvailabilityMonitor', 
          operation: 'validateChannelUrls',
          channel: channel.name
        });
        
        results.push({
          channel,
          isAvailable: false,
          errorMessage: appError.message,
          checkedAt: new Date(),
        });
      }
    }
    
    return results;
  }

  /**
   * 检查单个频道
   */
  async checkSingleChannel(channel: ChannelInfo): Promise<ChannelValidationResult> {
    const startTime = Date.now();
    
    try {
      // 使用HEAD请求检查频道可用性
      const response = await axios.head(channel.url, {
        timeout: 10000, // 10秒超时
        validateStatus: (status) => status < 500, // 接受4xx状态码
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        channel,
        isAvailable: response.status >= 200 && response.status < 400,
        responseTime,
        httpStatus: response.status,
        checkedAt: new Date(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        channel,
        isAvailable: false,
        responseTime,
        errorMessage: (error as Error).message || 'Unknown error',
        checkedAt: new Date(),
      };
    }
  }

  /**
   * 检查可用性并决定是否需要重新爬取
   */
  async checkAvailabilityAndScrapeIfNeeded(): Promise<ScrapingDecision> {
    try {
      // 获取最新的检查结果
      const latestResult = this.getLatestCheckResult();
      
      // 如果没有检查结果，触发爬取
      if (!latestResult) {
        return {
          shouldScrape: true,
          reason: 'NO_RECENT_DATA',
        };
      }
      
      // 获取系统配置
      const config = this.configManager.loadConfig();
      
      // 检查可用性阈值
      const availabilityThreshold = config.availabilityThreshold || 80; // 默认80%
      
      if (latestResult.availabilityRate < availabilityThreshold) {
        return {
          shouldScrape: true,
          reason: 'AVAILABILITY_LOW',
          availabilityRate: latestResult.availabilityRate,
          lastCheckTime: latestResult.timestamp,
        };
      }
      
      // 检查最后检查时间
      const maxDaysSinceLastScrape = config.maxDaysSinceLastScrape || 7; // 默认7天
      const daysSinceLastCheck = latestResult.timestamp 
        ? (Date.now() - latestResult.timestamp.getTime()) / (1000 * 60 * 60 * 24)
        : Infinity;
        
      if (daysSinceLastCheck > maxDaysSinceLastScrape) {
        return {
          shouldScrape: true,
          reason: 'NO_RECENT_DATA',
          lastCheckTime: latestResult.timestamp,
        };
      }
      
      // 可用性正常，不需要重新爬取
      return {
        shouldScrape: false,
        reason: 'AVAILABILITY_OK',
        availabilityRate: latestResult.availabilityRate,
        lastCheckTime: latestResult.timestamp,
      };
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'checkAvailabilityAndScrapeIfNeeded' 
      });
      this.logger.error('Failed to check availability and decide on scraping', appError, 'MONITOR');
      
      // 出错时默认不触发爬取
      return {
        shouldScrape: false,
        reason: 'AVAILABILITY_OK',
      };
    }
  }

  /**
   * 执行检查任务
   */
  private async executeCheck(checkId: string): Promise<void> {
    const check = this.checks.get(checkId);
    if (!check) {
      this.logger.warn(`Check not found: ${checkId}`, {}, 'MONITOR');
      return;
    }
    
    try {
      // 更新检查状态
      check.status = {
        ...check.status,
        status: 'RUNNING',
        lastRunTime: new Date(),
      };
      
      this.checks.set(checkId, check);
      
      this.logger.info(`Starting channel check: ${checkId}`, { 
        config: check.config 
      }, 'MONITOR');
      
      // 获取频道列表
      const channels = await this.getChannelsToCheck(check.config);
      
      // 更新进度
      check.status.progress = {
        total: channels.length,
        checked: 0,
      };
      
      this.checks.set(checkId, check);
      
      // 执行检查
      const results = await this.performChannelChecks(channels, check.config);
      
      // 生成检查结果
      const checkResult: ChannelCheckResult = {
        totalChecked: channels.length,
        availableCount: results.filter(r => r.isAvailable).length,
        unavailableCount: results.filter(r => !r.isAvailable).length,
        availabilityRate: channels.length > 0 
          ? (results.filter(r => r.isAvailable).length / channels.length) * 100
          : 0,
        workingChannels: results.filter(r => r.isAvailable),
        failedChannels: results.filter(r => !r.isAvailable),
        checkDuration: results.reduce((sum, r) => sum + (r.responseTime || 0), 0),
        timestamp: new Date(),
        summary: this.generateSummary(results),
      };
      
      // 更新检查状态
      check.status = {
        ...check.status,
        status: 'COMPLETED',
        results: checkResult,
      };
      
      this.checks.set(checkId, check);
      
      this.logger.info(`Channel check completed: ${checkId}`, { 
        available: checkResult.availableCount,
        total: checkResult.totalChecked,
        rate: checkResult.availabilityRate.toFixed(2) + '%'
      }, 'MONITOR');
      
      // 保存检查结果
      this.saveCheckResult(checkId, checkResult);
      
      // 发送通知（如果需要）
      if (check.config.notificationConfig?.enabled) {
        await this.sendNotifications(check.config.notificationConfig, checkResult);
      }
      
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'executeCheck',
        checkId
      });
      
      // 更新检查状态为失败
      check.status = {
        ...check.status,
        status: 'FAILED',
      };
      
      this.checks.set(checkId, check);
      
      this.logger.error('Channel check failed', appError, 'MONITOR');
    }
  }

  /**
   * 获取要检查的频道列表
   */
  private async getChannelsToCheck(config: ChannelCheckConfig): Promise<ChannelInfo[]> {
    try {
      // 从输出目录加载频道数据
      const channelsPath = path.join(this.dataDir, 'channels.json');
      
      if (!fs.existsSync(channelsPath)) {
        this.logger.warn('Channels file not found', { path: channelsPath }, 'MONITOR');
        return [];
      }
      
      const channelsData = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
      let allChannels: ChannelInfo[] = [];
      
      // 提取所有频道
      for (const ip in channelsData) {
        allChannels = allChannels.concat(channelsData[ip]);
      }
      
      // 根据检查类型过滤频道
      switch (config.checkType) {
        case 'SAMPLE_CHECK':
          // 抽样检查
          const sampleSize = config.sampleSize || Math.min(50, Math.floor(allChannels.length * 0.1));
          return this.sampleChannels(allChannels, sampleSize);
          
        case 'PRIORITY_CHECK':
          // 优先检查指定频道
          if (config.priorityChannels && config.priorityChannels.length > 0) {
            return allChannels.filter(channel => 
              config.priorityChannels!.includes(channel.name)
            );
          }
          return allChannels;
          
        case 'FULL_CHECK':
        default:
          // 全量检查
          return allChannels;
      }
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'getChannelsToCheck' 
      });
      this.logger.error('Failed to get channels for checking', appError, 'MONITOR');
      return [];
    }
  }

  /**
   * 对频道进行抽样
   */
  private sampleChannels(channels: ChannelInfo[], sampleSize: number): ChannelInfo[] {
    // 简单随机抽样
    const shuffled = [...channels].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, sampleSize);
  }

  /**
   * 执行频道检查
   */
  private async performChannelChecks(
    channels: ChannelInfo[], 
    config: ChannelCheckConfig
  ): Promise<ChannelValidationResult[]> {
    const results: ChannelValidationResult[] = [];
    const concurrencyLimit = 10; // 并发限制
    
    // 分批处理以控制并发
    for (let i = 0; i < channels.length; i += concurrencyLimit) {
      const batch = channels.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(channel => this.checkSingleChannel(channel));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // 更新进度
      const checkId = Object.keys(this.checks).find(id => 
        this.checks.get(id)?.config === config
      );
      
      if (checkId) {
        const check = this.checks.get(checkId)!;
        check.status.progress = {
          ...check.status.progress!,
          checked: Math.min(i + concurrencyLimit, channels.length),
        };
        this.checks.set(checkId, check);
      }
    }
    
    return results;
  }

  /**
   * 生成检查结果摘要
   */
  private generateSummary(results: ChannelValidationResult[]): ChannelCheckResult['summary'] {
    const byGroup: Record<string, { total: number; available: number; rate: number }> = {};
    const failureReasons: Record<string, number> = {};
    
    for (const result of results) {
      // 按分组统计
      const group = result.channel.group || 'Unknown';
      if (!byGroup[group]) {
        byGroup[group] = { total: 0, available: 0, rate: 0 };
      }
      
      byGroup[group].total++;
      if (result.isAvailable) {
        byGroup[group].available++;
      }
      
      byGroup[group].rate = (byGroup[group].available / byGroup[group].total) * 100;
      
      // 统计失败原因
      if (!result.isAvailable && result.errorMessage) {
        const reason = result.errorMessage.includes('timeout') 
          ? 'Timeout' 
          : result.errorMessage.includes('network') 
          ? 'Network Error' 
          : 'Other Error';
          
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      }
    }
    
    // 获取最常见的失败原因
    const topFailureReasons = Object.entries(failureReasons)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));
    
    return {
      byGroup,
      topFailureReasons,
    };
  }

  /**
   * 获取最新的检查结果
   */
  private getLatestCheckResult(): ChannelCheckResult | null {
    try {
      const resultsDir = path.join(this.dataDir, 'monitoring');
      if (!fs.existsSync(resultsDir)) {
        return null;
      }
      
      const files = fs.readdirSync(resultsDir)
        .filter(file => file.startsWith('check_result_') && file.endsWith('.json'))
        .sort()
        .reverse();
        
      if (files.length === 0) {
        return null;
      }
      
      const latestFile = path.join(resultsDir, files[0]);
      const resultData = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
      
      return {
        ...resultData,
        timestamp: new Date(resultData.timestamp),
        workingChannels: resultData.workingChannels || [],
        failedChannels: resultData.failedChannels || [],
      };
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'getLatestCheckResult' 
      });
      this.logger.error('Failed to get latest check result', appError, 'MONITOR');
      return null;
    }
  }

  /**
   * 保存检查结果
   */
  private saveCheckResult(checkId: string, result: ChannelCheckResult): void {
    try {
      const resultsDir = path.join(this.dataDir, 'monitoring');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      
      const fileName = `check_result_${checkId}_${result.timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
      const filePath = path.join(resultsDir, fileName);
      
      fs.writeFileSync(filePath, JSON.stringify(result, null, 2), 'utf8');
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'saveCheckResult' 
      });
      this.logger.error('Failed to save check result', appError, 'MONITOR');
    }
  }

  /**
   * 发送通知
   */
  private async sendNotifications(
    config: NotificationConfig, 
    result: ChannelCheckResult
  ): Promise<void> {
    try {
      // Webhook通知
      if (config.webhookUrl) {
        await this.sendWebhookNotification(config.webhookUrl, result);
      }
      
      // 邮件通知（简化实现）
      if (config.emailConfig) {
        this.logger.info('Email notification would be sent', { 
          to: config.emailConfig.to 
        }, 'MONITOR');
      }
    } catch (error) {
      const appError = errorHandler.handle(error, { 
        component: 'ChannelAvailabilityMonitor', 
        operation: 'sendNotifications' 
      });
      this.logger.error('Failed to send notifications', appError, 'MONITOR');
    }
  }

  /**
   * 发送Webhook通知
   */
  private async sendWebhookNotification(
    webhookUrl: string, 
    result: ChannelCheckResult
  ): Promise<void> {
    try {
      await axios.post(webhookUrl, {
        text: `频道可用性检查完成\n可用率: ${result.availabilityRate.toFixed(2)}%\n检查时间: ${result.timestamp.toLocaleString()}\n总频道数: ${result.totalChecked}\n可用频道数: ${result.availableCount}\n不可用频道数: ${result.unavailableCount}`,
      });
    } catch (error) {
      const errorObj = error as any;
      const appError = errorHandler.handleHttpError(webhookUrl, errorObj.response?.status || 500, (error as Error).message || 'Unknown error');
      this.logger.error('Failed to send webhook notification', appError, 'MONITOR');
    }
  }

  /**
   * 确保数据目录存在
   */
  private ensureDataDirectory(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      
      const resultsDir = path.join(this.dataDir, 'monitoring');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
    } catch (error) {
      const appError = errorHandler.handleFileSystemError('create directory', this.dataDir, error);
      this.logger.error('Failed to ensure data directories', appError, 'MONITOR');
    }
  }

  /**
   * 保存检查任务
   */
  private saveChecks(): void {
    try {
      const checksDir = path.join(this.dataDir, 'monitoring');
      if (!fs.existsSync(checksDir)) {
        fs.mkdirSync(checksDir, { recursive: true });
      }
      
      const checksFile = path.join(checksDir, 'scheduled_checks.json');
      const checksData = Array.from(this.checks.values()).map(check => ({
        ...check,
        createdAt: check.createdAt.toISOString(),
        updatedAt: check.updatedAt.toISOString(),
        status: {
          ...check.status,
          lastRunTime: check.status.lastRunTime?.toISOString(),
          nextRunTime: check.status.nextRunTime?.toISOString(),
        }
      }));
      
      fs.writeFileSync(checksFile, JSON.stringify(checksData, null, 2), 'utf8');
    } catch (error) {
      const appError = errorHandler.handleFileSystemError('save checks', 'scheduled_checks.json', error);
      this.logger.error('Failed to save scheduled checks', appError, 'MONITOR');
    }
  }

  /**
   * 加载检查任务
   */
  private loadChecks(): void {
    try {
      const checksDir = path.join(this.dataDir, 'monitoring');
      const checksFile = path.join(checksDir, 'scheduled_checks.json');
      
      if (!fs.existsSync(checksFile)) {
        return;
      }
      
      const checksData = JSON.parse(fs.readFileSync(checksFile, 'utf8'));
      
      for (const checkData of checksData) {
        const check: ChannelCheck = {
          ...checkData,
          createdAt: new Date(checkData.createdAt),
          updatedAt: new Date(checkData.updatedAt),
          status: {
            ...checkData.status,
            lastRunTime: checkData.status.lastRunTime ? new Date(checkData.status.lastRunTime) : undefined,
            nextRunTime: checkData.status.nextRunTime ? new Date(checkData.status.nextRunTime) : undefined,
          }
        };
        
        this.checks.set(check.id, check);
      }
    } catch (error) {
      const appError = errorHandler.handleFileSystemError('load checks', 'scheduled_checks.json', error);
      this.logger.error('Failed to load scheduled checks', appError, 'MONITOR');
    }
  }
}