/**
 * 爬取引擎模块
 * 负责从数据源爬取IPTV频道信息的核心模块
 * 
 * @implements {IScraperEngine}
 */
import type { ScraperEngine as IScraperEngine } from '../../shared/types/interfaces.js';
import type {
  ScrapingResult,
  ScrapingStatus,
  ChannelInfo,
  ScrapingTask,
  ScrapingDecision,
} from '../../shared/core/types/index.js';
import { HttpClient } from './HttpClient.js';
import { HtmlParser } from './HtmlParser.js';
import { Logger } from '../utils/logger.js';
import { delay, randomDelay } from '../utils/delay.js';
import { errorHandler, ErrorType } from '../../shared/core/ErrorHandler.js';
import { EnhancedHttpClient } from '../http/index.js';
import { ConfigManager } from './ConfigManager.js';

/**
 * 爬取引擎类
 * 管理整个爬取流程，包括数据获取、解析和处理
 */
export class ScraperEngine implements IScraperEngine {
  /** 标准HTTP客户端 */
  private httpClient: HttpClient;
  
  /** 增强HTTP客户端，支持连接池和缓存 */
  private enhancedHttpClient: EnhancedHttpClient;
  
  /** HTML解析器 */
  private htmlParser: HtmlParser;
  
  /** 日志记录器 */
  private logger: Logger;
  
  /** 当前爬取任务 */
  private currentTask: ScrapingTask | null = null;
  
  /** 停止标志 */
  private shouldStop: boolean = false;
  
  /** 配置目录路径 */
  private configDir: string;

  /** 配置管理器 */
  private configManager: ConfigManager;

  /** 当前状态 */
  private status: ScrapingStatus = 'IDLE';

  /**
   * 构造函数
   * @param {string} configDir - 配置文件目录路径
   */
  constructor(configDir: string = './config') {
    this.configDir = configDir;
    this.httpClient = new HttpClient(configDir);
    this.enhancedHttpClient = new EnhancedHttpClient(configDir, {
      maxConcurrentRequests: 5,
      rateLimit: 2, // 每秒最多2个请求
      enableCaching: true,
      cacheTTL: 300000, // 5分钟缓存
      timeout: 30000,
      maxRetries: 3
    });
    this.htmlParser = new HtmlParser(configDir);
    this.logger = new Logger(configDir);
    this.configManager = new ConfigManager(configDir);

    // 设置默认的请求配置
    this.httpClient.setRandomDelay(true, 3, 6);
    this.httpClient.setRateLimit(0.2); // 每5秒一个请求
  }

  // 获取黑名单列表
  private getBlacklist(): string[] {
    try {
      const { ConfigManager } = require('./ConfigManager.js');
      const configManager = new ConfigManager(this.configDir);
      return configManager.getBlacklist();
    } catch (error) {
      this.logger.error('获取黑名单失败', error);
      return [];
    }
  }

  // 获取当前首选地址
  private getCurrentPreferredAddress(): string {
    try {
      const { ConfigManager } = require('./ConfigManager.js');
      const configManager = new ConfigManager(this.configDir);
      const config = configManager.loadConfig();
      return config.preferredAddress || '';
    } catch (error) {
      this.logger.error('获取当前首选地址失败', error);
      return '';
    }
  }

  // 提取IP地址的主机部分（去除端口号）
  private extractHostFromAddress(address: string): string {
    if (!address) return '';

    // 处理IPv4地址（可能带端口号）
    if (address.includes(':')) {
      // 检查是否是IPv6地址（包含多个冒号）
      const colonCount = (address.match(/:/g) || []).length;
      if (colonCount === 1) {
        // IPv4:port 格式
        return address.split(':')[0];
      }
      // IPv6地址，暂时返回原地址
      return address;
    }

    // 纯IP地址，直接返回
    return address;
  }

