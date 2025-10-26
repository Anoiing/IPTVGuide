// Cron配置管理模块
import cron from 'node-cron';
import { EnhancedConfigManager } from '../../shared/core/config/EnhancedConfigManager';
import { Logger } from '../utils/logger';
import type { UnifiedSystemConfig } from '../../shared/core/config/schemas';

export interface CronConfig {
  expression: string;
  enabled: boolean;
  timezone: string;
  lastUpdated: Date;
  nextExecution?: Date;
}

export interface CronValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class CronConfigManager {
  private configManager: EnhancedConfigManager;
  private logger: Logger;
  private timezone: string;

  constructor(
    configDir: string = './config',
    timezone: string = 'Asia/Shanghai'
  ) {
    this.configManager = new EnhancedConfigManager({ configDir });
    this.logger = new Logger(configDir);
    this.timezone = timezone;
  }

  /**
   * 获取当前的cron配置
   * @returns cron配置对象
   */
  getCronConfig(): CronConfig | null {
    try {
      const config = this.configManager.getConfig();

      if (!config.cron) {
        return null;
      }

      return {
        expression: config.cron,
        enabled: true,
        timezone: this.timezone,
        lastUpdated: new Date(), // 实际应该从配置文件中读取
        nextExecution: this.calculateNextExecution(config.cron) || undefined,
      };
    } catch (error) {
      this.logger.error('Failed to get cron config', error);
      return null;
    }
  }

  /**
   * 更新cron表达式
   * @param cronExpression 新的cron表达式
   * @returns 是否更新成功
   */
  updateCronExpression(cronExpression: string): boolean {
    try {
      // 验证cron表达式
      const validation = this.validateCronExpression(cronExpression);
      if (!validation.isValid) {
        throw new Error(
          `Invalid cron expression: ${validation.errors.join(', ')}`
        );
      }

      // 更新配置
      this.configManager.set('cron', cronExpression);
      this.configManager.saveConfig();

      this.logger.info(`Cron expression updated to: ${cronExpression}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to update cron expression', error);
      return false;
    }
  }

  /**
   * 禁用定时任务
   * @returns 是否禁用成功
   */
  disableCron(): boolean {
    try {
      this.configManager.set('cron', '');
      this.configManager.saveConfig();
      this.logger.info('Cron disabled');
      return true;
    } catch (error) {
      this.logger.error('Failed to disable cron', error);
      return false;
    }
  }

  /**
   * 启用定时任务（使用默认或上次的cron表达式）
   * @param cronExpression 可选的cron表达式，如果不提供则使用默认值
   * @returns 是否启用成功
   */
  enableCron(cronExpression?: string): boolean {
    try {
      const expression = cronExpression || '0 */6 * * *'; // 默认每6小时执行一次

      // 验证cron表达式
      const validation = this.validateCronExpression(expression);
      if (!validation.isValid) {
        throw new Error(
          `Invalid cron expression: ${validation.errors.join(', ')}`
        );
      }

      this.configManager.set('cron', expression);
      this.configManager.saveConfig();
      this.logger.info(`Cron enabled with expression: ${expression}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to enable cron', error);
      return false;
    }
  }

  /**
   * 验证cron表达式
   * @param cronExpression cron表达式
   * @returns 验证结果
   */
  validateCronExpression(cronExpression: string): CronValidationResult {
    const result: CronValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
    };

    try {
      // 基本格式检查
      if (
        cronExpression === null ||
        cronExpression === undefined ||
        typeof cronExpression !== 'string'
      ) {
        result.errors.push('Cron expression is required and must be a string');
        return result;
      }

      const trimmed = cronExpression.trim();
      if (trimmed.length === 0) {
        result.errors.push('Cron expression cannot be empty');
        return result;
      }

      // 使用node-cron验证
      if (!cron.validate(trimmed)) {
        result.errors.push('Invalid cron expression format');
        return result;
      }

      // 检查是否过于频繁（小于1分钟）
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 1) {
        const minutePart = parts[0];
        if (minutePart === '*') {
          result.warnings.push(
            'Task will run every minute, which may be too frequent'
          );
        }
      }

      // 检查是否过于频繁（每秒执行）
      if (parts.length === 6) {
        const secondPart = parts[0];
        if (secondPart === '*') {
          result.errors.push('Tasks running every second are not recommended');
          return result;
        }
      }

      result.isValid = true;
    } catch (error) {
      result.errors.push(`Validation error: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * 获取预定义的cron表达式模板
   * @returns cron表达式模板列表
   */
  getCronTemplates(): Array<{
    name: string;
    expression: string;
    description: string;
  }> {
    return [
      {
        name: 'every-6-hours',
        expression: '0 */6 * * *',
        description: '每6小时执行一次',
      },
      {
        name: 'every-12-hours',
        expression: '0 */12 * * *',
        description: '每12小时执行一次',
      },
      {
        name: 'daily',
        expression: '0 0 * * *',
        description: '每天午夜执行',
      },
      {
        name: 'daily-morning',
        expression: '0 8 * * *',
        description: '每天早上8点执行',
      },
      {
        name: 'daily-evening',
        expression: '0 20 * * *',
        description: '每天晚上8点执行',
      },
      {
        name: 'weekly',
        expression: '0 0 * * 0',
        description: '每周日午夜执行',
      },
      {
        name: 'monthly',
        expression: '0 0 1 * *',
        description: '每月1号午夜执行',
      },
    ];
  }

  /**
   * 根据模板名称获取cron表达式
   * @param templateName 模板名称
   * @returns cron表达式，如果模板不存在则返回null
   */
  getCronExpressionByTemplate(templateName: string): string | null {
    const template = this.getCronTemplates().find(
      (t) => t.name === templateName
    );
    return template ? template.expression : null;
  }

  /**
   * 计算下次执行时间（简化版本）
   * @param cronExpression cron表达式
   * @returns 下次执行时间，如果无法计算则返回null
   */
  private calculateNextExecution(cronExpression: string): Date | null {
    try {
      // 这里可以使用cron-parser库来精确计算下次执行时间
      // 为了简化，我们暂时返回null
      // 实际项目中建议使用cron-parser库
      return null;
    } catch (error) {
      this.logger.error('Failed to calculate next execution time', error);
      return null;
    }
  }

  /**
   * 重置cron配置为默认值
   * @returns 是否重置成功
   */
  resetToDefault(): boolean {
    try {
      const defaultCron = '0 */6 * * *'; // 重置为默认配置
      this.configManager.set('cron', defaultCron);
      this.configManager.saveConfig();
      this.logger.info(`Cron configuration reset to default: ${defaultCron}`);
      return true;
    } catch (error) {
      this.logger.error('Failed to reset cron configuration', error);
      return false;
    }
  }

  /**
   * 获取cron配置历史（如果有的话）
   * @returns 配置历史数组
   */
  getCronHistory(): Array<{
    expression: string;
    timestamp: Date;
    action: string;
  }> {
    // 这里可以实现配置历史记录功能
    // 为了简化，暂时返回空数组
    return [];
  }

  /**
   * 检查当前配置是否需要重启任务
   * @param newCronExpression 新的cron表达式
   * @returns 是否需要重启
   */
  needsRestart(newCronExpression: string): boolean {
    try {
      const currentConfig = this.getCronConfig();
      if (!currentConfig) {
        return true; // 如果当前没有配置，需要启动
      }

      return currentConfig.expression !== newCronExpression;
    } catch (error) {
      this.logger.error('Failed to check if restart is needed', error);
      return true; // 出错时保守地返回需要重启
    }
  }
}
