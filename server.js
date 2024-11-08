import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import fs from 'fs';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

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

  // 全局浏览器对象
  let gBrowser = null;
  // 全局搜索（结果）页面对象
  let gSearchPage = null;
  // 详情页
  let gDetailPage = null;
  // 系统配置
  let systemConfig = {};
  // 运行状态
  let systemState = 'NOT_CONFIGURED';
  // 运行日志
  const runLog = [];
  // 定时任务
  let task = null;

  const CONFIG_DIR = process.env.CONFIG_DIR || './config';
  const OUT_DIR = process.env.OUT_DIR || './output';
  const TZ = process.env.TZ || 'Asia/Shanghai';

  // 保存格式化的日志
  const pushLog = (s) => {
    if (
      s.includes('Attempted to use detached Frame') ||
      s.includes('Protocol error')
    ) {
      return;
    }
    const l = `${new Date().toString().replace('GMT+0800 (中国标准时间)', '')}  ${s}`;
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

  // 获取本地配置
  const getConfig = () => {
    let systemConfig = {};
    try {
      const config = fs.readFileSync(`${CONFIG_DIR}/config.json`, 'utf8');
      systemConfig = JSON.parse(config);
    } catch (error) {
      if (error.message.indexOf('no such file') < 0) {
        pushLog(`获取配置文件失败：${error.message}`);
      }
    }
    return systemConfig;
  };

  // 启动浏览器
  const runBrowser = async () => {
    await gTry(async () => {
      if (!gBrowser) {
        gBrowser = await puppeteer.launch({
          devtools: false, // 打开或关闭浏览器的开发者模式
          headless: true, // 是否以无头模式运行浏览器
          timeout: 0, // 超时时间，单位为毫秒
          slowMo: 100, // 放慢速度，单位为毫秒
          ignoreHTTPSErrors: true, // 若访问的是https页面，则忽略https错误
          args: ['--no-sandbox'], // 添加启动参数
          // https://issues.chromium.org/issues/40480798  在docker中以root权限运行要加参数，否则浏览器会崩溃
        });
      }
    });
  };

  // 关闭浏览器
  const closeBrowser = async () => {
    if (gBrowser) {
      await gBrowser.close();
    }
  };

  // url地址过滤
  const urlInterceptor = (request) => {
    // 一些广告和数据分析的站点请求直接取消掉提高运行效率
    const blockList = [
      'google',
      'dtscdn.com',
      'dtscout.com',
      'dtsan.net',
      'histats.com',
    ];
    const url = request.url();
    if (
      request.resourceType() === 'image' ||
      blockList.some((uri) => url.indexOf(uri) > -1)
    ) {
      request.abort();
    } else {
      request.continue();
    }
  };

  const maxRetries = 5;
  let retries = 0;
  // 带3次重试的打开指定页面
  const goto = async (page, url) => {
    while (retries < maxRetries) {
      try {
        await page.goto(url, { timeout: 60000 });
        break;
      } catch (error) {
        if (
          error.message.indexOf('timeout') > -1 ||
          error.message.indexOf('ERR_TIMED_OUT') > -1
        ) {
          retries++;
          pushLog(`加载超时，重试 ${retries} 次`);
        } else {
          pushLog(error.message);
        }
      }
    }
  };

  // 等待首页的搜索框加载完成并自动提交搜索
  const handleSearch = async () => {
    await gTry(() => {
      systemConfig = getConfig();
      gSearchPage
        .waitForSelector('input[type="submit"]', { timeout: 300000 })
        .then(async () => {
          const input = await gSearchPage.$('input[id="search"]');
          await gSearchPage.evaluate(
            (el, area) => {
              el.value = area;
            },
            input,
            systemConfig.area
          );
          pushLog(`开始搜索地区：${systemConfig.area}`);
          await gSearchPage.click('input[type="submit"]');
          pushLog('等待获取地区搜索结果...');
        });
    });
  };

  // 等待搜索结果页面加载完成并获取结果列表
  const getSearchResults = async () => {
    await gTry(() => {
      systemConfig = getConfig();
      gSearchPage
        .waitForSelector('div.tables', { timeout: 300000 })
        .then(async () => {
          const resultContainer = await gSearchPage.$('div.tables');
          pushLog('获取地区搜索结果成功，正在解析结果...');
          let resultList = await gSearchPage.evaluate((el) => {
            const l = [];
            for (let index = 0; index < el.children.length; index++) {
              const ipItem = el.children[index];
              const d = {};
              if (ipItem.childElementCount === 5) {
                // 组播地址
                d.address = ipItem.children[0].innerText.trim();
                // 跳转地址
                d.href = `http://www.foodieguide.com/iptvsearch/hotellist.html?s=${d.address}`;
                // 频道数
                if (ipItem.children[1].childElementCount === 1) {
                  d.channelNumbers = Number(
                    ipItem.children[1].children[0].innerText.trim()
                  );
                } else {
                  d.channelNumbers = ipItem.children[1].innerText.trim();
                }
                // 存活状态
                if (ipItem.children[2].childElementCount === 1) {
                  d.life = Number(
                    ipItem.children[2].children[0].children[0].innerText.trim() ||
                      0
                  );
                } else {
                }
                // 上线时间和运营商
                d.info = ipItem.children[4].innerText.trim();

                l.push(d);
              }
            }
            return l;
          }, resultContainer);
          // 按存活时间排序，优先选择新上线的（存活时间长的不一定就能播放，新上线的可播放概率大）
          // 优先检查上一次结果的地址
          resultList = [
            {
              address: systemConfig.preferredAddress,
              href: `http://www.foodieguide.com/iptvsearch/hotellist.html?s=${systemConfig.preferredAddress}`,
              channelNumbers: systemConfig.channels,
              life: 1,
              info: '本地',
            },
            ...[...resultList].sort((a, b) => a.life - b.life),
          ];
          pushLog('开始优选地址...');

          // 开启新页面用于加载详情页
          let idx = 0;
          gDetailPage = await gBrowser.newPage();
          gDetailPage.setRequestInterception(true);
          gDetailPage.on('request', urlInterceptor);
          getBestChannelList(resultList, gDetailPage, idx);
        });
    });
  };

  // 获取最佳的频道列表
  const getBestChannelList = async (resultList, detailPage, idx) => {
    await gTry(async () => {
      const checkedAddress = resultList[idx];
      pushLog(`检查地址：${checkedAddress.address}`);
      retries = 0;
      await goto(detailPage, checkedAddress.href);

      detailPage
        .waitForSelector('div.result', { timeout: 300000 })
        .then(async () => {
          const jugeContents = await detailPage.$('div#content');
          // 判断源是否失效
          const isFail = await detailPage.evaluate((el) => {
            return (
              (el.childElementCount === 1 &&
                el.innerHTML.indexOf('失效') >= 0) ||
              !el.childElementCount
            );
          }, jugeContents);
          if (isFail) {
            pushLog(`地址 ${checkedAddress.address} 已失效，跳过`);
            // 当前源失效直接跳下一个地址
            idx++;
            await getBestChannelList(resultList, detailPage, idx);
            return;
          }
          // 判断源是否在黑名单中
          systemConfig = getConfig();
          if (
            systemConfig.blackList &&
            systemConfig.blackList.includes(checkedAddress.address)
          ) {
            pushLog(`地址 ${checkedAddress.address} 已在黑名单中，跳过`);
            idx++;
            await getBestChannelList(resultList, detailPage, idx);
            return;
          }

          // 源没有失效，获取频道列表
          pushLog(`正在获取地址 ${checkedAddress.address} 下的所有频道...`);
          // 获取分页
          const pagination = await detailPage.$('div#Pagination');

          const pagis = await detailPage.evaluate((el) => {
            const pagiNodes = el.children;
            const total = Number(pagiNodes[pagiNodes.length - 2].innerText);
            const pagis = new Array(total).fill(null);
            return pagis;
          }, pagination);

          let allChannels = [];
          for (let index = 0; index < pagis.length; index++) {
            const channels = await getPaginatedChannels(detailPage, index);
            allChannels = allChannels.concat(channels);
          }
          // 按频道名排序
          let channelsArray = allChannels.sort(customSort);
          // 按频道名去重
          if (systemConfig.dedup) {
            channelsArray = [
              ...new Set([...channelsArray].map((item) => item.name)),
            ].map((name) =>
              [...channelsArray].find((item) => item.name === name)
            );
          }
          saveToFile(channelsArray, checkedAddress.address);
          return true;
        });
    });
  };

  // 获取分页的频道列表
  const getPaginatedChannels = async (detailPage, index) => {
    return await gTry(async () => {
      const tempPagination = await detailPage.$('div#Pagination');
      const currentPageChannels = await detailPage.evaluate(
        (el, idx) => {
          // 点击对应的页码
          const targetEle = Array.from(el.children).find(
            (pele) => pele.innerText === String(idx + 1)
          );
          targetEle.click();
          const channels = [];
          // 获取对应页码下的频道列表
          const contents = document.querySelector('div#content');
          for (let index = 0; index < contents.children.length; index++) {
            const child = contents.children[index];
            // 过滤第一个标题节点和中间的广告节点
            if (child.childElementCount === 2) {
              channels.push({
                name: child.children[0].innerText.trim(),
                url: child.children[1].innerText.trim(),
              });
            }
          }
          return channels;
        },
        tempPagination,
        index
      );
      return currentPageChannels;
    });
  };

  // 获取到的频道按格式保存到文件
  const saveToFile = async (allChannels, preferredAddress) => {
    await gTry(async () => {
      // 保存到本地
      pushLog('获取频道成功，开始生成文件保存到本地...');

      // 写入优选地址和频道数量
      systemConfig = getConfig();
      systemConfig.preferredAddress = preferredAddress;
      systemConfig.channels = allChannels.length;
      fs.writeFileSync(
        `${CONFIG_DIR}/config.json`,
        JSON.stringify(systemConfig)
      );

      // 保存到json文件
      await fs.writeFileSync(
        `${OUT_DIR}/channels.json`,
        JSON.stringify(allChannels, null, 2)
      );

      // 保存到txt文件
      const txtContent = allChannels
        .map((channel) => `${channel.name},${channel.name}\n${channel.url}`)
        .join('\n');
      await fs.writeFileSync(`${OUT_DIR}/channels.txt`, txtContent);
      pushLog('txt文件保存成功');

      // 生成m3u文件
      let m3uContent =
        '#EXTM3U x-tvg-url="https://live.fanmingming.com/e.xml"\n';
      m3uContent += allChannels
        .map((channel) => {
          let logoName = channel.name
            .replace('高清', '')
            .replace(' 4K', '')
            .replace(' 4k', '')
            .replace('-', '')
            .trim();
          let groupName = '其他';
          if (logoName.includes('CCTV')) {
            groupName = '央视';
          } else if (logoName.includes('卫视')) {
            groupName = '卫视';
          } else if (logoName.includes('NewTV')) {
            groupName = '新视';
          } else if (logoName.includes('CHC')) {
            groupName = '电影';
          }
          return channel.name
            ? `#EXTINF:-1 tvg-name="${channel.name}" tvg-logo="https://live.fanmingming.com/${logoName.includes('广播') ? 'radio' : 'tv'}/${logoName}.png" group-title="${groupName}",${channel.name}\n${channel.url}`
            : '';
        })
        .join('\n');
      await fs.writeFileSync(`${OUT_DIR}/channels.m3u`, m3uContent);
      pushLog('m3u文件保存成功');
      pushLog('本次任务执行完成');

      systemState = 'WAIT_EXECUTION';

      if (gDetailPage) {
        await gDetailPage.close();
      }
      if (gSearchPage) {
        await gSearchPage.close();
      }
    });
  };

  // 获取频道数据的主入口方法
  const getChannels = async () => {
    pushLog('-------------------');
    pushLog('开始执行任务');
    systemState = 'RUNNING';
    try {
      // 启动浏览器
      pushLog('开始浏览器进程');
      await runBrowser();
      // 打开指定搜索页面
      pushLog('打开并获取搜索页面');
      gSearchPage = await gBrowser.newPage();
      retries = 0;
      gSearchPage.setRequestInterception(true);
      gSearchPage.on('request', urlInterceptor);
      await goto(
        gSearchPage,
        'http://www.foodieguide.com/iptvsearch/hoteliptv.php'
      );
      // 等待首页的搜索框加载完成并自动提交搜索
      pushLog('获取本地设置的地区');
      await handleSearch();
      // 等待搜索结果页面加载完成并获取结果列表
      await getSearchResults();
    } catch (error) {
      pushLog(error.message);
      systemState = 'WAIT_EXECUTION';
    }
  };

  // ---------------------------------------------------------------------------------------------------------

  /**
   * 以下是提供给前端的接口
   */

  // 校验cron表达式
  app.get('/api/verifierCron', async ({ query }, res) => {
    try {
      res.send(response.success(cron.validate(query.value)));
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
      systemConfig = getConfig();
      systemConfig = { ...systemConfig, ...req.body };
      fs.writeFileSync(
        `${CONFIG_DIR}/config.json`,
        JSON.stringify(systemConfig)
      );
      systemState = 'WAIT_EXECUTION';
      // 先停止原来的定时任务
      if (task) {
        task.stop();
      }
      // 设定新的定时任务
      task = cron.schedule(
        systemConfig.cron,
        () => {
          pushLog('===================');
          pushLog('自动执行一次任务');
          getChannels();
        },
        { scheduled: true, timezone: TZ }
      );
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
  app.get('/api/runOnce', (req, res) => {
    try {
      pushLog('===================');
      pushLog('手动执行一次任务');
      getChannels();
      res.send(response.success(true));
    } catch (error) {
      res.send(response.error(error));
    }
  });

  // 取消当前任务
  app.get('/api/cancel', async (req, res) => {
    try {
      if (gDetailPage) {
        await gDetailPage.close();
      }
      if (gSearchPage) {
        await gSearchPage.close();
      }
      systemState = 'WAIT_EXECUTION';
      pushLog('手动停止执行当前任务');
      res.send(response.success(true));
    } catch (error) {
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
      systemConfig = getConfig();
      if (!systemConfig.blackList) {
        systemConfig.blackList = [];
      }
      if (!systemConfig.blackList.includes(query.value)) {
        systemConfig.blackList.push(query.value);
        systemConfig.preferredAddress = '';
        systemConfig.channels = 0;
        fs.writeFileSync(
          `${CONFIG_DIR}/config.json`,
          JSON.stringify(systemConfig)
        );
      }
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

  const port = 5174;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });

  // 每次启动服务时自动后台启动定时任务
  systemConfig = getConfig();
  if (systemConfig.cron) {
    // 先停止原来的定时任务
    if (task) {
      task.stop();
    }
    // 设定新的定时任务
    task = cron.schedule(
      systemConfig.cron,
      () => {
        pushLog('===================');
        pushLog('自动执行一次任务');
        getChannels();
      },
      { scheduled: true, timezone: TZ }
    );
    pushLog('启动自动任务成功');
  }
} catch (error) {}