  // 过滤黑名单IP并随机选择
  private filterAndRandomSelect(ips: string[], count: number = 1): string[] {
    const blacklist = this.getBlacklist();

    // 过滤掉黑名单中的IP
    const availableIPs = ips.filter((ip) => !blacklist.includes(ip));

    if (availableIPs.length === 0) {
      this.logger.warn('所有IP都在黑名单中，将使用原始列表');
      return ips.slice(0, count);
    }

    this.logger.info(
      `过滤黑名单后，从 ${ips.length} 个IP中筛选出 ${availableIPs.length} 个可用IP`
    );

    // 随机打乱数组并选择指定数量
    const shuffled = [...availableIPs].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    this.logger.info(
      `随机选择了 ${selected.length} 个IP: ${selected.join(', ')}`
    );

    return selected;
  }

  /**
   * 启动爬取流程
   * 执行完整的频道数据爬取过程
   * 
   * @returns {Promise<ScrapingResult>} 爬取结果
   * @throws {Error} 当爬取过程中发生错误时抛出
   * 
   * @example
   * ```typescript
   * const scraper = new ScraperEngine('./config');
   * const result = await scraper.startScraping();
   * console.log('爬取成功:', result.success);
   * ```
   */
  async startScraping(): Promise<ScrapingResult> {
    if (this.currentTask && this.currentTask.status === 'RUNNING') {
      throw new Error('Scraping is already in progress');
    }

    this.shouldStop = false;
    this.currentTask = {
      id: `scraping-${Date.now()}`,
      status: 'RUNNING',
      startTime: new Date(),
      progress: {
        currentStep: 'Initializing',
        processedIPs: 0,
        totalIPs: 0,
        foundChannels: 0,
      },
      errors: [],
    };

    this.logger.info('开始爬取流程');

    try {
      const result: ScrapingResult = {
        success: false,
        channelsByIP: {},
        totalChannels: 0,
        processedIPs: [],
        errors: [],
        timestamp: new Date(),
      };

      // 步骤0: 检查当前已有的执行结果IP是否在Hotel IP列表中
      const currentPreferredAddress = this.getCurrentPreferredAddress();
      if (currentPreferredAddress) {
        this.updateProgress('检查当前执行结果是否仍然有效');

        // 获取Hotel IPTV的基础IP列表
        const hotelIPs = await this.getHotelIPs();

        if (this.shouldStop) {
          return this.createStoppedResult();
        }

        // 提取当前首选地址的主机部分（去除端口号）
        const currentHost = this.extractHostFromAddress(
          currentPreferredAddress
        );

        // 检查当前首选地址的主机部分是否在Hotel IP列表中
        if (hotelIPs.includes(currentHost)) {
          this.logger.info(
            `当前首选地址 ${currentPreferredAddress} (主机: ${currentHost}) 仍在Hotel IP列表中，跳过爬取逻辑`
          );

          // 返回成功结果，表示不需要重新爬取
          this.currentTask.status = 'IDLE';
          this.currentTask.endTime = new Date();

          return {
            success: true,
            channelsByIP: {},
            totalChannels: 0,
            processedIPs: [],
            errors: [],
            skipReason: `当前首选地址 ${currentPreferredAddress} 仍然有效，跳过爬取`,
            timestamp: new Date(),
          };
        } else {
          this.logger.info(
            `当前首选地址 ${currentPreferredAddress} (主机: ${currentHost}) 不在Hotel IP列表中，继续执行爬取`
          );
        }
      }

      // 步骤1: 获取Hotel IPTV的基础IP列表
      this.updateProgress('获取Hotel IPTV页面');
      const hotelIPs = await this.getHotelIPs();

      if (this.shouldStop) {
        return this.createStoppedResult();
      }

      if (hotelIPs.length === 0) {
        throw new Error('未找到Hotel IPTV IP地址');
      }

      this.currentTask.progress.totalIPs = hotelIPs.length;
      this.logger.info(`找到 ${hotelIPs.length} 个Hotel IPTV IP地址`);

      // 步骤2: 过滤黑名单并随机选择1个基础IP获取详细的频道IP列表
      const allChannelIPs: string[] = [];

      // 过滤黑名单并随机选择1个Hotel IP
      const selectedHotelIPs = this.filterAndRandomSelect(hotelIPs, 1);

      if (selectedHotelIPs.length === 0) {
        throw new Error('没有可用的Hotel IPTV IP地址（可能都在黑名单中）');
      }

      this.logger.info(
        `从 ${hotelIPs.length} 个Hotel IP中过滤黑名单后随机选择 ${selectedHotelIPs.length} 个进行处理`
      );
      this.currentTask.progress.totalIPs = selectedHotelIPs.length;

      for (const hotelIP of selectedHotelIPs) {
        if (this.shouldStop) {
          return this.createStoppedResult();
        }

        this.updateProgress(`处理Hotel IP: ${hotelIP}`);

        try {
          const channelIPs = await this.getChannelIPs(hotelIP);
          allChannelIPs.push(...channelIPs);
          this.logger.info(`为 ${hotelIP} 找到 ${channelIPs.length} 个频道IP`);

          this.currentTask.progress.processedIPs++;

          // 添加延迟避免请求过快
          await delay(randomDelay(3, 5));
        } catch (error) {
          const appError = errorHandler.handle(error, {
            component: 'ScraperEngine',
            operation: 'getChannelIPs',
            hotelIP,
          });
          this.logger.error(`处理Hotel IP ${hotelIP} 失败`, appError);
          this.currentTask.errors.push({
            timestamp: new Date(),
            type: 'SCRAPING_ERROR',
            message: appError.message,
            context: { hotelIP },
          });
        }
      }

      // 去重频道IP并过滤黑名单
      const uniqueChannelIPs = [...new Set(allChannelIPs)];
      const availableChannelIPs = this.filterAndRandomSelect(
        uniqueChannelIPs,
        uniqueChannelIPs.length
      );

      this.logger.info(
        `找到 ${uniqueChannelIPs.length} 个唯一频道IP，过滤黑名单后剩余 ${availableChannelIPs.length} 个`
      );

      if (availableChannelIPs.length === 0) {
        throw new Error('没有可用的频道IP地址（可能都在黑名单中）');
      }

      // 步骤3: 遍历过滤后的频道IP获取频道列表
      for (const channelIP of availableChannelIPs) {
        if (this.shouldStop) {
          return this.createStoppedResult();
        }

        this.updateProgress(`处理频道IP: ${channelIP}`);

        try {
          const channels = await this.getChannelList(channelIP);

          if (channels.length > 0) {
            result.channelsByIP[channelIP] = channels;
            result.totalChannels += channels.length;
            this.currentTask.progress.foundChannels += channels.length;
            this.logger.info(`为 ${channelIP} 找到 ${channels.length} 个频道`);
          } else {
            this.logger.warn(
              `${channelIP} 未找到有效频道（可能源失效或无数据）`
            );
          }

          result.processedIPs.push(channelIP);

          // 减少延迟以加快调试
          await delay(randomDelay(3, 5));
        } catch (error) {
          this.logger.error(`处理频道IP ${channelIP} 失败`, error);
          this.currentTask.errors.push({
            timestamp: new Date(),
            type: 'HTTP_ERROR',
            message: `处理频道IP ${channelIP} 失败: ${
              (error as Error).message
            }`,
            context: { channelIP },
          });
          result.errors.push(
            `处理 ${channelIP} 失败: ${(error as Error).message}`
          );
        }
      }

      // 保持频道原始顺序，不进行排序

      result.success = result.totalChannels > 0;
      this.currentTask.status = 'IDLE';
      this.currentTask.endTime = new Date();

      this.logger.info(
        `爬取完成: 从 ${Object.keys(result.channelsByIP).length} 个IP获取到 ${
          result.totalChannels
        } 个频道`
      );

      return result;
    } catch (error) {
      this.logger.error('爬取失败', error);

      if (this.currentTask) {
        this.currentTask.status = 'ERROR';
        this.currentTask.endTime = new Date();
        this.currentTask.errors.push({
          timestamp: new Date(),
          type: 'HTTP_ERROR',
          message: (error as Error).message,
        });
      }

      return {
        success: false,
        channelsByIP: {},
        totalChannels: 0,
        processedIPs: [],
        errors: [(error as Error).message],
        timestamp: new Date(),
      };
    }
  }

