/**
 * 服务容器
 * 提供依赖注入和模块管理功能
 */

import { Logger } from '../utils/logger.js';
import { EnhancedConfigManager } from '../config/index.js';
import { EnhancedHttpClient } from '../http/index.js';
import { ChannelAvailabilityMonitorImpl } from '../monitoring/index.js';
import { ConfigManager } from '../scraper/ConfigManager.js';
import { ScraperEngine } from '../scraper/ScraperEngine.js';
import { FileGenerator } from '../scraper/FileGenerator.js';
import { HtmlParser } from '../scraper/HtmlParser.js';
import { HttpClient } from '../scraper/HttpClient.js';

export interface ServiceContainerConfig {
  configDir: string;
  dataDir: string;
  enableEnhancedServices: boolean;
}

export class ServiceContainer {
  private services: Map<string, any> = new Map();
  private config: ServiceContainerConfig;
  private isInitialized: boolean = false;

  constructor(config?: Partial<ServiceContainerConfig>) {
    this.config = {
      configDir: './config',
      dataDir: './output',
      enableEnhancedServices: true,
      ...config
    };
  }

  /**
   * 初始化服务容器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 注册基础服务
      this.registerSingleton('logger', () => new Logger(this.config.configDir));
      
      // 注册配置管理器
      if (this.config.enableEnhancedServices) {
        this.registerSingleton('configManager', () => 
          new EnhancedConfigManager({
            configDir: this.config.configDir,
            backupDir: `${this.config.configDir}/backups`,
            enableHotReload: true,
            enableBackup: true,
            backupInterval: 60
          })
        );
      } else {
        this.registerSingleton('configManager', () => new ConfigManager(this.config.configDir));
      }

      // 注册HTTP客户端
      if (this.config.enableEnhancedServices) {
        this.registerSingleton('httpClient', () => 
          new EnhancedHttpClient(this.config.configDir, {
            maxConcurrentRequests: 5,
            rateLimit: 2,
            enableCaching: true,
            cacheTTL: 300000,
            timeout: 30000,
            maxRetries: 3
          })
        );
      } else {
        this.registerSingleton('httpClient', () => new HttpClient(this.config.configDir));
      }

      // 注册其他服务
      this.registerSingleton('htmlParser', () => new HtmlParser(this.config.configDir));
      this.registerSingleton('fileGenerator', () => new FileGenerator(this.config.dataDir));
      this.registerSingleton('scraperEngine', () => new ScraperEngine(this.config.configDir));
      
      if (this.config.enableEnhancedServices) {
        this.registerSingleton('channelMonitor', () => 
          new ChannelAvailabilityMonitorImpl(this.config.configDir, this.config.dataDir)
        );
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`服务容器初始化失败: ${(error as Error).message}`);
    }
  }

  /**
   * 注册单例服务
   */
  registerSingleton<T>(token: string, factory: () => T): void {
    if (this.services.has(token)) {
      throw new Error(`服务 ${token} 已经注册`);
    }
    
    const instance = factory();
    this.services.set(token, instance);
  }

  /**
   * 注册瞬态服务
   */
  registerTransient<T>(token: string, factory: () => T): void {
    // 瞬态服务不存储实例，每次获取都创建新实例
    this.services.set(`factory_${token}`, factory);
  }

  /**
   * 获取服务
   */
  get<T>(token: string): T {
    if (!this.isInitialized) {
      throw new Error('服务容器尚未初始化，请先调用 initialize()');
    }

    // 检查单例服务
    if (this.services.has(token)) {
      return this.services.get(token);
    }

    // 检查瞬态服务工厂
    const factoryToken = `factory_${token}`;
    if (this.services.has(factoryToken)) {
      const factory = this.services.get(factoryToken);
      return factory();
    }

    throw new Error(`未找到服务: ${token}`);
  }

  /**
   * 检查服务是否存在
   */
  has(token: string): boolean {
    return this.services.has(token) || this.services.has(`factory_${token}`);
  }

  /**
   * 替换服务实例
   */
  replace<T>(token: string, instance: T): void {
    this.services.set(token, instance);
  }

  /**
   * 关闭服务容器
   */
  async shutdown(): Promise<void> {
    // 关闭需要清理的服务
    for (const [token, service] of this.services.entries()) {
      if (typeof service.close === 'function') {
        try {
          await service.close();
        } catch (error) {
          console.warn(`关闭服务 ${token} 时出错:`, error);
        }
      }
    }

    this.services.clear();
    this.isInitialized = false;
  }

  /**
   * 获取服务统计信息
   */
  getStats(): { totalServices: number; initialized: boolean } {
    return {
      totalServices: this.services.size,
      initialized: this.isInitialized
    };
  }
}

// 创建全局服务容器实例
let globalContainer: ServiceContainer | null = null;

export function getServiceContainer(): ServiceContainer {
  if (!globalContainer) {
    globalContainer = new ServiceContainer();
  }
  return globalContainer;
}

export function setServiceContainer(container: ServiceContainer): void {
  globalContainer = container;
}