import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { ScraperEngine } from './src/server/scraper/ScraperEngine.js';
import { FileGenerator } from './src/server/scraper/FileGenerator.js';
import { ConfigManager } from './src/server/scraper/ConfigManager.js';
import { ChannelAvailabilityMonitorImpl } from './src/server/monitoring/index.js';
import { EnhancedConfigManager } from './src/server/config/index.js';
import { ServiceContainer } from './src/server/services/index.js';

try {
  dotenv.config();
  const app = express();
  app.use(express.static('dist'));
  app.use(cors());
  app.use(express.json());

  const response = {
    success: (data) => {
      return {
        status: 'success',
        message: '操作成功',
        data: data,
        error: null,
      };
    },
    error: (error) => {
      return {
        status: 'error',
        message: '操作失败',
        data: null,
        error: error,
      };
    },
  };

  // 系统配置管理器
  let configManager = null;
  // 爬取引擎
  let scraperEngine = null;
  // 文件生成器
  let fileGenerator = null;
  // 频道可用性监控器
  let channelMonitor = null;
  // 运行状态
  let systemState = 'NOT_CONFIGURED';
  // 运行日志
  const runLog = [];
  // 定时任务
  let task = null;
  // 任务超时定时器
  let taskTimeout = null;

  const CONFIG_DIR = process.env.CONFIG_DIR || './config';
  const OUT_DIR = process.env.OUT_DIR || './output';
  const TZ = process.env.TZ || 'Asia/Shanghai';

  // 初始化模块
  const serviceContainer = new ServiceContainer({
    configDir: CONFIG_DIR,
    dataDir: OUT_DIR,
    enableEnhancedServices: true
  });
  
  await serviceContainer.initialize();
  
  const enhancedConfigManager = new EnhancedConfigManager({
    configDir: CONFIG_DIR,
    backupDir: path.join(CONFIG_DIR, 'backups'),
    enableHotReload: true,
    enableBackup: true,
    backupInterval: 60
  });
  
  configManager = new ConfigManager(CONFIG_DIR);
  scraperEngine = new ScraperEngine(CONFIG_DIR);
  fileGenerator = new FileGenerator(OUT_DIR);
  channelMonitor = new ChannelAvailabilityMonitorImpl(CONFIG_DIR, OUT_DIR);

  // 保存格式化的日志
  const pushLog = (s) => {
    if (
      s.includes('Attempted to use detached Frame') ||
      s.includes('Protocol error')
    ) {
      return;
    }
    const l = `${new Date()
      .toString()
      .replace('GMT+0800 (中国标准时间)', '')}  ${s}`;
    runLog.push(l);
    let originLog = '';
    try {
      originLog = fs.readFileSync(`${CONFIG_DIR}/log.txt`, 'utf8');
    } catch (error) {}
    const newLog = `${l}\n${originLog}`;
    fs.writeFileSync(`${CONFIG_DIR}/log.txt`, newLog);
    console.log(l);
  };

  const gTry = (fn) => {
    try {
      return fn();
    } catch (error) {
      pushLog(error.message || String(error));
    }
  };

  // 按数字、英文、中文的顺序排序
  const customSort = (a, b) => {
    const nameA = a.name;
    const nameB = b.name;

    let indexA = 0;
    let indexB = 0;

    while (indexA < nameA.length && indexB < nameB.length) {
      let charA = nameA[indexA];
      let charB = nameB[indexB];

      let numA = null;
      let numB = null;

      if (!isNaN(Number(charA))) {
        let numStrA = '';
        while (indexA < nameA.length && !isNaN(Number(nameA[indexA]))) {
          numStrA += nameA[indexA];
          indexA++;
        }
        numA = Number(numStrA);
      }

      if (!isNaN(Number(charB))) {
        let numStrB = '';
        while (indexB < nameB.length && !isNaN(Number(nameB[indexB]))) {
          numStrB += nameB[indexB];
          indexB++;
        }
        numB = Number(numStrB);
      }

      if (numA !== null && numB !== null) {
        if (numA < numB) {
          return -1;
        } else if (numA > numB) {
          return 1;
        }
      } else if (numA !== null) {
        return -1;
      } else if (numB !== null) {
        return 1;
      } else {
        if (
          (/[a-zA-Z]/.test(charA) && !/[a-zA-Z]/.test(charB)) ||
          (/[a-zA-Z]/.test(charA) &&
            /[a-zA-Z]/.test(charB) &&
            charA.localeCompare(charB) < 0)
        ) {
          return -1;
        } else if (
          (!/[a-zA-Z]/.test(charA) && /[a-zA-Z]/.test(charB)) ||
          (/[a-zA-Z]/.test(charA) &&
            /[a-zA-Z]/.test(charB) &&
            charA.localeCompare(charB) > 0)
        ) {
          return 1;
        }

        if (/[\u4e00-\u9fa5]/.test(charA) && /[\u4e00-\u9fa5]/.test(charB)) {
          const strA = nameA.slice(indexA);
          const strB = nameB.slice(indexB);
          return strA.localeCompare(strB, 'zh-CN');
        }

        if (charA < charB) {
          return -1;
        } else if (charA > charB) {
          return 1;
        }
      }

      indexA++;
      indexB++;
    }

    return nameA.length - nameB.length;
  };

  // 配置缓存
  let configCache = null;
  let configLastModified = null;

  // 获取本地配置
  const getConfig = () => {
    try {
      // 检查配置文件是否存在
      if (!fs.existsSync(`${CONFIG_DIR}/config.json`)) {
        return {};
      }

      // 检查文件修改时间
      const stats = fs.statSync(`${CONFIG_DIR}/config.json`);
      const currentModified = stats.mtime.getTime();

      // 如果缓存存在且文件未修改，返回缓存
      if (configCache && configLastModified === currentModified) {
        return configCache;
      }

      // 加载新配置
      const config = configManager.loadConfig();

      // 只在首次加载或配置真正改变时输出日志
      if (
        !configCache ||
        JSON.stringify(configCache) !== JSON.stringify(config)
      ) {
        pushLog('配置加载成功');
      }

      // 更新缓存
      configCache = config;
      configLastModified = currentModified;

      return config;
    } catch (error) {
      if (error.message.indexOf('no such file') < 0) {
        pushLog(`获取配置文件失败：${error.message}`);
      }
      return {};
    }
  };

  // 获取到的频道按格式保存到文件
  const saveToFile = async (channelsByIP, totalChannels) => {
    await gTry(async () => {
      // 保存到本地
      pushLog('获取频道成功，开始生成文件保存到本地...');

      // 从可用的IP中随机选择一个作为首选地址
      const availableIPs = Object.keys(channelsByIP);
      const blacklist = configManager.getBlacklist();

      // 过滤掉黑名单中的IP
      const validIPs = availableIPs.filter((ip) => !blacklist.includes(ip));

      let selectedIP = '';
      if (validIPs.length > 0) {
        // 随机选择一个不在黑名单中的IP
        selectedIP = validIPs[Math.floor(Math.random() * validIPs.length)];
        pushLog(
          `随机选择首选地址: ${selectedIP} (共 ${channelsByIP[selectedIP].length} 个频道)`
        );
      } else if (availableIPs.length > 0) {
        // 如果所有IP都在黑名单中，随机选择一个
        selectedIP =
          availableIPs[Math.floor(Math.random() * availableIPs.length)];
        pushLog(
          `所有IP都在黑名单中，随机选择: ${selectedIP} (共 ${channelsByIP[selectedIP].length} 个频道)`
        );
      }

      // 更新配置中的频道数量和首选地址
      const systemConfig = getConfig();
      systemConfig.channels = totalChannels;
      systemConfig.preferredAddress = selectedIP;
      configManager.saveConfig(systemConfig);

      // 使用FileGenerator生成各种格式的文件
      await fileGenerator.generateJSON(channelsByIP);
      pushLog('JSON文件保存成功');

      await fileGenerator.generateTXT(channelsByIP);
      pushLog('TXT文件保存成功');

      await fileGenerator.generateM3U(channelsByIP);
      pushLog('M3U文件保存成功');

      pushLog('本次任务执行完成');
      systemState = 'WAIT_EXECUTION';
    });
  };

  // 获取频道数据的主入口方法
  const getChannels = async () => {
    // 检查是否已经在运行
    if (systemState === 'RUNNING' || systemState === 'STOPPING') {
      pushLog('任务正在执行中或停止中，跳过本次请求');
      return;
    }

    // 检查是否需要跳过爬取（基于可用性检查）
    const scrapingDecision = await channelMonitor.checkAvailabilityAndScrapeIfNeeded();
    if (!scrapingDecision.shouldScrape && scrapingDecision.reason !== 'MANUAL_TRIGGER') {
      pushLog(`基于可用性检查跳过爬取: ${scrapingDecision.reason}`);
      
      // 更新状态并返回
      systemState = 'WAIT_EXECUTION';
      pushLog('本次任务执行完成（跳过爬取）');
      return;
    }

    pushLog('-------------------');
    pushLog('开始执行任务');
    systemState = 'RUNNING';

    // 设置任务超时（20分钟）
    taskTimeout = setTimeout(() => {
      if (systemState === 'RUNNING') {
        pushLog('任务执行超时，自动停止');
        scraperEngine.stopScraping();
        systemState = 'ERROR';

        // 错误状态10秒后自动恢复
        setTimeout(() => {
          if (systemState === 'ERROR') {
            systemState = 'WAIT_EXECUTION';
          }
        }, 10000);
      }
    }, 20 * 60 * 1000); // 20分钟超时

    try {
      // 使用新的爬取引擎
      pushLog('启动爬取引擎');
      const result = await scraperEngine.startScraping();

      // 清除超时定时器
      if (taskTimeout) {
        clearTimeout(taskTimeout);
        taskTimeout = null;
      }

      // 检查是否被中途停止
      if (systemState === 'STOPPING') {
        pushLog('任务已被用户停止');
        systemState = 'WAIT_EXECUTION';
        return;
      }

      if (result.success) {
        if (result.skipReason) {
          // 跳过爬取的情况
          pushLog(result.skipReason);
          pushLog('本次任务执行完成（跳过爬取）');
          systemState = 'WAIT_EXECUTION';
        } else {
          // 正常爬取成功的情况
          pushLog(
            `爬取成功：获得 ${result.totalChannels} 个频道，来自 ${
              Object.keys(result.channelsByIP).length
            } 个IP地址`
          );

          // 保存结果到文件
          await saveToFile(result.channelsByIP, result.totalChannels);
        }
      } else {
        pushLog('爬取失败：' + (result.errors.join(', ') || '未知错误'));
        systemState = 'ERROR';

        // 错误状态5秒后自动恢复到等待状态
        setTimeout(() => {
          if (systemState === 'ERROR') {
            systemState = 'WAIT_EXECUTION';
          }
        }, 5000);
      }
    } catch (error) {
      // 清除超时定时器
      if (taskTimeout) {
        clearTimeout(taskTimeout);
        taskTimeout = null;
      }

      pushLog(`爬取过程中发生错误：${error.message}`);
      systemState = 'ERROR';

      // 错误状态5秒后自动恢复到等待状态
      setTimeout(() => {
        if (systemState === 'ERROR') {
          systemState = 'WAIT_EXECUTION';
        }
      }, 5000);
    }
  };

  // ---------------------------------------------------------------------------------------------------------

  /**
   * 以下是提供给前端的接口
   */

  // 校验cron表达式
  app.get('/api/verifierCron', async ({ query }, res) => {
    try {
      // 输入验证
      if (!query.value) {
        return res.send(
          response.success({
            isValid: false,
            reason: '值不能为空',
          })
        );
      }

      // 导入验证函数
      const { validateCronInterval } = await import(
        './src/server/utils/cronValidator.ts'
      );

      // 验证cron表达式
      const cronPattern = /^(\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*)$/;
      
      if (!cronPattern.test(query.value)) {
        return res.send(
          response.success({
            isValid: false,
            reason: 'Cron表达式格式不正确',
          })
        );
      }

      // 间隔验证
      const intervalValidation = validateCronInterval(query.value, 2);
      res.send(response.success(intervalValidation));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 获取配置
  app.get('/api/getConfig', async (req, res) => {
    try {
      res.send(response.success(getConfig()));
    } catch (error) {
      res.send(response.success(error));
    }
  });

  // 保存配置
  app.post('/api/saveConfig', async (req, res) => {
    try {
      // 验证请求体
      if (req.body) {
        // 验证cron表达式
        if (req.body.cron) {
          const cronPattern = /^(\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*)$/;
          
          if (!cronPattern.test(req.body.cron)) {
            return res.send(response.error('Cron表达式格式不正确'));
          }
        }

        // 验证黑名单
        if (req.body.blackList && Array.isArray(req.body.blackList)) {
          const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
          const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
          
          for (const ip of req.body.blackList) {
            if (!ipv4Pattern.test(ip) && !ipv6Pattern.test(ip)) {
              return res.send(response.error(`IP地址无效: ${ip}`));
            }
            
            // 对于IPv4，验证每个数字在0-255范围内
            if (ipv4Pattern.test(ip)) {
              const parts = ip.split('.');
              for (const part of parts) {
                const num = parseInt(part);
                if (isNaN(num) || num < 0 || num > 255) {
                  return res.send(response.error(`IP地址无效: ${ip}`));
                }
              }
            }
          }
        }

        // 验证请求延迟
        if (req.body.requestDelay && Array.isArray(req.body.requestDelay)) {
          if (req.body.requestDelay.length !== 2) {
            return res.send(response.error('请求延迟必须是包含两个数字的数组'));
          }
          
          const [min, max] = req.body.requestDelay;
          if (typeof min !== 'number' || typeof max !== 'number' || min < 0 || max < 0 || min > max) {
            return res.send(response.error('请求延迟值无效'));
          }
        }

        // 验证最大重试次数
        if (req.body.maxRetries !== undefined) {
          if (typeof req.body.maxRetries !== 'number' || req.body.maxRetries < 0 || req.body.maxRetries > 10) {
            return res.send(response.error('重试次数无效: 必须是0-10之间的数字'));
          }
        }
      }

      const currentConfig = getConfig();
      const newConfig = { ...currentConfig, ...req.body };
      configManager.saveConfig(newConfig);

      // 同时保存到增强配置管理器
      enhancedConfigManager.saveConfiguration(newConfig);

      // 清除配置缓存，强制重新加载
      configCache = null;
      configLastModified = null;

      systemState = 'WAIT_EXECUTION';
      // 先停止原来的定时任务
      if (task) {
        task.stop();
        task.destroy();
        task = null;
        pushLog('已停止原有定时任务');
      }
      // 设定新的定时任务
      if (newConfig.cron) {
        task = cron.schedule(
          newConfig.cron,
          () => {
            if (systemState === 'RUNNING' || systemState === 'STOPPING') {
              pushLog('任务正在执行中或停止中，跳过本次自动任务');
              return;
            }
            pushLog('===================');
            pushLog('自动执行一次任务');
            // 异步执行，避免阻塞定时器
            setImmediate(() => {
              getChannels();
            });
          },
          { scheduled: true, timezone: TZ }
        );
        pushLog(`已设置新的定时任务: ${newConfig.cron}`);
      }
      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 获取状态
  app.get('/api/getStatus', async (req, res) => {
    try {
      if (systemState === 'NOT_CONFIGURED') {
        let config = {};
        try {
          config = JSON.parse(
            fs.readFileSync(`${CONFIG_DIR}/config.json`, 'utf8')
          );
        } catch (error) {}
        // 没有配置项，返回未配置状态
        if (!config.cron) {
          systemState = 'NOT_CONFIGURED';
        } else {
          systemState = 'WAIT_EXECUTION';
        }
      }
      res.send(response.success(systemState));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 运行一次任务
  app.get('/api/runOnce', async (req, res) => {
    try {
      if (systemState === 'RUNNING' || systemState === 'STOPPING') {
        res.send(response.error('任务正在执行中或停止中，请稍后再试'));
        return;
      }

      pushLog('===================');
      pushLog('手动执行一次任务');

      // 异步执行任务，不阻塞响应
      setImmediate(() => {
        getChannels();
      });

      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 取消当前任务
  app.get('/api/cancel', async (req, res) => {
    try {
      if (systemState === 'RUNNING') {
        systemState = 'STOPPING';
        pushLog('正在停止当前任务...');

        // 清除任务超时定时器
        if (taskTimeout) {
          clearTimeout(taskTimeout);
          taskTimeout = null;
        }

        // 停止爬取引擎
        scraperEngine.stopScraping();

        systemState = 'WAIT_EXECUTION';
        pushLog('任务已成功停止');
      } else {
        pushLog('当前没有正在执行的任务');
      }
      res.send(response.success(true));
    } catch (error) {
      systemState = 'ERROR';
      pushLog(`停止任务失败：${error.message}`);
      res.send(response.error(error));
    }
  });

  // 取消当前任务
  app.get('/api/getLogs', async (req, res) => {
    try {
      let logs = '';
      try {
        const allLogs = fs.readFileSync(`${CONFIG_DIR}/log.txt`, 'utf8');
        const lines = allLogs.split('\n');
        logs = lines.slice(0, 100).join('\n');
      } catch (error) {}
      res.send(response.success(logs));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 把当前组播地址加入黑名单
  app.get('/api/addBlacklist', async ({ query }, res) => {
    try {
      // 输入验证
      if (!query.value) {
        return res.send(response.error('输入无效: 值不能为空'));
      }

      // IP地址验证
      const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
      const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
      
      if (!ipv4Pattern.test(query.value) && !ipv6Pattern.test(query.value)) {
        return res.send(response.error('IP地址格式无效'));
      }
      
      // 对于IPv4，验证每个数字在0-255范围内
      if (ipv4Pattern.test(query.value)) {
        const parts = query.value.split('.');
        for (const part of parts) {
          const num = parseInt(part);
          if (isNaN(num) || num < 0 || num > 255) {
            return res.send(response.error('IP地址格式无效'));
          }
        }
      }

      configManager.addToBlacklist(query.value);
      pushLog(`已将 ${query.value} 添加到黑名单`);
      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 清空日志
  app.get('/api/clearLog', async (req, res) => {
    try {
      fs.writeFileSync(`${CONFIG_DIR}/log.txt`, '');
      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 健康检查端点
  app.get('/api/health', (req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const systemConfig = getConfig();

    // 获取缓存统计信息
    const cacheStats = enhancedConfigManager ? { size: 0, maxSize: 0 } : { size: 0, maxSize: 0 };

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        external: Math.round(memoryUsage.external / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        arrayBuffers: Math.round((memoryUsage.arrayBuffers || 0) / 1024 / 1024)
      },
      system: {
        state: systemState,
        hasConfig: !!systemConfig.cron,
        hasResults: !!(
          systemConfig.preferredAddress && systemConfig.channels > 0
        ),
        taskRunning: task ? task.running : false,
      },
      cache: cacheStats,
      version: '2.0.0',
    });
  });

  // 系统统计信息
  app.get('/api/stats', (req, res) => {
    try {
      const systemConfig = getConfig();
      const blacklistCount = systemConfig.blackList
        ? systemConfig.blackList.length
        : 0;

      // 检查输出文件
      const outputFiles = {
        m3u: fs.existsSync(`${OUT_DIR}/channels.m3u`),
        json: fs.existsSync(`${OUT_DIR}/channels.json`),
        txt: fs.existsSync(`${OUT_DIR}/channels.txt`),
      };

      // 获取文件大小
      const getFileSize = (filePath) => {
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
          lastUpdate: systemConfig.lastUpdate || null,
        },
        blacklist: {
          count: blacklistCount,
          items: systemConfig.blackList || [],
        },
        files: {
          available: outputFiles,
          sizes: {
            m3u: getFileSize(`${OUT_DIR}/channels.m3u`),
            json: getFileSize(`${OUT_DIR}/channels.json`),
            txt: getFileSize(`${OUT_DIR}/channels.txt`),
          },
        },
        system: {
          state: systemState,
          cronExpression: systemConfig.cron || '',
          uptime: Math.floor(process.uptime()),
        },
      };

      res.send(response.success(stats));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 备份配置
  app.get('/api/backup', (req, res) => {
    try {
      const systemConfig = getConfig();
      const backup = {
        config: systemConfig,
        timestamp: new Date().toISOString(),
        version: '2.0.0',
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="iptv-config-backup-${
          new Date().toISOString().split('T')[0]
        }.json"`
      );
      res.send(JSON.stringify(backup, null, 2));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 恢复配置
  app.post('/api/restore', (req, res) => {
    try {
      // 输入验证
      if (!req.body) {
        return res.send(response.error('输入无效: 数据不能为空'));
      }

      const backup = req.body;

      if (!backup.config) {
        return res.send(response.error('无效的备份文件格式'));
      }

      // 验证备份文件
      const requiredFields = ['cron', 'blackList'];
      for (const field of requiredFields) {
        if (!(field in backup.config)) {
          return res.send(response.error(`备份文件缺少必要字段: ${field}`));
        }
      }

      // 验证cron表达式
      const cronPattern = /^(\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*) (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9]+,[0-9,]*)$/;
      
      if (!cronPattern.test(backup.config.cron)) {
        return res.send(response.error('Cron表达式格式不正确'));
      }

      // 验证黑名单
      if (backup.config.blackList && Array.isArray(backup.config.blackList)) {
        const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
        const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        
        for (const ip of backup.config.blackList) {
          if (!ipv4Pattern.test(ip) && !ipv6Pattern.test(ip)) {
            return res.send(response.error(`黑名单中的IP地址无效: ${ip}`));
          }
          
          // 对于IPv4，验证每个数字在0-255范围内
          if (ipv4Pattern.test(ip)) {
            const parts = ip.split('.');
            for (const part of parts) {
              const num = parseInt(part);
              if (isNaN(num) || num < 0 || num > 255) {
                return res.send(response.error(`黑名单中的IP地址无效: ${ip}`));
              }
            }
          }
        }
      }

      // 恢复配置
      configManager.saveConfig(backup.config);

      pushLog('===================');
      pushLog('配置恢复成功');
      pushLog(`恢复时间: ${backup.timestamp || '未知'}`);
      pushLog(`黑名单项目: ${backup.config.blackList.length} 个`);

      res.send(response.success(true));
    } catch (error) {
      pushLog(`配置恢复失败: ${error.message}`);
      res.send(response.error(error));
    }
  });

  // 配置备份接口
  app.get('/api/config/backup', (req, res) => {
    try {
      const backupInfo = enhancedConfigManager.createBackup();
      res.send(response.success(backupInfo));
    } catch (error) {
      res.send(response.error(error.message));
    }
  });

  // 配置恢复接口
  app.post('/api/config/restore', (req, res) => {
    try {
      const { backupId } = req.body;
      
      // 输入验证
      if (!backupId) {
        return res.send(response.error('输入无效: 备份ID不能为空'));
      }

      if (backupId.length > 100) {
        return res.send(response.error('输入无效: 备份ID长度不能超过100个字符'));
      }

      enhancedConfigManager.restoreBackup(backupId);
      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error.message));
    }
  });

  // 获取备份列表接口
  app.get('/api/config/backups', (req, res) => {
    try {
      const backups = enhancedConfigManager.listBackups();
      res.send(response.success(backups));
    } catch (error) {
      res.send(response.error(error.message));
    }
  });

  // 删除备份接口
  app.delete('/api/config/backups/:backupId', (req, res) => {
    try {
      const { backupId } = req.params;
      
      // 输入验证
      if (!backupId) {
        return res.send(response.error('输入无效: 备份ID不能为空'));
      }

      if (backupId.length > 100) {
        return res.send(response.error('输入无效: 备份ID长度不能超过100个字符'));
      }

      enhancedConfigManager.deleteBackup(backupId);
      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error.message));
    }
  });

  // M3U文件直接访问路由
  app.get('/m3u', async (req, res) => {
    try {
      const filePath = `${OUT_DIR}/channels.m3u`;
      
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return res
          .status(404)
          .send(response.error('M3U文件不存在，请先执行任务生成文件'));
      }

      // 设置正确的Content-Type
      res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="channels.m3u"');

      // 发送文件
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      res.status(500).send(response.error(error.message));
    }
  });

  // TXT文件直接访问路由
  app.get('/txt', async (req, res) => {
    try {
      const filePath = `${OUT_DIR}/channels.txt`;
      
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return res
          .status(404)
          .send(response.error('TXT文件不存在，请先执行任务生成文件'));
      }

      // 设置正确的Content-Type
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="channels.txt"');

      // 发送文件
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      res.status(500).send(response.error(error.message));
    }
  });

  // JSON文件直接访问路由
  app.get('/json', async (req, res) => {
    try {
      const filePath = `${OUT_DIR}/channels.json`;
      
      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return res
          .status(404)
          .send(response.error('JSON文件不存在，请先执行任务生成文件'));
      }

      // 设置正确的Content-Type
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="channels.json"');

      // 发送文件
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      res.status(500).send(response.error(error.message));
    }
  });

  // 下载文件接口
  app.get('/api/download/:format', async (req, res) => {
    try {
      // 输入验证
      const format = req.params.format?.toLowerCase();
      
      if (!format) {
        return res.status(400).send(response.error('文件格式无效: 格式不能为空'));
      }

      const validFormatPattern = /^[a-z0-9]+$/i;
      if (!validFormatPattern.test(format)) {
        return res.status(400).send(response.error('文件格式无效: 格式包含不允许的字符'));
      }

      if (format.length > 10) {
        return res.status(400).send(response.error('文件格式无效: 格式长度不能超过10个字符'));
      }

      let filePath = '';
      let contentType = '';
      let fileName = '';

      switch (format) {
        case 'm3u':
          filePath = `${OUT_DIR}/channels.m3u`;
          contentType = 'audio/x-mpegurl';
          fileName = 'channels.m3u';
          break;
        case 'json':
          filePath = `${OUT_DIR}/channels.json`;
          contentType = 'application/json';
          fileName = 'channels.json';
          break;
        case 'txt':
          filePath = `${OUT_DIR}/channels.txt`;
          contentType = 'text/plain';
          fileName = 'channels.txt';
          break;
        default:
          return res.status(400).send(response.error('不支持的文件格式'));
      }

      // 检查文件是否存在
      if (!fs.existsSync(filePath)) {
        return res
          .status(404)
          .send(response.error('文件不存在，请先执行任务生成文件'));
      }

      // 设置下载头
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${fileName}"`
      );
      res.setHeader('Content-Type', contentType);

      // 发送文件
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 检查频道可用性接口
  app.get('/api/checkChannels', async (req, res) => {
    try {
      pushLog('开始检查频道可用性');
      
      // 从输出目录加载频道数据
      const channelsPath = `${OUT_DIR}/channels.json`;
      if (!fs.existsSync(channelsPath)) {
        return res.status(404).send(response.error('频道文件不存在，请先执行任务生成文件'));
      }

      const channelsData = JSON.parse(fs.readFileSync(channelsPath, 'utf8'));
      let allChannels = [];
      
      // 提取所有频道
      for (const ip in channelsData) {
        allChannels = allChannels.concat(channelsData[ip]);
      }
      
      // 验证频道URL
      const results = await channelMonitor.validateChannelUrls(allChannels);
      
      // 统计结果
      const availableCount = results.filter(r => r.isAvailable).length;
      const totalCount = results.length;
      const availabilityRate = totalCount > 0 ? (availableCount / totalCount) * 100 : 0;
      
      pushLog(`频道检查完成: 可用 ${availableCount}/${totalCount} (${availabilityRate.toFixed(2)}%)`);
      
      res.send(response.success({
        results,
        summary: {
          total: totalCount,
          available: availableCount,
          unavailable: totalCount - availableCount,
          availabilityRate: availabilityRate
        }
      }));
    } catch (error) {
      pushLog(`频道检查失败: ${error.message}`);
      res.send(response.error(error.message));
    }
  });

  // 获取监控配置接口
  app.get('/api/monitoring/config', async (req, res) => {
    try {
      const systemConfig = getConfig();
      res.send(response.success(systemConfig.monitoring || {}));
    } catch (error) {
      res.send(response.error(error.message));
    }
  });

  // 更新监控配置接口
  app.post('/api/monitoring/config', async (req, res) => {
    try {
      const currentConfig = getConfig();
      const newConfig = { ...currentConfig, monitoring: req.body };
      configManager.saveConfig(newConfig);
      
      // 清除配置缓存
      configCache = null;
      configLastModified = null;
      
      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error.message));
    }
  });

  const port = process.env.PORT || 5174;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });

  // 启动内存监控
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
    const externalMB = Math.round(memoryUsage.external / 1024 / 1024);
    
    // 如果内存使用超过80%，记录警告
    if (totalMB > 0 && usedMB / totalMB > 0.8) {
      console.warn(`[MEMORY WARNING] Memory usage: ${usedMB}/${totalMB}MB (${Math.round((usedMB/totalMB)*100)}%)`);
    }
  }, 30000); // 每30秒检查一次

  // 系统启动时自动检查是否需要执行初始任务
  const systemConfig = getConfig();

  // 检查是否有现有结果
  const hasExistingResults =
    systemConfig.preferredAddress && systemConfig.channels > 0;

  if (!hasExistingResults) {
    // 没有现有结果，自动执行一次任务
    pushLog('===================');
    pushLog('系统启动检测到无现有结果，自动执行初始任务');

    // 延迟执行，确保系统完全启动
    setTimeout(() => {
      if (systemState !== 'RUNNING' && systemState !== 'STOPPING') {
        setImmediate(() => {
          getChannels();
        });
      }
    }, 3000); // 3秒后执行
  } else {
    pushLog('===================');
    pushLog(
      `系统启动检测到现有结果: ${systemConfig.preferredAddress} (${systemConfig.channels} 个频道)`
    );
    pushLog('跳过初始任务执行，将按定时规则自动执行');
  }

  // 每次启动服务时自动后台启动定时任务
  if (systemConfig.cron) {
    // 确保没有重复的定时任务
    if (task) {
      task.stop();
      task.destroy();
      task = null;
    }
    // 设定新的定时任务
    task = cron.schedule(
      systemConfig.cron,
      () => {
        if (systemState === 'RUNNING' || systemState === 'STOPPING') {
          pushLog('任务正在执行中或停止中，跳过本次自动任务');
          return;
        }
        pushLog('===================');
        pushLog('自动执行一次任务');
        // 异步执行，避免阻塞定时器
        setImmediate(() => {
          getChannels();
        });
      },
      { scheduled: true, timezone: TZ }
    );
    pushLog(`启动自动任务成功，定时规则: ${systemConfig.cron}`);
    pushLog('定时任务将按照设定的时间自动执行，如需立即执行请使用手动运行功能');
  }
} catch (error) {
  console.error('Server startup error:', error);
  process.exit(1);
}