  /**
   * 停止当前爬取任务
   * 设置停止标志，使爬取流程安全退出
   * 
   * @returns {void}
   */
  stopScraping(): void {
    this.logger.info('停止爬取流程');
    this.shouldStop = true;

    if (this.currentTask) {
      this.currentTask.status = 'STOPPING';
    }
  }

  /**
   * 获取当前爬取状态
   * 
   * @returns {ScrapingStatus} 当前爬取状态
   */
  getStatus(): ScrapingStatus {
    return this.currentTask?.status || 'IDLE';
  }

  getProgress() {
    return this.currentTask?.progress || null;
  }

  getErrors() {
    return this.currentTask?.errors || [];
  }

  /**
   * 检查可用性并根据需要启动爬取
   * @returns {Promise<ScrapingDecision>} 爬取决策结果
   */
  async checkAvailabilityAndScrapeIfNeeded(): Promise<ScrapingDecision> {
    try {
      // 检查当前状态
      if (this.status === 'RUNNING') {
        return {
          shouldScrape: false,
          reason: 'AVAILABILITY_LOW',
          lastCheckTime: new Date()
        };
      }

      // 简单的可用性检查逻辑
      return {
        shouldScrape: true,
        reason: 'AVAILABILITY_OK',
        lastCheckTime: new Date()
      };

    } catch (error) {
      this.logger.error('检查爬取可用性时发生错误', { error });
      return {
        shouldScrape: false,
        reason: 'NO_RECENT_DATA',
        lastCheckTime: new Date()
      };
    }
  }

