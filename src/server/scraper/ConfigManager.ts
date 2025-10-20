/**
 * 配置管理模块
 * 负责系统配置的加载、保存和验证
 *
 * @implements {IConfigManager}
 */
import fs from 'fs';
import path from 'path';
import type { ConfigManager as IConfigManager } from '../../shared/types/interfaces.ts';
import type { SystemConfig } from '../../shared/types/scraper.ts';
import { Logger } from '../utils/logger.ts';
import { isValidCronExpression } from '../utils/validation.ts';
import { validateCronInterval } from '../utils/cronValidator.ts';

/**
 * 配置管理器类
 * 管理系统的所有配置项，包括定时任务、黑名单、网络设置等
 */
export class ConfigManager implements IConfigManager {
  /** 配置目录路径 */
  private configDir: string;

  /** 配置文件路径 */
  private configFile: string;

  /** 日志记录器 */
  private logger: Logger;

  /** 默认配置 */
  private defaultConfig: SystemConfig = {
    cron: '0 */6 * * *',
    preferredAddress: '',
    channels: 0,
    blackList: [],
    dedup: true,
    requestDelay: [1, 3],
    maxRetries: 3,
    output: {
      formats: ['m3u'],
      filename: 'channels',
      includeMetadata: true,
      groupBy: 'none',
    },
    network: {
      timeout: 30000,
      maxConcurrentRequests: 10,
      rateLimit: 1,
      userAgentRotation: true,
    },
  };

  /**
   * 获取配置项
   *
   * @param {string} key - 配置键名
   * @returns {any} 配置值
   */
  get<T>(key: string): T | undefined {
    const config = this.loadConfigSilently();
    return (config as any)[key];
  }

  /**
   * 设置配置项
   *
   * @param {string} key - 配置键名
   * @param {any} value - 配置值
   * @returns {void}
   */
  set<T>(key: string, value: T): void {
    const config = this.loadConfigSilently();
    (config as any)[key] = value;
    this.saveConfig(config);
    this.logger.info(`配置项 ${key} 已更新`);
  }

  /**
   * 构造函数
   * @param {string} configDir - 配置文件目录路径
   */
  constructor(configDir: string = './config') {
    this.configDir = configDir;
    this.configFile = path.join(configDir, 'config.json');
    this.logger = new Logger(configDir);

    // 确保配置目录存在
    this.ensureConfigDir();
  }

  /**
   * 加载系统配置
   * 从配置文件加载配置，如果文件不存在则创建默认配置
   *
   * @returns {SystemConfig} 系统配置对象
   */
  loadConfig(): SystemConfig {
    try {
      if (!fs.existsSync(this.configFile)) {
        this.logger.info('配置文件未找到，创建默认配置');
        this.saveConfig(this.defaultConfig);
        return { ...this.defaultConfig };
      }

      const configData = fs.readFileSync(this.configFile, 'utf8');
      const config = JSON.parse(configData) as Partial<SystemConfig>;

      // 合并默认配置和用户配置
      const mergedConfig: SystemConfig = {
        ...this.defaultConfig,
        ...config,
      };

      // 验证配置
      this.validateConfig(mergedConfig);

      return mergedConfig;
    } catch (error) {
      this.logger.error('加载配置失败，使用默认配置', error);
      return { ...this.defaultConfig };
    }
  }

  /**
   * 保存系统配置
   * 将配置保存到配置文件
   *
   * @param {Partial<SystemConfig>} config - 要保存的配置部分
   * @throws {Error} 当保存配置失败时抛出
   */
  saveConfig(config: Partial<SystemConfig>): void {
    try {
      // 加载当前配置
      const currentConfig = this.loadConfigSilently();

      // 合并配置
      const newConfig: SystemConfig = {
        ...currentConfig,
        ...config,
      };

      // 验证新配置
      this.validateConfig(newConfig);

      // 确保配置目录存在
      this.ensureConfigDir();

      // 保存配置
      fs.writeFileSync(
        this.configFile,
        JSON.stringify(newConfig, null, 2),
        'utf8'
      );

      this.logger.info('配置保存成功');
    } catch (error) {
      this.logger.error('保存配置失败', error);
      throw new Error(`保存配置失败: ${(error as Error).message}`);
    }
  }

