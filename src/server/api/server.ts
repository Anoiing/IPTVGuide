import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import fs from 'fs';
import dotenv from 'dotenv';
import { ScraperEngine } from '../scraper/ScraperEngine.js';
import { ConfigManager } from '../scraper/ConfigManager.js';
import { FileGenerator } from '../scraper/FileGenerator.js';
import { Logger } from '../utils/logger.js';
import { CronScheduler } from '../scheduler/CronScheduler.js';
import type { ScrapingResult } from '../../shared/types/scraper.js';

// Initialize app outside try block for export
const app = express();

try {
  dotenv.config();
  app.use(express.static('dist'));
  app.use(cors());
  app.use(express.json());

  const CONFIG_DIR = process.env.CONFIG_DIR || './config';
  const OUT_DIR = process.env.OUT_DIR || './output';
  const TZ = process.env.TZ || 'Asia/Shanghai';

  // 初始化新的模块
  const configManager = new ConfigManager(CONFIG_DIR);
  const scraperEngine = new ScraperEngine(CONFIG_DIR);
  const fileGenerator = new FileGenerator(OUT_DIR);
  const logger = new Logger(CONFIG_DIR);
  const cronScheduler = new CronScheduler({
    configDir: CONFIG_DIR,
    outputDir: OUT_DIR,
    timezone: TZ,
  });

  // 标准响应格式
  const response = {
    success: (data: any) => {
      return {
        status: 'success',
        message: '操作成功',
        data: data,
        error: null,
      };
    },
    error: (error: any) => {
      return {
        status: 'error',
        message: '操作失败',
        data: null,
        error: error,
      };
    },
  };

  // 运行状态映射
  const getSystemState = () => {
    const status = scraperEngine.getStatus();
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
          const config = configManager.loadConfig();
          return config.cron ? 'WAIT_EXECUTION' : 'NOT_CONFIGURED';
        } catch {
          return 'NOT_CONFIGURED';
        }
    }
  };

  // API 端点

  // 校验cron表达式
  app.get('/api/verifierCron', async ({ query }, res) => {
    try {
      const cronExpression = (query as any).value;
      const validation = cronScheduler.validateCronExpression(cronExpression);
      res.send(
        response.success({
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
        })
      );
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 获取配置
  app.get('/api/getConfig', async (req, res) => {
    try {
      const config = configManager.loadConfig();
      res.send(response.success(config));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 保存配置
  app.post('/api/saveConfig', async (req, res) => {
    try {
      configManager.saveConfig(req.body);

      // 重新设置定时任务
      const config = configManager.loadConfig();
      if (config.cron) {
        cronScheduler.restart(config.cron);
      } else {
        cronScheduler.stop();
      }

      res.send(response.success(true));
    } catch (error) {
      logger.error('Failed to save config', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 部分更新配置
  app.patch('/api/config', async (req, res) => {
    try {
      // 验证请求体
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new Error('Configuration data is required');
      }

      configManager.saveConfig(req.body);

      // 如果更新了cron配置，重新设置定时任务
      if (req.body.cron !== undefined) {
        const config = configManager.loadConfig();
        if (config.cron) {
          cronScheduler.restart(config.cron);
        } else {
          cronScheduler.stop();
        }
      }

      const updatedConfig = configManager.loadConfig();
      res.send(response.success(updatedConfig));
    } catch (error) {
      logger.error('Failed to update config', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 重置配置为默认值
  app.post('/api/config/reset', async (req, res) => {
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

      configManager.saveConfig(defaultConfig);

      // 重新设置定时任务
      if (defaultConfig.cron) {
        cronScheduler.restart(defaultConfig.cron);
      } else {
        cronScheduler.stop();
      }

      logger.info('Configuration reset to defaults via API');
      res.send(response.success(defaultConfig));
    } catch (error) {
      logger.error('Failed to reset config', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 验证配置
  app.post('/api/config/validate', async (req, res) => {
    try {
      const configToValidate = req.body;

      // 基本验证
      const validationErrors: string[] = [];

      if (configToValidate.cron && !cron.validate(configToValidate.cron)) {
        validationErrors.push('Invalid cron expression');
      }

      if (
        configToValidate.requestDelay &&
        Array.isArray(configToValidate.requestDelay)
      ) {
        const [min, max] = configToValidate.requestDelay;
        if (min < 0 || max < 0 || min > max) {
          validationErrors.push('Invalid request delay range');
        }
      }

      if (
        configToValidate.maxRetries !== undefined &&
        (configToValidate.maxRetries < 0 || configToValidate.maxRetries > 10)
      ) {
        validationErrors.push('Max retries must be between 0 and 10');
      }

      if (
        configToValidate.channels !== undefined &&
        configToValidate.channels < 0
      ) {
        validationErrors.push('Channel count cannot be negative');
      }

      if (
        configToValidate.blackList &&
        !Array.isArray(configToValidate.blackList)
      ) {
        validationErrors.push('Blacklist must be an array');
      }

      const isValid = validationErrors.length === 0;

      res.send(
        response.success({
          isValid,
          errors: validationErrors,
        })
      );
    } catch (error) {
      logger.error('Failed to validate config', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 获取状态
  app.get('/api/getStatus', async (req, res) => {
    try {
      const systemState = getSystemState();
      res.send(response.success(systemState));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 运行一次任务
  app.get('/api/runOnce', async (req, res) => {
    try {
      logger.info('Manual scraping task triggered');
      await cronScheduler.executeOnce();
      res.send(response.success(true));
    } catch (error) {
      logger.error('Failed to start manual scraping', error);
      res.send(response.error(error));
    }
  });

  // 取消当前任务
  app.get('/api/cancel', async (req, res) => {
    try {
      scraperEngine.stopScraping();
      logger.info('Scraping task cancelled by user');
      res.send(response.success(true));
    } catch (error) {
      logger.error('Failed to cancel scraping', error);
      res.send(response.error(error));
    }
  });

  // 获取日志
  app.get('/api/getLogs', async (req, res) => {
    try {
      let logs = '';
      try {
        const logFile = `${CONFIG_DIR}/log.txt`;
        if (fs.existsSync(logFile)) {
          const allLogs = fs.readFileSync(logFile, 'utf8');
          const lines = allLogs.split('\n');
          logs = lines.slice(0, 100).join('\n');
        }
      } catch (error) {
        logger.error('Failed to read log file', error);
      }
      res.send(response.success(logs));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 把当前组播地址加入黑名单
  app.get('/api/addBlacklist', async ({ query }, res) => {
    try {
      const ip = (query as any).value;
      if (!ip) {
        throw new Error('IP address is required');
      }

      configManager.addToBlacklist(ip);
      logger.info(`Added ${ip} to blacklist via API`);
      res.send(response.success(true));
    } catch (error) {
      logger.error('Failed to add IP to blacklist', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 从黑名单中移除IP地址
  app.delete('/api/blacklist/:ip', async (req, res) => {
    try {
      const ip = decodeURIComponent(req.params.ip);
      if (!ip) {
        throw new Error('IP address is required');
      }

      configManager.removeFromBlacklist(ip);
      logger.info(`Removed ${ip} from blacklist via API`);
      res.send(response.success(true));
    } catch (error) {
      logger.error('Failed to remove IP from blacklist', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 获取黑名单列表
  app.get('/api/blacklist', async (req, res) => {
    try {
      const blacklist = configManager.getBlacklist();
      res.send(response.success(blacklist));
    } catch (error) {
      logger.error('Failed to get blacklist', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 清空黑名单
  app.delete('/api/blacklist', async (req, res) => {
    try {
      configManager.clearBlacklist();
      logger.info('Cleared blacklist via API');
      res.send(response.success(true));
    } catch (error) {
      logger.error('Failed to clear blacklist', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 检查IP是否在黑名单中
  app.get('/api/blacklist/check/:ip', async (req, res) => {
    try {
      const ip = decodeURIComponent(req.params.ip);
      if (!ip) {
        throw new Error('IP address is required');
      }

      const isBlacklisted = configManager.isBlacklisted(ip);
      res.send(response.success({ ip, isBlacklisted }));
    } catch (error) {
      logger.error('Failed to check blacklist status', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 清空日志
  app.get('/api/clearLog', async (req, res) => {
    try {
      const logFile = `${CONFIG_DIR}/log.txt`;
      fs.writeFileSync(logFile, '');
      logger.info('Log file cleared via API');
      res.send(response.success(true));
    } catch (error) {
      logger.error('Failed to clear log file', error);
      res.send(response.error(error));
    }
  });

  // 获取cron配置信息
  app.get('/api/cron/config', async (req, res) => {
    try {
      const cronConfig = cronScheduler.getCronConfig();
      const schedulerStatus = cronScheduler.getStatus();

      res.send(
        response.success({
          config: cronConfig,
          status: schedulerStatus,
        })
      );
    } catch (error) {
      logger.error('Failed to get cron config', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 更新cron配置
  app.post('/api/cron/config', async (req, res) => {
    try {
      const { cronExpression } = req.body;

      if (!cronExpression) {
        throw new Error('Cron expression is required');
      }

      const success = cronScheduler.updateCronConfig(cronExpression);

      if (success) {
        res.send(response.success(true));
      } else {
        throw new Error('Failed to update cron configuration');
      }
    } catch (error) {
      logger.error('Failed to update cron config', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 启用定时任务
  app.post('/api/cron/enable', async (req, res) => {
    try {
      const { cronExpression } = req.body;

      const success = cronScheduler.enableCron(cronExpression);

      if (success) {
        res.send(response.success(true));
      } else {
        throw new Error('Failed to enable cron scheduler');
      }
    } catch (error) {
      logger.error('Failed to enable cron', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 禁用定时任务
  app.post('/api/cron/disable', async (req, res) => {
    try {
      const success = cronScheduler.disableCron();

      if (success) {
        res.send(response.success(true));
      } else {
        throw new Error('Failed to disable cron scheduler');
      }
    } catch (error) {
      logger.error('Failed to disable cron', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 重置cron配置为默认值
  app.post('/api/cron/reset', async (req, res) => {
    try {
      const success = cronScheduler.resetCronConfig();

      if (success) {
        res.send(response.success(true));
      } else {
        throw new Error('Failed to reset cron configuration');
      }
    } catch (error) {
      logger.error('Failed to reset cron config', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 获取cron表达式模板
  app.get('/api/cron/templates', async (req, res) => {
    try {
      const templates = cronScheduler.getCronTemplates();
      res.send(response.success(templates));
    } catch (error) {
      logger.error('Failed to get cron templates', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 验证cron表达式
  app.post('/api/cron/validate', async (req, res) => {
    try {
      const { cronExpression } = req.body;

      if (!cronExpression) {
        throw new Error('Cron expression is required');
      }

      const validation = cronScheduler.validateCronExpression(cronExpression);
      res.send(response.success(validation));
    } catch (error) {
      logger.error('Failed to validate cron expression', error);
      res.send(response.error((error as Error).message));
    }
  });

  // 每次启动服务时自动后台启动定时任务
  try {
    cronScheduler.initializeFromConfig();
    logger.info('Scheduled task initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize scheduled task', error);
  }

  // Export the app for testing

  // Start server if not in test environment
  if (process.env.NODE_ENV !== 'test') {
    const port = 5174;
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      logger.info(`Server started on port ${port}`);
    });
  }
} catch (error) {
  console.error('Failed to start server:', error);
}

// Export the app for testing
export { app };
