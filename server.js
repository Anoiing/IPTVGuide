import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import fs from 'fs';
import puppeteer from 'puppeteer';

const app = express();
app.use(cors());
app.use(express.json());

const response = {
  success: (data) => {
    return {
      "status": "success",
      "message": "操作成功",
      "data": data,
      "error": null,
    }
  },
  error: (error) => {
    return {
      "status": "error",
      "message": "操作失败",
      "data": null,
      "error": error,
    }
  }
}

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
// 获取m3u的源名称集合，用于去重
let seenNames = [];
// 运行日志
const runLog = [];

// 保存格式化的日志
const pushLog = (s) => {
  const l = `${(new Date().toString()).replace('GMT+0800 (中国标准时间)', '')}  ${s}`;
  runLog.push(l);
  let originLog = '';
  try {
    originLog = fs.readFileSync('./config/log.txt', 'utf8');
  } catch (error) { }
  const newLog = `${l}\n${originLog}`;
  fs.writeFileSync('./config/log.txt', newLog);
  console.log(l);
};

const gTry = (fn) => {
  try {
    return fn();
  } catch (error) {
    pushLog(error.message || String(error));
  }
};

// 获取本地配置
const getConfig = () => {
  let systemConfig = {};
  try {
    const config = fs.readFileSync('./config/config.json', 'utf8');
    systemConfig = JSON.parse(config);
  } catch (error) {
    pushLog(`获取配置文件失败：${error.message}`);
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


const maxRetries = 3;
let retries = 0;
// 带3次重试的打开指定页面
const goto = async (page, url) => {
  while (retries < maxRetries) {
    try {
      await page.goto(url, { timeout: 60000 });
      break;
    } catch (error) {
      if (error.message.indexOf('timeout') > -1 || error.message.indexOf('ERR_TIMED_OUT') > -1) {
        retries++;
        pushLog(`${url} 页面加载超时，重试 ${retries} 次`);
      } else {
        pushLog(error.message);
      }
    }
  }
}


// 等待首页的搜索框加载完成并自动提交搜索
const handleSearch = async () => {
  await gTry(() => {
    systemConfig = getConfig();
    gSearchPage.waitForSelector('input[type="submit"]', { timeout: 300000 }).then(async () => {
      const input = await gSearchPage.$('input[id="search"]');
      await gSearchPage.evaluate((el, area) => {
        el.value = area;
      }, input, systemConfig.area);
      pushLog(`开始搜索地区：${systemConfig.area}`);
      await gSearchPage.click('input[type="submit"]');
      pushLog('等待获取地区搜索结果...');
    })
  });
};

// 等待搜索结果页面加载完成并获取结果列表
const getSearchResults = async () => {
  await gTry(() => {
    gSearchPage.waitForSelector('div.tables', { timeout: 300000 }).then(async () => {
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
              d.channelNumbers = Number(ipItem.children[1].children[0].innerText.trim());
            } else {
              d.channelNumbers = ipItem.children[1].innerText.trim();
            }
            // 存活状态
            if (ipItem.children[2].childElementCount === 1) {
              d.life = Number(ipItem.children[2].children[0].children[0].innerText.trim() || 0);
            } else {

            }
            // 上线时间和运营商
            d.info = ipItem.children[4].innerText.trim();

            l.push(d);
          }
        }
        return l;
      }, resultContainer);


      // 按存活时间排序，优先选择存活时间最长的
      resultList.sort((a, b) => b.life - a.life);
      pushLog('开始优选地址...');

      // 开启新页面用于加载详情页
      let idx = 0;
      gDetailPage = await gBrowser.newPage();
      getBestChannleList(resultList, gDetailPage, idx);
    });
  });
};

// 获取最佳的频道列表
const getBestChannleList = async (resultList, detailPage, idx) => {
  await gTry(async () => {
    const checkedAddress = resultList[idx];
    pushLog(`检查地址：${checkedAddress.address}`);
    await goto(detailPage, checkedAddress.href);

    detailPage.waitForSelector('div.result', { timeout: 300000 }).then(async () => {
      const jugeContents = await detailPage.$('div#content');
      // 判断源是否失效
      let isFail = await detailPage.evaluate((el) => {
        return (el.childElementCount === 1 && el.innerHTML.indexOf('失效') >= 0) || !el.childElementCount;
      }, jugeContents);

      if (isFail) {
        pushLog(`地址 ${checkedAddress.address} 已失效，跳过`);
        // 当前源失效直接跳下一个地址
        idx++;
        await getBestChannleList();
        return;
      } else {

        // 写入组播源地址
        systemConfig = getConfig();
        systemConfig.preferredAddress = checkedAddress.address;
        fs.writeFileSync('./config/config.json', JSON.stringify(systemConfig));

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
        saveToFile(allChannels);
        return true;
      }
    });
  });
}

