/**
 * 爬取引擎模块
 * 负责从数据源爬取IPTV频道信息的核心模块
 *
 * @implements {IScraperEngine}
 */
import type { ScraperEngine as IScraperEngine } from '../../shared/types/interfaces.ts';
import type {
  ScrapingResult,
  ScrapingStatus,
  ChannelInfo,
  ScrapingTask,
  ScrapingDecision,
} from '../../shared/core/types/index.ts';
import { HtmlParser } from './HtmlParser.ts';
import { Logger } from '../utils/logger.ts';
import { delay, randomDelay } from '../utils/delay.ts';
import { errorHandler, ErrorType } from '../../shared/core/ErrorHandler.ts';
import { EnhancedHttpClient } from '../http/index.ts';
import { ConfigManager } from './ConfigManager.ts';

/**
 * 爬取引擎类
 * 管理整个爬取流程，包括数据获取、解析和处理
 */
export class ScraperEngine implements IScraperEngine {
  /** 增强HTTP客户端 */
  private httpClient: EnhancedHttpClient;

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
    this.httpClient = new EnhancedHttpClient(configDir, {
      maxConcurrentRequests: 5,
      rateLimit: 2, // 每秒最多2个请求
      enableCaching: true,
      cacheTTL: 300000, // 5分钟缓存
      timeout: 30000,
      maxRetries: 3,
    });
    this.htmlParser = new HtmlParser(configDir);
    this.logger = new Logger(configDir);
    this.configManager = new ConfigManager(configDir);
  }

  // 获取黑名单列表
  private getBlacklist(): string[] {
    try {
      return this.configManager.getBlacklist();
    } catch (error) {
      this.logger.error('获取黑名单失败', error);
      return [];
    }
  }

  // 获取当前首选地址
  private getCurrentPreferredAddress(): string {
    try {
      const config = this.configManager.loadConfig();
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
      // 提供更详细的错误信息
      let errorType:
        | 'HTTP_ERROR'
        | 'PARSE_ERROR'
        | 'VALIDATION_ERROR'
        | 'SCRAPING_ERROR'
        | 'NETWORK_ERROR'
        | 'TIMEOUT_ERROR'
        | 'CONFIG_ERROR' = 'SCRAPING_ERROR';
      let errorMessage = '未知错误';

      if (error instanceof Error) {
        errorMessage = error.message || '未知错误';

        // 根据错误信息分类错误类型
        if (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ECONNRESET')
        ) {
          errorType = 'NETWORK_ERROR';
          errorMessage = `网络连接错误: ${error.message}`;
        } else if (
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ECONNABORTED') ||
          error.message.includes('timeout')
        ) {
          errorType = 'TIMEOUT_ERROR';
          errorMessage = `请求超时: ${error.message}`;
        } else if (
          error.message.includes('HTTP') &&
          (error.message.includes('status') ||
            error.message.includes('404') ||
            error.message.includes('500'))
        ) {
          errorType = 'HTTP_ERROR';
          errorMessage = `HTTP请求错误: ${error.message}`;
        } else if (
          error.message.includes('解析') ||
          error.message.includes('parse') ||
          error.message.includes('cheerio')
        ) {
          errorType = 'PARSE_ERROR';
          errorMessage = `HTML解析错误: ${error.message}`;
        } else if (
          error.message.includes('配置') ||
          error.message.includes('config')
        ) {
          errorType = 'CONFIG_ERROR';
          errorMessage = `配置错误: ${error.message}`;
        } else if (
          error.message.includes('验证') ||
          error.message.includes('validation')
        ) {
          errorType = 'VALIDATION_ERROR';
          errorMessage = `数据验证错误: ${error.message}`;
        } else {
          errorType = 'SCRAPING_ERROR';
          errorMessage = `爬取过程错误: ${error.message}`;
        }
      }

      this.logger.error(`爬取失败: ${errorType} - ${errorMessage}`, error);

      if (this.currentTask) {
        this.currentTask.status = 'ERROR';
        this.currentTask.endTime = new Date();
        this.currentTask.errors.push({
          timestamp: new Date(),
          type: errorType,
          message: errorMessage,
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
          lastCheckTime: new Date(),
        };
      }

      // 简单的可用性检查逻辑
      return {
        shouldScrape: true,
        reason: 'AVAILABILITY_OK',
        lastCheckTime: new Date(),
      };
    } catch (error) {
      this.logger.error('检查爬取可用性时发生错误', { error });
      return {
        shouldScrape: false,
        reason: 'NO_RECENT_DATA',
        lastCheckTime: new Date(),
      };
    }
  }

  private async getHotelIPs(): Promise<string[]> {
    const url = 'https://tonkiang.us/hoteliptv2025.php';
    this.logger.info(`正在访问酒店IP列表页面: ${url}`);
    const response = await this.httpClient.get(url, {
      cacheKey: 'hotel-ips',
      skipCache: false,
    });
    return this.htmlParser.parseHotelIPs(response.data);
  }

  private async getChannelIPs(hotelIP: string): Promise<string[]> {
    const url = `https://tonkiang.us/hoteliptv2025.php?s=${encodeURIComponent(
      hotelIP
    )}`;
    this.logger.info(`正在访问频道IP列表页面: ${url}`);
    const response = await this.httpClient.get(url, {
      cacheKey: `channel-ips-${hotelIP}`,
      skipCache: false,
    });
    return this.htmlParser.parseChannelIPs(response.data);
  }

  /**
   * 获取指定频道IP的频道列表
   * @param channelIP 频道IP地址
   * @returns 频道信息数组
   */
  private async getChannelList(channelIP: string): Promise<ChannelInfo[]> {
    // 使用AJAX端点直接获取频道列表数据
    const dataUrl = `https://tonkiang.us/listall.php?s=${encodeURIComponent(
      channelIP
    )}&c=false`;

    try {
      this.logger.info(`开始获取频道列表: ${channelIP}`);
      this.logger.info(`正在访问频道列表页面: ${dataUrl}`);
      this.logger.debug(`请求URL: ${dataUrl}`);

      const response = await this.httpClient.get(dataUrl, {
        cacheKey: `channel-list-${channelIP}`,
        skipCache: false,
      });

      // 验证HTML内容
      if (!response.data || typeof response.data !== 'string') {
        this.logger.error(
          `获取到的HTML内容无效: ${typeof response.data}, 长度: ${
            response.data?.length || 0
          }`
        );
        return [];
      }

      if (response.data.length === 0) {
        this.logger.warn(`获取到的HTML内容为空: ${channelIP}`);
        return [];
      }
      // 添加调试信息
      this.logger.info(`获取到HTML内容长度: ${response.data.length} 字符`);
      this.logger.debug(
        `HTML内容前200字符: ${response.data.substring(0, 200)}`
      );

      // 检查是否包含预期的HTML结构
      if (!response.data.includes('<') || !response.data.includes('>')) {
        this.logger.warn(`HTML内容格式异常，可能不是有效的HTML: ${channelIP}`);
        this.logger.debug(`完整内容: ${response.data}`);
      }

      const channels = this.htmlParser.parseChannelList(response.data);

      if (channels.length > 0) {
        this.logger.info(`${channelIP} 解析到 ${channels.length} 个频道`);
        this.logger.debug(
          `解析到的频道: ${channels.map((c) => c.name).join(', ')}`
        );
      } else {
        this.logger.warn(
          `${channelIP} 未找到频道，HTML可能不包含预期的频道结构`
        );
        // 输出HTML内容的关键部分用于调试
        const resultElements = (
          response.data.match(/<[^>]*class[^>]*result[^>]*>/gi) || []
        ).length;
        const channelElements = (
          response.data.match(/<[^>]*class[^>]*channel[^>]*>/gi) || []
        ).length;
        const m3u8Elements = (
          response.data.match(/<[^>]*class[^>]*m3u8[^>]*>/gi) || []
        ).length;
        this.logger.debug(
          `HTML结构分析 - .result元素: ${resultElements}, .channel元素: ${channelElements}, .m3u8元素: ${m3u8Elements}`
        );
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
