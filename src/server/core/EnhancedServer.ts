/**
 * 增强的服务器核心
 * 重构后的服务器，集成错误处理、配置管理和监控
 */

import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ScraperEngine } from '../scraper/ScraperEngine.ts';
import { FileGenerator } from '../scraper/FileGenerator.ts';
import { CronScheduler } from '../scheduler/CronScheduler.ts';
import { Logger } from '../utils/logger.ts';
import { errorHandler, ErrorType } from '../../shared/core/ErrorHandler.ts';
import { ConfigManager } from '../../shared/core/ConfigManager.ts';
import type {
  SystemConfig,
  ApiResponse,
  ValidationResult,
  SystemStats,
  LogEntry,
} from '../../shared/types/core.ts';

// 系统配置模式
const systemConfigSchema = {
  area: {
    type: 'string' as const,
    required: true,
    default: '浙江',
    description: '爬取地区',
  },
  cron: {
    type: 'string' as const,
    required: false,
    default: '* */2 * * *',
    description: 'Cron表达式',
    validate: (value: string) => {
      // 这里可以添加cron表达式验证逻辑
      return true;
    },
  },
  preferredAddress: {
    type: 'string' as const,
    required: false,
    default: '',
    description: '首选地址',
  },
  channels: {
    type: 'number' as const,
    required: false,
    default: 0,
    description: '频道数量限制',
    validate: (value: number) => value >= 0,
  },
  blackList: {
    type: 'array' as const,
    required: false,
    default: [],
    description: 'IP黑名单',
  },
  dedup: {
    type: 'boolean' as const,
    required: false,
    default: true,
    description: '是否去重',
  },
  requestDelay: {
    type: 'array' as const,
    required: false,
    default: [1, 3],
    description: '请求延迟范围',
    validate: (value: [number, number]) => {
      return Array.isArray(value) && value.length === 2 && value[0] <= value[1];
    },
  },
  maxRetries: {
    type: 'number' as const,
    required: false,
    default: 3,
    description: '最大重试次数',
    validate: (value: number) => value >= 0 && value <= 10,
  },
  enableLogging: {
    type: 'boolean' as const,
    required: false,
    default: true,
    description: '是否启用日志',
  },
  logLevel: {
    type: 'string' as const,
    required: false,
    default: 'INFO',
    description: '日志级别',
    validate: (value: string) =>
      ['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(value),
  },
  outputFormats: {
    type: 'array' as const,
    required: false,
    default: ['m3u', 'json', 'txt'],
    description: '输出格式',
  },
  timeout: {
    type: 'number' as const,
    required: false,
    default: 30000,
    description: '请求超时时间',
    validate: (value: number) => value > 0,
  },
};

export class EnhancedServer {
  private app: express.Application;
  private configManager!: ConfigManager<SystemConfig>;
  private scraperEngine!: ScraperEngine;
  private fileGenerator!: FileGenerator;
  private logger!: Logger;
  private cronScheduler!: CronScheduler;
  private config: {
    configDir: string;
    outputDir: string;
    timezone: string;
    port: number;
  };

  constructor() {
    // 加载环境变量
    dotenv.config();

    this.config = {
      configDir: process.env.CONFIG_DIR || './config',
      outputDir: process.env.OUT_DIR || './output',
      timezone: process.env.TZ || 'Asia/Shanghai',
      port: parseInt(process.env.PORT || '5174', 10),
    };

    // 初始化Express应用
    this.app = express();
    this.setupMiddleware();

    // 初始化核心组件
    this.initializeComponents();

    // 设置路由
    this.setupRoutes();

    // 设置错误处理
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(express.static('dist'));
    this.app.use(cors());
    this.app.use(express.json());

    // 请求日志中间件
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.logger?.info(
          `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`,
          {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration,
          },
          'http'
        );
      });
      next();
    });
  }

  private initializeComponents(): void {
    try {
      // 初始化配置管理器
      this.configManager = new ConfigManager<SystemConfig>(
        {
          configDir: this.config.configDir,
          configFile: 'config.json',
          backupEnabled: true,
          maxBackups: 5,
          autoSave: true,
          validateOnLoad: true,
        },
        systemConfigSchema
      );

      // 初始化日志系统
      this.logger = new Logger(this.config.configDir, {
        level: this.getLogLevel(),
        enableConsole: true,
        enableFile: true,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
      });

      // 初始化其他组件
      this.scraperEngine = new ScraperEngine(this.config.configDir);
      this.fileGenerator = new FileGenerator(this.config.outputDir);
      this.cronScheduler = new CronScheduler({
        configDir: this.config.configDir,
        outputDir: this.config.outputDir,
        timezone: this.config.timezone,
      });

      // 监听配置变化
      this.configManager.watch((config) => {
        this.onConfigChange(config);
      });

      this.logger.info('所有组件初始化完成');
    } catch (error) {
      console.error('组件初始化失败:', error);
      throw error;
    }
  }

  private setupRoutes(): void {
    // 系统配置相关路由
    this.setupConfigRoutes();

    // 任务控制相关路由
    this.setupTaskRoutes();

    // 监控相关路由
    this.setupMonitoringRoutes();

    // Cron相关路由
    this.setupCronRoutes();

    // 黑名单相关路由
    this.setupBlacklistRoutes();

    // 健康检查和统计路由
    this.setupHealthRoutes();
  }

  private setupConfigRoutes(): void {
    // 获取配置
    this.app.get(
      '/api/getConfig',
      this.asyncHandler(async (req, res) => {
        const config = this.configManager.getConfig();
        res.json(this.successResponse(config));
      })
    );

    // 保存配置
    this.app.post(
      '/api/saveConfig',
      this.asyncHandler(async (req, res) => {
        this.configManager.update(req.body);
        res.json(this.successResponse(true));
      })
    );

    // 部分更新配置
    this.app.patch(
      '/api/config',
      this.asyncHandler(async (req, res) => {
        if (!req.body || Object.keys(req.body).length === 0) {
          throw errorHandler.handleValidationError(
            'body',
            req.body,
            'required'
          );
        }

        this.configManager.update(req.body);
        const updatedConfig = this.configManager.getConfig();
        res.json(this.successResponse(updatedConfig));
      })
    );

    // 重置配置
    this.app.post(
      '/api/config/reset',
      this.asyncHandler(async (req, res) => {
        this.configManager.reset();
        const config = this.configManager.getConfig();
        this.logger.info('配置已重置为默认值');
        res.json(this.successResponse(config));
      })
    );

    // 验证配置
    this.app.post(
      '/api/config/validate',
      this.asyncHandler(async (req, res) => {
        const validation = this.configManager.validateConfig(req.body);
        res.json(this.successResponse(validation));
      })
    );

    // 导出配置
    this.app.get(
      '/api/config/export',
      this.asyncHandler(async (req, res) => {
        const configData = this.configManager.exportConfig();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=config-backup.json'
        );
        res.send(configData);
      })
    );

    // 导入配置
    this.app.post(
      '/api/config/import',
      this.asyncHandler(async (req, res) => {
        const { configData } = req.body;
        if (!configData) {
          throw errorHandler.handleValidationError(
            'configData',
            configData,
            'required'
          );
        }

        this.configManager.importConfig(configData);
        const config = this.configManager.getConfig();
        this.logger.info('配置导入成功');
        res.json(this.successResponse(config));
      })
    );
  }

  private setupTaskRoutes(): void {
    // 获取状态
    this.app.get(
      '/api/getStatus',
      this.asyncHandler(async (req, res) => {
        const status = this.getSystemStatus();
        res.json(this.successResponse(status));
      })
    );

    // 手动执行任务
    this.app.get(
      '/api/runOnce',
      this.asyncHandler(async (req, res) => {
        this.logger.info('手动触发爬取任务');
        await this.cronScheduler.executeOnce();
        res.json(this.successResponse(true));
      })
    );

    // 取消任务
    this.app.get(
      '/api/cancel',
      this.asyncHandler(async (req, res) => {
        this.scraperEngine.stopScraping();
        this.logger.info('用户取消爬取任务');
        res.json(this.successResponse(true));
      })
    );
  }

  private setupMonitoringRoutes(): void {
    // 获取日志
    this.app.get(
      '/api/getLogs',
      this.asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit as string) || 100;
        const logs = this.logger.getRecentLogs(limit);

        // 转换为字符串格式以保持向后兼容
        const logString = logs
          .map(
            (log) =>
              `${log.timestamp.toISOString()} [${log.level}] ${log.message}`
          )
          .join('\n');

        res.json(this.successResponse(logString));
      })
    );

    // 获取结构化日志
    this.app.get(
      '/api/logs/structured',
      this.asyncHandler(async (req, res) => {
        const limit = parseInt(req.query.limit as string) || 100;
        const category = req.query.category as string;

        const logs = category
          ? this.logger.getLogsByCategory(category, limit)
          : this.logger.getRecentLogs(limit);

        res.json(this.successResponse(logs));
      })
    );

    // 清空日志
    this.app.get(
      '/api/clearLog',
      this.asyncHandler(async (req, res) => {
        this.logger.reset();
        this.logger.info('日志已清空');
        res.json(this.successResponse(true));
      })
    );

    // 获取系统统计
    this.app.get(
      '/api/stats',
      this.asyncHandler(async (req, res) => {
        const stats = await this.getSystemStats();
        res.json(this.successResponse(stats));
      })
    );

    // 下载文件
    this.app.get(
      '/api/download/:format',
      this.asyncHandler(async (req, res) => {
        const format = req.params.format as 'm3u' | 'json' | 'txt';
        const filePath = path.join(this.config.outputDir, `channels.${format}`);

        if (!fs.existsSync(filePath)) {
          throw errorHandler.handleFileSystemError(
            'read',
            filePath,
            new Error('文件不存在')
          );
        }

        res.download(filePath);
      })
    );
  }

  private setupCronRoutes(): void {
    // 验证Cron表达式
    this.app.get(
      '/api/verifierCron',
      this.asyncHandler(async (req, res) => {
        const cronExpression = req.query.value as string;
        const validation =
          this.cronScheduler.validateCronExpression(cronExpression);
        res.json(this.successResponse(validation));
      })
    );

    // 获取Cron配置
    this.app.get(
      '/api/cron/config',
      this.asyncHandler(async (req, res) => {
        const cronConfig = this.cronScheduler.getCronConfig();
        const schedulerStatus = this.cronScheduler.getStatus();

        res.json(
          this.successResponse({
            config: cronConfig,
            status: schedulerStatus,
          })
        );
      })
    );

    // 更新Cron配置
    this.app.post(
      '/api/cron/config',
      this.asyncHandler(async (req, res) => {
        const { cronExpression } = req.body;
        if (!cronExpression) {
          throw errorHandler.handleValidationError(
            'cronExpression',
            cronExpression,
            'required'
          );
        }

        const success = this.cronScheduler.updateCronConfig(cronExpression);
        if (!success) {
          throw errorHandler.handleCronError(
            cronExpression,
            new Error('更新Cron配置失败')
          );
        }

        res.json(this.successResponse(true));
      })
    );

    // 启用定时任务
    this.app.post(
      '/api/cron/enable',
      this.asyncHandler(async (req, res) => {
        const { cronExpression } = req.body;
        const success = this.cronScheduler.enableCron(cronExpression);

        if (!success) {
          throw errorHandler.handleCronError(
            cronExpression,
            new Error('启用定时任务失败')
          );
        }

        res.json(this.successResponse(true));
      })
    );

    // 禁用定时任务
    this.app.post(
      '/api/cron/disable',
      this.asyncHandler(async (req, res) => {
        const success = this.cronScheduler.disableCron();

        if (!success) {
          throw new Error('禁用定时任务失败');
        }

        res.json(this.successResponse(true));
      })
    );

    // 重置Cron配置
    this.app.post(
      '/api/cron/reset',
      this.asyncHandler(async (req, res) => {
        const success = this.cronScheduler.resetCronConfig();

        if (!success) {
          throw new Error('重置Cron配置失败');
        }

        res.json(this.successResponse(true));
      })
    );

    // 获取Cron模板
    this.app.get(
      '/api/cron/templates',
      this.asyncHandler(async (req, res) => {
        const templates = this.cronScheduler.getCronTemplates();
        res.json(this.successResponse(templates));
      })
    );

    // 验证Cron表达式
    this.app.post(
      '/api/cron/validate',
      this.asyncHandler(async (req, res) => {
        const { cronExpression } = req.body;
        if (!cronExpression) {
          throw errorHandler.handleValidationError(
            'cronExpression',
            cronExpression,
            'required'
          );
        }

        const validation =
          this.cronScheduler.validateCronExpression(cronExpression);
        res.json(this.successResponse(validation));
      })
    );
  }

  private setupBlacklistRoutes(): void {
    // 添加到黑名单
    this.app.get(
      '/api/addBlacklist',
      this.asyncHandler(async (req, res) => {
        const ip = req.query.value as string;
        if (!ip) {
          throw errorHandler.handleValidationError('ip', ip, 'required');
        }

        // 这里需要实现黑名单功能，暂时使用配置管理器
        const config = this.configManager.getConfig();
        const blackList = config.blackList || [];
        
        if (!blackList.includes(ip)) {
          blackList.push(ip);
          this.configManager.update({ blackList });
          res.json(this.successResponse({ message: `IP ${ip} 已添加到黑名单` }));
        } else {
          res.json(this.errorResponse(`IP ${ip} 已在黑名单中`));
        }
      })
    );

    // 从黑名单移除
    this.app.delete(
      '/api/blacklist/:ip',
      this.asyncHandler(async (req, res) => {
        const ip = decodeURIComponent(req.params.ip);
        if (!ip) {
          throw errorHandler.handleValidationError('ip', ip, 'required');
        }

        const config = this.configManager.getConfig();
        const blackList = config.blackList || [];
        const index = blackList.indexOf(ip);
        if (index > -1) {
          blackList.splice(index, 1);
          this.configManager.update({ blackList });
        }

        this.logger.info(`已从黑名单移除 ${ip}`);
        res.json(this.successResponse(true));
      })
    );

    // 获取黑名单
    this.app.get(
      '/api/blacklist',
      this.asyncHandler(async (req, res) => {
        const config = this.configManager.getConfig();
        if (config.blackList && Array.isArray(config.blackList)) {
          res.json(this.successResponse(config.blackList));
        } else {
          res.json(this.successResponse([]));
        }
      })
    );

    // 清空黑名单
    this.app.delete(
      '/api/blacklist',
      this.asyncHandler(async (req, res) => {
        this.configManager.update({ blackList: [] });
        this.logger.info('已清空黑名单');
        res.json(this.successResponse(true));
      })
    );

    // 检查IP是否在黑名单中
    this.app.get(
      '/api/blacklist/check/:ip',
      this.asyncHandler(async (req, res) => {
        const ip = decodeURIComponent(req.params.ip);
        if (!ip) {
          throw errorHandler.handleValidationError('ip', ip, 'required');
        }

        const config = this.configManager.getConfig();
        const blackList = config.blackList || [];
        const isBlacklisted = blackList.includes(ip);

        res.json(this.successResponse({ ip, isBlacklisted }));
      })
    );
  }

  private setupHealthRoutes(): void {
    // 健康检查
    this.app.get(
      '/api/health',
      this.asyncHandler(async (req, res) => {
        const health = {
          status: 'healthy',
          timestamp: new Date(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '2.0.0',
          environment: process.env.NODE_ENV || 'development',
          components: {
            configManager: this.configManager ? 'healthy' : 'unhealthy',
            scraperEngine: this.scraperEngine ? 'healthy' : 'unhealthy',
            cronScheduler: this.cronScheduler ? 'healthy' : 'unhealthy',
            logger: this.logger ? 'healthy' : 'unhealthy',
          },
        };

        res.json(this.successResponse(health));
      })
    );

    // 性能指标
    this.app.get(
      '/api/metrics',
      this.asyncHandler(async (req, res) => {
        const metrics = {
          timestamp: new Date(),
          uptime: process.uptime(),
          errorCount: errorHandler.getErrorHistory(100).length,
          logCount: this.logger.getRecentLogs(1000).length,
        };

        res.json(this.successResponse(metrics));
      })
    );
  }

  private setupErrorHandling(): void {
    // 404处理
    this.app.use((req, res) => {
      res.status(404).json(this.errorResponse('API端点不存在'));
    });

    // 全局错误处理
    this.app.use(
      (
        error: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        const appError = errorHandler.handle(error, {
          method: req.method,
          path: req.path,
          body: req.body,
          query: req.query,
        });

        this.logger?.error('API错误', appError, 'api');

        res.status(500).json(this.errorResponse(appError.message, appError));
      }
    );
  }

  private onConfigChange(config: SystemConfig): void {
    try {
      // 更新日志级别
      if (config.logLevel) {
        const logLevelMap = {
          DEBUG: 0,
          INFO: 1,
          WARN: 2,
          ERROR: 3,
        };
        this.logger.setLevel(logLevelMap[config.logLevel] || 1);
      }

      // 重新设置定时任务
      if (config.schedule?.cron) {
        this.cronScheduler.restart(config.schedule.cron);
      } else {
        this.cronScheduler.stop();
      }

      this.logger.info('配置变更已应用', { config }, 'config');
    } catch (error) {
      this.logger.error('应用配置变更失败', error, 'config');
    }
  }

  private getSystemStatus(): string {
    const status = this.scraperEngine.getStatus();
    switch (status) {
      case 'RUNNING':
        return 'RUNNING';
      case 'STOPPING':
        return 'RUNNING'; // 保持兼容性
      case 'ERROR':
        return 'WAIT_EXECUTION';
      case 'IDLE':
      default:
        // 检查是否已配置
        try {
          const config = this.configManager.getConfig();
          const configAny = config as any;
          return configAny.cron ? 'WAIT_EXECUTION' : 'NOT_CONFIGURED';
        } catch {
          return 'NOT_CONFIGURED';
        }
    }
  }

  private async getSystemStats(): Promise<SystemStats> {
    const uptime = process.uptime();

    return {
      uptime,
      channels: { total: 0, available: 0 }, // 需要从配置或数据源获取
      lastUpdate: new Date(),
      scrapingStats: {
        totalRuns: 0, // 需要从持久化存储获取
        successfulRuns: 0,
        failedRuns: 0,
        averageDuration: 0,
        lastRunTime: undefined,
      },
    };
  }

  private getLogLevel(): number {
    try {
      const config = this.configManager.getConfig();
      const logLevelMap = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
      };
      return logLevelMap[config.logLevel || 'INFO'] || 1;
    } catch {
      return 1; // 默认INFO级别
    }
  }

  private asyncHandler(
    fn: (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => Promise<any>
  ) {
    return (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  private successResponse<T>(data: T): ApiResponse<T> {
    return {
      status: 'success',
      message: '操作成功',
      data,
      error: null,
      timestamp: new Date(),
    };
  }

  private errorResponse(message: string, error?: any): ApiResponse<null> {
    return {
      status: 'error',
      message,
      data: null,
      error,
      timestamp: new Date(),
    };
  }

  public async start(): Promise<void> {
    try {
      // 初始化定时任务
      this.cronScheduler.initializeFromConfig();
      this.logger.info('定时任务初始化成功');

      // 启动服务器
      return new Promise((resolve, reject) => {
        const server = this.app.listen(this.config.port, () => {
          console.log(`服务器运行在端口 ${this.config.port}`);
          this.logger.info(`服务器启动成功，端口: ${this.config.port}`);
          resolve();
        });

        server.on('error', (error) => {
          this.logger.error('服务器启动失败', error);
          reject(error);
        });
      });
    } catch (error) {
      this.logger.error('服务器初始化失败', error);
      throw error;
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// 导出服务器实例
export const enhancedServer = new EnhancedServer();