// 获取分页的频道列表
const getPaginatedChannels = async (detailPage, index) => {
  return await gTry(async () => {
    const tempPagination = await detailPage.$('div#Pagination');
    const currentPageChannels = await detailPage.evaluate((el, idx, seenNames) => {
      // 点击对应的页码
      const targetEle = Array.from(el.children).find((pele) => pele.innerText === String(idx + 1));
      targetEle.click();
      const channels = [];
      // 获取对应页码下的频道列表
      const contents = document.querySelector('div#content');
      for (let index = 0; index < contents.children.length; index++) {
        const child = contents.children[index];
        // 过滤第一个标题节点和中间的广告节点
        if (child.childElementCount === 2) {
          // 按名称去重
          const name = child.children[0].innerText.trim().replace(/高清$/, '');
          if (!seenNames.includes(name)) {
            channels.push({
              name,
              url: child.children[1].innerText.trim(),
            });
            seenNames.push(name);
          }
        }
      }
      return channels;
    }, tempPagination, index, seenNames);
    return currentPageChannels;
  });
};

// 获取到的频道按格式保存到文件
const saveToFile = async (allChannels) => {
  await gTry(async () => {
    // 保存到本地
    pushLog('获取频道成功，开始生成文件保存到本地...');

    // 写入频道数量
    systemConfig = getConfig();
    systemConfig.channels = allChannels.length;
    fs.writeFileSync('./config/config.json', JSON.stringify(systemConfig));

    // 保存到json文件
    await fs.writeFileSync('./output/channels.json', JSON.stringify(allChannels, null, 2));

    // 保存到txt文件
    const txtContent = allChannels.map((channel) => `${channel.name},${channel.name}\n${channel.url}`).join('\n');
    await fs.writeFileSync('./output/channels.txt', txtContent);
    pushLog('txt文件保存成功');

    // 生成m3u文件
    let m3uContent = '#EXTM3U x-tvg-url="https://live.fanmingming.com/e.xml"\n';
    m3uContent += allChannels.map((channel) => `#EXTINF:-1 tvg-name="${channel.name}" tvg-logo="",${channel.name}\n${channel.url}`).join('\n');
    await fs.writeFileSync('./output/channels.m3u', m3uContent);
    pushLog('m3u文件保存成功');
    pushLog('本次任务执行完成');
    pushLog('===================');

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
const getChannles = async () => {
  pushLog('开始执行任务');
  systemState = 'RUNNING';
  seenNames = [];
  try {
    // 启动浏览器
    pushLog('开始浏览器进程');
    await runBrowser();
    // 打开指定搜索页面
    pushLog('打开并获取搜索页面');
    gSearchPage = await gBrowser.newPage();
    await goto(gSearchPage, 'http://www.foodieguide.com/iptvsearch/hoteliptv.php');
    // 等待首页的搜索框加载完成并自动提交搜索
    pushLog('获取本地设置的地区');
    await handleSearch();
    // 等待搜索结果页面加载完成并获取结果列表
    await getSearchResults();

    // 处理谷歌广告
    // gSearchPage.waitForSelector();

  } catch (error) {
    errorLog = String(error);
    systemState = 'WAIT_EXECUTION';
  }
};

// ---------------------------------------------------------------------------------------------------------

/**
 * 以下是提供给前端的接口
 */

// 校验cron表达式
app.get('/verifierCron', async ({ query }, res) => {
  try {
    res.send(response.success(cron.validate(query.value)));
  } catch (error) {
    res.send(response.error(error));
  }
});

// 获取配置
app.get('/getConfig', async (req, res) => {
  try {
    res.send(response.success(getConfig()));
  } catch (error) {
    res.send(response.success(error));
  }
});

// 保存配置
app.post('/saveConfig', async (req, res) => {
  try {
    fs.writeFileSync('./config/config.json', JSON.stringify(req.body));
    systemState = 'WAIT_EXECUTION';
    res.send(response.success(true));
  } catch (error) {
    res.send(response.error(error));
  }
});

// 获取状态
app.get('/getStatus', async (req, res) => {
  try {
    if (systemState === 'NOT_CONFIGURED') {
      let config = {};
      try {
        config = JSON.parse(fs.readFileSync('./config/config.json', 'utf8'));
      } catch (error) { }
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
app.get('/runOnce', (req, res) => {
  try {
    pushLog('手动执行一次任务');
    getChannles();
    res.send(response.success(true));
  } catch (error) {
    res.send(response.error(error));
  }
});

// 取消当前任务
app.get('/cancel', async (req, res) => {
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
app.get('/getLogs', async (req, res) => {
  try {
    let logs = '';
    try {
      logs = fs.readFileSync('./config/log.txt', 'utf8');
    } catch (error) { }
    res.send(response.success(logs));
  } catch (error) {
    res.send(response.error(error));
  }
});

// 把当前组播地址加入黑名单
app.get('/addBlacklist', async ({ query }, res) => {
  try {
    systemConfig = getConfig();
    if (!systemConfig.blaskList) {
      systemConfig.blaskList = [];
    }
    if (!systemConfig.blaskList.includes(query.value)) {
      systemConfig.blaskList.push(query.value);
      fs.writeFileSync('./config/config.json', JSON.stringify(systemConfig));
    }
    res.send(response.success(true));
  } catch (error) {
    res.send(response.error(error));
  }
});

const port = 5174;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});