  private async getHotelIPs(): Promise<string[]> {
    const url = 'https://tonkiang.us/hoteliptv2025.php';
    const response = await this.enhancedHttpClient.get(url, {
      cacheKey: 'hotel-ips',
      skipCache: false
    });
    return this.htmlParser.parseHotelIPs(response.data);
  }

  private async getChannelIPs(hotelIP: string): Promise<string[]> {
    const url = `https://tonkiang.us/hoteliptv2025.php?s=${encodeURIComponent(
      hotelIP
    )}`;
    const response = await this.enhancedHttpClient.get(url, {
      cacheKey: `channel-ips-${hotelIP}`,
      skipCache: false
    });
    return this.htmlParser.parseChannelIPs(response.data);
  }

  private async getChannelList(channelIP: string): Promise<ChannelInfo[]> {
    // 使用实际的数据源URL
    const dataUrl = `https://tonkiang.us/listall.php?s=${encodeURIComponent(
      channelIP
    )}&c=`;

    try {
      const response = await this.enhancedHttpClient.get(dataUrl, {
        cacheKey: `channel-list-${channelIP}`,
        skipCache: false
      });
      const channels = this.htmlParser.parseChannelList(response.data);

      if (channels.length > 0) {
        this.logger.info(`${channelIP} 解析到 ${channels.length} 个频道`);
      } else {
        this.logger.warn(`${channelIP} 未找到频道`);
      }

      return channels;
    } catch (error) {
      this.logger.error(`获取 ${channelIP} 频道列表失败`, error);
      return [];
    }
  }

  private updateProgress(step: string): void {
    if (this.currentTask) {
      this.currentTask.progress.currentStep = step;
      this.logger.info(`进度: ${step}`);
    }
  }

  private createStoppedResult(): ScrapingResult {
    this.logger.info('用户停止了爬取');

    if (this.currentTask) {
      this.currentTask.status = 'IDLE';
      this.currentTask.endTime = new Date();
    }

    return {
      success: false,
      channelsByIP: {},
      totalChannels: 0,
      processedIPs: [],
      errors: ['用户停止了爬取'],
      timestamp: new Date(),
    };
  }
}
