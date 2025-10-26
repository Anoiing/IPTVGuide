/**
 * 增强的服务器核心
 * 重构后的服务器，集成错误处理、配置管理和监控
 */

import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ScraperEngine } from '../scraper/ScraperEngine';
import { FileGenerator } from '../scraper/FileGenerator';
import { CronScheduler } from '../scheduler/CronScheduler';
import { Logger } from '../utils/logger';
import { LogLevel } from '../logging/types';
import { errorHandler, ErrorType } from '../../shared/core/ErrorHandler';
import { EnhancedConfigManager } from '../../shared/core/config/EnhancedConfigManager';
import type {
  SystemConfig,
  ApiResponse,
  ConfigValidationResult,
  LogEntry,
} from '../../shared/types/core';

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
  private configManager!: EnhancedConfigManager;
  private scraperEngine!: ScraperEngine;
  private fileGenerator!: FileGenerator;
  private logger!: Logger;
  private cronScheduler!: CronScheduler;
  
  // 添加系统状态管理
  private systemState: 'NOT_CONFIGURED' | 'WAIT_EXECUTION' | 'RUNNING' | 'STOPPING' | 'ERROR' = 'NOT_CONFIGURED';
  private task: any = null;
  private taskTimeout: NodeJS.Timeout | null = null;
  private logs: string[] = [];
  
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
      this.configManager = new EnhancedConfigManager({
        configDir: this.config.configDir,
      });

      // 初始化日志系统
      this.logger = new Logger(this.config.configDir, {
        level: this.getLogLevel() as any,
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
    // 静态文件服务
    this.app.use(express.static('dist'));

    // 设置各种路由
    this.setupApiServerRoutes(); // 整合API服务器路由
    this.setupFileRoutes(); // 新增文件路由
    this.setupLegacyRoutes(); // 新增兼容性路由
    this.setupErrorHandling(); // 错误处理
  }

  /**
   * 设置错误处理中间件
   */
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

  /**
   * 异步处理器包装器
   */
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

  /**
   * 成功响应格式
   */
  private successResponse<T>(data: T): ApiResponse<T> {
    return {
      status: 'success',
      message: '操作成功',
      data,
      error: null,
      timestamp: new Date(),
    };
  }

  /**
   * 错误响应格式
   */
  private errorResponse(message: string, error?: any): ApiResponse<null> {
    return {
      status: 'error',
      message,
      data: null,
      error,
      timestamp: new Date(),
    };
  }

  /**
   * 添加日志记录
   * @param message - 日志消息
   */
  private pushLog(message: string): void {
    const timestamp = new Date().toLocaleString('zh-CN', {
      timeZone: this.config.timezone,
    });
    const logEntry = `[${timestamp}] ${message}`;
    
    // 添加到内存日志
    this.logs.push(logEntry);
    
    // 保持最近100条日志
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }
    
    // 写入文件
    try {
      fs.appendFileSync(`${this.config.configDir}/log.txt`, logEntry + '\n');
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
    
    // 使用Logger记录
    this.logger?.info(message);
  }

  /**
   * 获取频道数据的主要方法
   */
  private async getChannels(): Promise<void> {
    if (this.systemState === 'RUNNING') {
      this.pushLog('任务正在执行中，跳过本次执行');
      return;
    }

    if (this.systemState === 'STOPPING') {
      this.pushLog('任务正在停止中，跳过本次执行');
      return;
    }

    this.pushLog('-------------------');
    this.pushLog('开始执行任务');
    this.systemState = 'RUNNING';

    // 设置任务超时（20分钟）
    this.taskTimeout = setTimeout(() => {
      if (this.systemState === 'RUNNING') {
        this.pushLog('任务执行超时，自动停止');
        this.scraperEngine.stopScraping();
        this.systemState = 'ERROR';

        // 错误状态10秒后自动恢复
        setTimeout(() => {
          if (this.systemState === 'ERROR') {
            this.systemState = 'WAIT_EXECUTION';
          }
        }, 10000);
      }
    }, 20 * 60 * 1000); // 20分钟超时

    try {
      // 使用新的爬取引擎
      this.pushLog('启动爬取引擎');
      const result = await this.scraperEngine.startScraping();

      // 清除超时定时器
      if (this.taskTimeout) {
        clearTimeout(this.taskTimeout);
        this.taskTimeout = null;
      }

      // 检查是否被中途停止
      if (this.systemState !== 'RUNNING') {
        this.pushLog('任务已被用户停止');
        this.systemState = 'WAIT_EXECUTION';
        return;
      }

      if (result.success) {
        if (result.skipReason) {
          // 跳过爬取的情况
          this.pushLog(result.skipReason);
          this.pushLog('本次任务执行完成（跳过爬取）');
          this.systemState = 'WAIT_EXECUTION';
        } else {
          // 正常爬取成功的情况
          this.pushLog(
            `爬取成功：获得 ${result.totalChannels} 个频道，来自 ${
              result.channelsByIP ? Object.keys(result.channelsByIP).length : 0
            } 个IP地址`
          );

          // 保存结果到文件
          await this.saveToFile(result.channelsByIP, result.totalChannels);
        }
      } else {
        this.pushLog(
          '爬取失败：' + (((result.errors || []).map((e: any) => e?.message).filter(Boolean).join(', ')) || '未知错误')
        );
        this.systemState = 'ERROR';

        // 错误状态5秒后自动恢复到等待状态
        setTimeout(() => {
          if (this.systemState === 'ERROR') {
            this.systemState = 'WAIT_EXECUTION';
          }
        }, 5000);
      }
    } catch (error: any) {
      // 清除超时定时器
      if (this.taskTimeout) {
        clearTimeout(this.taskTimeout);
        this.taskTimeout = null;
      }

      this.pushLog(`爬取过程中发生错误：${error.message}`);
      this.systemState = 'ERROR';

      // 错误状态5秒后自动恢复到等待状态
      setTimeout(() => {
        if (this.systemState === 'ERROR') {
          this.systemState = 'WAIT_EXECUTION';
        }
      }, 5000);
    }
  }

  /**
   * 保存频道数据到文件
   * @param channelsByIP - 按IP分组的频道数据
   * @param totalChannels - 总频道数
   */
  private async saveToFile(channelsByIP: any, totalChannels: number): Promise<void> {
    try {
      // 使用FileGenerator保存文件
      this.fileGenerator.generateAll(channelsByIP);
      
      this.pushLog(`文件生成完成，共 ${totalChannels} 个频道`);
      this.systemState = 'WAIT_EXECUTION';
    } catch (error: any) {
      this.pushLog(`文件保存失败：${error.message}`);
      this.systemState = 'ERROR';
      
      // 错误状态5秒后自动恢复
      setTimeout(() => {
        if (this.systemState === 'ERROR') {
          this.systemState = 'WAIT_EXECUTION';
        }
      }, 5000);
    }
  }

  /**
   * 设置兼容性路由（从server.js迁移的API）
   */
  private setupLegacyRoutes(): void {
    // 校验cron表达式
    this.app.get('/api/verifierCron', this.asyncHandler(async (req, res) => {
      const { value } = req.query;
      
      if (!value) {
        return res.json(this.successResponse({
          isValid: false,
          reason: '值不能为空',
        }));
      }

      // 导入验证函数
      const { validateCronInterval } = await import('../utils/cronValidator');

      // 验证cron表达式
      const cronPattern = /^(\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*)$/;
      
      if (!cronPattern.test(value as string)) {
        return res.json(this.successResponse({
          isValid: false,
          reason: 'Cron表达式格式不正确',
        }));
      }

      // 间隔验证
      const intervalValidation = validateCronInterval(value as string, 2);
      res.json(this.successResponse(intervalValidation));
    }));

    // 获取状态
    this.app.get('/api/getStatus', (req, res) => {
      if (this.systemState === 'NOT_CONFIGURED') {
        try {
          const config = this.configManager.getConfig();
          if (!(config as any).cron) {
            this.systemState = 'NOT_CONFIGURED';
          } else {
            this.systemState = 'WAIT_EXECUTION';
          }
        } catch (error) {
          // 配置加载失败，保持NOT_CONFIGURED状态
        }
      }
      res.json(this.successResponse(this.systemState));
    });

    // 运行一次任务
    this.app.get('/api/runOnce', (req, res) => {
      if (this.systemState === 'RUNNING' || this.systemState === 'STOPPING') {
        return res.json(this.errorResponse('任务正在执行中或停止中，请稍后再试'));
      }

      this.pushLog('===================');
      this.pushLog('手动执行一次任务');

      // 异步执行任务，不阻塞响应
      setImmediate(() => {
        this.getChannels();
      });

      res.json(this.successResponse(true));
    });

    // 取消当前任务
    this.app.get('/api/cancel', (req, res) => {
      if (this.systemState === 'RUNNING') {
        this.systemState = 'STOPPING';
        this.pushLog('正在停止当前任务...');

        // 清除任务超时定时器
        if (this.taskTimeout) {
          clearTimeout(this.taskTimeout);
          this.taskTimeout = null;
        }

        // 停止爬取引擎
        this.scraperEngine.stopScraping();

        this.systemState = 'WAIT_EXECUTION';
        this.pushLog('任务已成功停止');
      } else {
        this.pushLog('当前没有正在执行的任务');
      }
      res.json(this.successResponse(true));
    });

    // 获取日志
    this.app.get('/api/getLogs', (req, res) => {
      try {
        let logs = '';
        try {
          const allLogs = fs.readFileSync(`${this.config.configDir}/log.txt`, 'utf8');
          const lines = allLogs.split('\n');
          logs = lines.slice(0, 100).join('\n');
        } catch (error) {
          // 如果文件不存在，返回内存中的日志
          logs = this.logs.join('\n');
        }
        res.json(this.successResponse(logs));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    });

    // 清空日志
    this.app.get('/api/logs/clear', (req, res) => {
      try {
        fs.writeFileSync(`${this.config.configDir}/log.txt`, '');
        this.logs = [];
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 系统统计信息
    this.app.get('/api/stats', (req, res) => {
      try {
        const systemConfig = this.configManager.getConfig();
        const blacklistCount = systemConfig.blackList ? systemConfig.blackList.length : 0;

        // 检查输出文件
        const outputFiles = {
          m3u: fs.existsSync(`${this.config.outputDir}/channels.m3u`),
          json: fs.existsSync(`${this.config.outputDir}/channels.json`),
          txt: fs.existsSync(`${this.config.outputDir}/channels.txt`),
        };

        // 获取文件大小
        const getFileSize = (filePath: string) => {
          try {
            return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
          } catch {
            return 0;
          }
        };

        const stats = {
          channels: {
            total: systemConfig.channels || 0,
            preferredAddress: systemConfig.preferredAddress || '',
            lastUpdate: (systemConfig as any).lastUpdate || null,
          },
          blacklist: {
            count: blacklistCount,
            items: systemConfig.blackList || [],
          },
          files: {
            available: outputFiles,
            sizes: {
              m3u: getFileSize(`${this.config.outputDir}/channels.m3u`),
              json: getFileSize(`${this.config.outputDir}/channels.json`),
              txt: getFileSize(`${this.config.outputDir}/channels.txt`),
            },
          },
          system: {
            state: this.systemState,
            cronExpression: (systemConfig as any).cron || '',
            uptime: Math.floor(process.uptime()),
          },
        };

        res.json(this.successResponse(stats));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    });
  }

  /**
   * 整合API服务器的路由（从src/server/api/server.ts迁移）
   */
  private setupApiServerRoutes(): void {
    // 获取配置
    this.app.get('/api/getConfig', this.asyncHandler(async (req, res) => {
      try {
        const config = this.configManager.getConfig();
        res.json(this.successResponse(config));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    }));

    // 保存配置
    this.app.post('/api/config', this.asyncHandler(async (req, res) => {
      try {
        this.configManager.update(req.body);

        // 如果更新了cron配置，重新设置定时任务
        if (req.body.cron !== undefined) {
          if (req.body.cron) {
            this.restartCronTask(req.body.cron);
          } else {
            this.stopCronTask();
          }
        }

        const updatedConfig = this.configManager.getConfig();
        res.json(this.successResponse(updatedConfig));
      } catch (error: any) {
        this.logger.error('保存配置失败', error);
        res.json(this.errorResponse(error.message));
      }
    }));

    // 部分更新配置
    this.app.patch('/api/config', this.asyncHandler(async (req, res) => {
      try {
        this.configManager.update(req.body);

        // 如果更新了cron配置，重新设置定时任务
        if (req.body.cron !== undefined) {
          if (req.body.cron) {
            this.restartCronTask(req.body.cron);
          } else {
            this.stopCronTask();
          }
        }

        const updatedConfig = this.configManager.getConfig();
        res.json(this.successResponse(updatedConfig));
      } catch (error: any) {
        this.logger.error('更新配置失败', error);
        res.json(this.errorResponse(error.message));
      }
    }));

    // 重置配置为默认值
    this.app.post('/api/config/reset', this.asyncHandler(async (req, res) => {
      try {
        const defaultConfig = {
          area: '浙江',
          cron: '* */2 * * *',
          preferredAddress: '',
          channels: 0,
          blackList: [],
          dedup: true,
          requestDelay: [1, 3] as [number, number],
          maxRetries: 3,
        };

        this.configManager.update(defaultConfig);

        // 重新设置定时任务
        if (defaultConfig.cron) {
          this.restartCronTask(defaultConfig.cron);
        } else {
          this.stopCronTask();
        }

        this.logger.info('配置已重置为默认值');
        res.json(this.successResponse(defaultConfig));
      } catch (error: any) {
        this.logger.error('重置配置失败', error);
        res.json(this.errorResponse(error.message));
      }
    }));

    // 验证配置
    this.app.post('/api/config/validate', this.asyncHandler(async (req, res) => {
      try {
        const configToValidate = req.body;
        const validationErrors: string[] = [];

        // 验证cron表达式
        if (configToValidate.cron) {
          const { validateCronInterval } = await import('../utils/cronValidator');
          const cronPattern = /^(\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*)$/;
          
          if (!cronPattern.test(configToValidate.cron)) {
            validationErrors.push('Cron表达式格式不正确');
          } else {
            const intervalValidation = validateCronInterval(configToValidate.cron, 2);
            if (!intervalValidation.isValid) {
              validationErrors.push(intervalValidation.reason || 'Cron表达式间隔无效');
            }
          }
        }

        // 验证请求延迟
        if (configToValidate.requestDelay && Array.isArray(configToValidate.requestDelay)) {
          const [min, max] = configToValidate.requestDelay;
          if (min < 0 || max < 0 || min > max) {
            validationErrors.push('请求延迟范围无效');
          }
        }

        // 验证最大重试次数
        if (configToValidate.maxRetries !== undefined && 
            (configToValidate.maxRetries < 0 || configToValidate.maxRetries > 10)) {
          validationErrors.push('最大重试次数必须在0-10之间');
        }

        // 验证频道数量
        if (configToValidate.channels !== undefined && configToValidate.channels < 0) {
          validationErrors.push('频道数量不能为负数');
        }

        // 验证黑名单
        if (configToValidate.blackList && !Array.isArray(configToValidate.blackList)) {
          validationErrors.push('黑名单必须是数组格式');
        }

        const isValid = validationErrors.length === 0;

        res.json(this.successResponse({
          isValid,
          errors: validationErrors,
        }));
      } catch (error: any) {
        this.logger.error('验证配置失败', error);
        res.json(this.errorResponse(error.message));
      }
    }));

    // 黑名单管理API
    this.setupBlacklistApiRoutes();

    // Cron管理API
    this.setupCronApiRoutes();
  }

  /**
   * 设置黑名单管理API路由
   */
  private setupBlacklistApiRoutes(): void {
    // 添加IP到黑名单
    this.app.post('/api/blacklist', this.asyncHandler(async (req, res) => {
      try {
        const { ip } = req.body;
        if (!ip) {
          throw new Error('IP地址不能为空');
        }

        const config = this.configManager.getConfig();
        const blackList = config.blackList || [];
        
        if (!blackList.includes(ip)) {
          blackList.push(ip);
          this.configManager.update({ blackList });
        }

        res.json(this.successResponse(blackList));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    }));

    // 从黑名单移除IP
    this.app.delete('/api/blacklist/:ip', this.asyncHandler(async (req, res) => {
      try {
        const { ip } = req.params;
        const config = this.configManager.getConfig();
        const blackList = config.blackList || [];
        
        const index = blackList.indexOf(ip);
        if (index > -1) {
          blackList.splice(index, 1);
          this.configManager.update({ blackList });
        }

        res.json(this.successResponse(blackList));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    }));

    // 获取黑名单
    this.app.get('/api/blacklist', (req, res) => {
      try {
        const config = this.configManager.getConfig();
        res.json(this.successResponse(config.blackList || []));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    });

    // 清空黑名单
    this.app.delete('/api/blacklist', this.asyncHandler(async (req, res) => {
      try {
        this.configManager.update({ blackList: [] });
        res.json(this.successResponse([]));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    }));

    // 检查IP是否在黑名单中
    this.app.get('/api/blacklist/check/:ip', (req, res) => {
      try {
        const { ip } = req.params;
        const config = this.configManager.getConfig();
        const blackList = config.blackList || [];
        const isBlacklisted = blackList.includes(ip);
        
        res.json(this.successResponse({ ip, isBlacklisted }));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    });
  }

  /**
   * 设置Cron管理API路由
   */
  private setupCronApiRoutes(): void {
    // 获取Cron配置
    this.app.get('/api/cron', (req, res) => {
      try {
        const config = this.configManager.getConfig();
        const cronConfig = {
          expression: (config as any).cron || '',
          enabled: !!(config as any).cron,
          nextRun: null, // 可以后续添加下次运行时间计算
        };
        res.json(this.successResponse(cronConfig));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    });

    // 更新Cron配置
    this.app.put('/api/cron', this.asyncHandler(async (req, res) => {
      try {
        const { expression, enabled } = req.body;
        
        if (enabled && !expression) {
          throw new Error('启用定时任务时必须提供cron表达式');
        }

        const updateData: any = {};
        if (enabled) {
          updateData.cron = expression;
          this.restartCronTask(expression);
        } else {
          updateData.cron = '';
          this.stopCronTask();
        }

        this.configManager.update(updateData);
        
        const cronConfig = {
          expression: enabled ? expression : '',
          enabled,
          nextRun: null,
        };
        
        res.json(this.successResponse(cronConfig));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    }));

    // 启用/禁用Cron任务
    this.app.post('/api/cron/:action', this.asyncHandler(async (req, res) => {
      try {
        const { action } = req.params;
        const config = this.configManager.getConfig();
        
        if (action === 'enable') {
          const cronExpression = (config as any).cron;
          if (!cronExpression) {
            throw new Error('未设置cron表达式');
          }
          this.restartCronTask(cronExpression);
        } else if (action === 'disable') {
          this.stopCronTask();
        } else {
          throw new Error('无效的操作');
        }

        res.json(this.successResponse({ action, success: true }));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    }));

    // 重置Cron配置
    this.app.post('/api/cron/reset', this.asyncHandler(async (req, res) => {
      try {
        const defaultCron = '0 */6 * * *';
        this.configManager.update({ cron: defaultCron });
        this.restartCronTask(defaultCron);
        
        const cronConfig = {
          expression: defaultCron,
          enabled: true,
          nextRun: null,
        };
        
        res.json(this.successResponse(cronConfig));
      } catch (error: any) {
        res.json(this.errorResponse(error.message));
      }
    }));
  }

  /**
   * 重启定时任务
   * @param cronExpression - Cron表达式
   */
  private restartCronTask(cronExpression: string): void {
    try {
      // 停止现有任务
      this.stopCronTask();

      // 启动新任务
      import('node-cron').then((cron) => {
        this.task = cron.schedule(
          cronExpression,
          () => {
            if (this.systemState === 'RUNNING' || this.systemState === 'STOPPING') {
              this.pushLog('任务正在执行中或停止中，跳过本次自动任务');
              return;
            }
            this.pushLog('===================');
            this.pushLog('自动执行一次任务');
            setImmediate(() => {
              this.getChannels();
            });
          },
          { scheduled: true, timezone: this.config.timezone }
        );
        this.pushLog(`重启自动任务成功，定时规则: ${cronExpression}`);
      });
    } catch (error: any) {
      this.logger.error('重启定时任务失败', error);
    }
  }

  /**
   * 停止定时任务
   */
  private stopCronTask(): void {
    if (this.task) {
      this.task.stop();
      this.task.destroy();
      this.task = null;
      this.pushLog('定时任务已停止');
    }
  }

  private setupFileRoutes(): void {
    // M3U文件直接访问路由
    this.app.get('/m3u', (req, res) => {
      this.serveFile(res, 'channels.m3u', 'audio/x-mpegurl');
    });

    // TXT文件直接访问路由
    this.app.get('/txt', (req, res) => {
      this.serveFile(res, 'channels.txt', 'text/plain');
    });

    // JSON文件直接访问路由
    this.app.get('/json', (req, res) => {
      this.serveFile(res, 'channels.json', 'application/json');
    });

    // 下载文件接口
    this.app.get('/api/download/:format', (req, res) => {
      const format = req.params.format?.toLowerCase();
      
      if (!format || !/^[a-z0-9]+$/i.test(format) || format.length > 10) {
        return res.status(400).json(this.errorResponse('文件格式无效'));
      }

      let fileName = '';
      let contentType = '';

      switch (format) {
        case 'm3u':
          fileName = 'channels.m3u';
          contentType = 'audio/x-mpegurl';
          break;
        case 'json':
          fileName = 'channels.json';
          contentType = 'application/json';
          break;
        case 'txt':
          fileName = 'channels.txt';
          contentType = 'text/plain';
          break;
        default:
          return res.status(400).json(this.errorResponse('不支持的文件格式'));
      }

      this.downloadFile(res, fileName, contentType);
    });
  }

  /**
   * 设置兼容性路由（从server.js迁移的API）
   */
  private serveFile(res: express.Response, fileName: string, contentType: string): void {
    try {
      const filePath = `${this.config.outputDir}/${fileName}`;
      
      if (!fs.existsSync(filePath)) {
        res.status(404).json(this.errorResponse(`${fileName}文件不存在，请先执行任务生成文件`));
        return;
      }

      res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      res.status(500).json(this.errorResponse(error.message));
    }
  }

  /**
   * 提供文件下载
   * @param res - Express响应对象
   * @param fileName - 文件名
   * @param contentType - 内容类型
   */
  private downloadFile(res: express.Response, fileName: string, contentType: string): void {
    try {
      const filePath = `${this.config.outputDir}/${fileName}`;
      
      if (!fs.existsSync(filePath)) {
        res.status(404).json(this.errorResponse('文件不存在，请先执行任务生成文件'));
        return;
      }

      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', contentType);

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      res.json(this.errorResponse(error.message));
    }
  }

  public async start(): Promise<void> {
    try {
      // 启动服务器
      this.app.listen(this.config.port, '0.0.0.0', () => {
        this.logger.info(`服务器启动成功，端口: ${this.config.port}`);
        this.pushLog(`服务器启动成功，端口: ${this.config.port}`);
      });

      // 启动内存监控
      this.startMemoryMonitoring();

      // 系统启动时自动检查是否需要执行初始任务
      await this.checkInitialTask();

      // 启动定时任务
      this.startCronTask();

    } catch (error: any) {
      this.logger.error('服务器启动失败', error);
      throw error;
    }
  }

  /**
   * 获取日志级别
   */
  private getLogLevel(): string {
    try {
      const config = this.configManager?.getConfig();
      return config?.logLevel || 'INFO';
    } catch (error) {
      return 'INFO';
    }
  }

  /**
   * 配置变化回调
   */
  private onConfigChange(config: any): void {
    try {
      this.logger?.info('配置已更新', config);
      this.pushLog('配置已更新');
    } catch (error) {
      console.error('处理配置变化失败:', error);
    }
  }

  /**
   * 启动内存监控
   */
  private startMemoryMonitoring(): void {
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      
      // 如果内存使用超过80%，记录警告
      if (totalMB > 0 && usedMB / totalMB > 0.8) {
        const warningMsg = `[MEMORY WARNING] Memory usage: ${usedMB}/${totalMB}MB (${Math.round((usedMB/totalMB)*100)}%)`;
        console.warn(warningMsg);
        this.pushLog(warningMsg);
      }
    }, 30000); // 每30秒检查一次
  }

  /**
   * 检查是否需要执行初始任务
   */
  private async checkInitialTask(): Promise<void> {
    try {
      const systemConfig = this.configManager.getConfig();

      // 检查是否有现有结果
      const hasExistingResults = systemConfig.preferredAddress && systemConfig.channels && systemConfig.channels > 0;

      if (!hasExistingResults) {
        // 没有现有结果，自动执行一次任务
        this.pushLog('===================');
        this.pushLog('系统启动检测到无现有结果，自动执行初始任务');

        // 延迟执行，确保系统完全启动
        setTimeout(() => {
          if (this.systemState !== 'RUNNING' && this.systemState !== 'STOPPING') {
            setImmediate(() => {
              this.getChannels();
            });
          }
        }, 3000); // 3秒后执行
      } else {
        this.pushLog('===================');
        this.pushLog(
          `系统启动检测到现有结果: ${systemConfig.preferredAddress} (${systemConfig.channels} 个频道)`
        );
        this.pushLog('跳过初始任务执行，将按定时规则自动执行');
      }
    } catch (error: any) {
      this.logger.error('检查初始任务失败', error);
    }
  }

  /**
   * 启动定时任务
   */
  private startCronTask(): void {
    try {
      const systemConfig = this.configManager.getConfig();

      // 每次启动服务时自动后台启动定时任务
      if ((systemConfig as any).cron) {
        // 确保没有重复的定时任务
        if (this.task) {
          this.task.stop();
          this.task.destroy();
          this.task = null;
        }

        // 动态导入node-cron
        import('node-cron').then((cron) => {
          // 设定新的定时任务
          this.task = cron.schedule(
            (systemConfig as any).cron,
            () => {
              if (this.systemState === 'RUNNING' || this.systemState === 'STOPPING') {
                this.pushLog('任务正在执行中或停止中，跳过本次自动任务');
                return;
              }
              this.pushLog('===================');
              this.pushLog('自动执行一次任务');
              // 异步执行，避免阻塞定时器
              setImmediate(() => {
                this.getChannels();
              });
            },
            { scheduled: true, timezone: this.config.timezone }
          );
          this.pushLog(`启动自动任务成功，定时规则: ${(systemConfig as any).cron}`);
          this.pushLog('定时任务将按照设定的时间自动执行，如需立即执行请使用手动运行功能');
        });
      }
    } catch (error: any) {
      this.logger.error('启动定时任务失败', error);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// 导出服务器实例
export const enhancedServer = new EnhancedServer();