  addToBlacklist(ip: string): void {
    try {
      const config = this.loadConfig();

      if (!config.blackList.includes(ip)) {
        config.blackList.push(ip);

        // 如果添加的是当前首选地址，清空首选地址
        if (config.preferredAddress === ip) {
          config.preferredAddress = '';
          config.channels = 0;
        }

        this.saveConfig(config);
        this.logger.info(`已将 ${ip} 添加到黑名单`);
      } else {
        this.logger.info(`${ip} 已在黑名单中`);
      }
    } catch (error) {
      this.logger.error(`添加 ${ip} 到黑名单失败`, error);
      throw new Error(`添加IP到黑名单失败: ${(error as Error).message}`);
    }
  }

  isBlacklisted(ip: string): boolean {
    try {
      const config = this.loadConfig();
      return config.blackList.includes(ip);
    } catch (error) {
      this.logger.error(`检查 ${ip} 黑名单状态失败`, error);
      return false;
    }
  }

  removeFromBlacklist(ip: string): void {
    try {
      const config = this.loadConfig();
      const index = config.blackList.indexOf(ip);

      if (index > -1) {
        config.blackList.splice(index, 1);
        this.saveConfig(config);
        this.logger.info(`已从黑名单移除 ${ip}`);
      } else {
        this.logger.info(`${ip} 不在黑名单中`);
      }
    } catch (error) {
      this.logger.error(`从黑名单移除 ${ip} 失败`, error);
      throw new Error(`从黑名单移除IP失败: ${(error as Error).message}`);
    }
  }

  getBlacklist(): string[] {
    try {
      const config = this.loadConfig();
      return [...config.blackList];
    } catch (error) {
      this.logger.error('获取黑名单失败', error);
      return [];
    }
  }

  clearBlacklist(): void {
    try {
      const config = this.loadConfig();
      config.blackList = [];
      this.saveConfig(config);
      this.logger.info('黑名单已清空');
    } catch (error) {
      this.logger.error('清空黑名单失败', error);
      throw new Error(`清空黑名单失败: ${(error as Error).message}`);
    }
  }

  updatePreferredAddress(address: string, channelCount: number): void {
    try {
      const config = this.loadConfig();
      config.preferredAddress = address;
      config.channels = channelCount;
      this.saveConfig(config);
      this.logger.info(
        `Updated preferred address to ${address} with ${channelCount} channels`
      );
    } catch (error) {
      this.logger.error('更新首选地址失败', error);
      throw new Error(`更新首选地址失败: ${(error as Error).message}`);
    }
  }

  private loadConfigSilently(): SystemConfig {
    try {
      if (!fs.existsSync(this.configFile)) {
        return { ...this.defaultConfig };
      }

      const configData = fs.readFileSync(this.configFile, 'utf8');
      const config = JSON.parse(configData) as Partial<SystemConfig>;

      return {
        ...this.defaultConfig,
        ...config,
      };
    } catch (error) {
      return { ...this.defaultConfig };
    }
  }

  private validateConfig(config: SystemConfig): void {
    // 验证cron表达式语法
    if (config.cron && !isValidCronExpression(config.cron)) {
      throw new Error(`Invalid cron expression: ${config.cron}`);
    }

    // 验证cron表达式执行间隔
    if (config.cron) {
      const intervalValidation = validateCronInterval(config.cron, 2);
      if (!intervalValidation.isValid) {
        throw new Error(`Cron执行间隔不符合要求: ${intervalValidation.reason}`);
      }
    }

    // 验证请求延迟范围
    if (config.requestDelay && config.requestDelay.length === 2) {
      const [min, max] = config.requestDelay;
      if (min < 0 || max < 0 || min > max) {
        throw new Error(`Invalid request delay range: [${min}, ${max}]`);
      }
    }

    // 验证最大重试次数
    if (config.maxRetries < 0 || config.maxRetries > 10) {
      throw new Error(`Invalid max retries: ${config.maxRetries}`);
    }

    // 验证频道数量
    if (config.channels < 0) {
      throw new Error(`Invalid channel count: ${config.channels}`);
    }

    // 验证黑名单
    if (!Array.isArray(config.blackList)) {
      throw new Error('Blacklist must be an array');
    }
  }

  private ensureConfigDir(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
        this.logger.info(`创建配置目录: ${this.configDir}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to create config directory: ${this.configDir}`,
        error
      );
      throw new Error(
        `Failed to create config directory: ${(error as Error).message}`
      );
    }
  }
}
