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

let gBrowser = null;
let gSearchPage = null;




// const browser = await puppeteer.launch({
//   devtools: true, // 打开或关闭浏览器的开发者模式
//   headless: false, // 是否以无头模式运行浏览器
//   timeout: 300000, // 超时时间，单位为毫秒
//   slowMo: 100, // 放慢速度，单位为毫秒
//   ignoreHTTPSErrors: true, // 若访问的是https页面，则忽略https错误
// });

// // 先加载最初的搜索页面
// const searchPage = await browser.newPage();
// await searchPage.goto('http://www.foodieguide.com/iptvsearch/hoteliptv.php', { timeout: 300000 });

// // 处理谷歌广告
// // searchPage.waitForSelector();

// // 等待首页的搜索框加载完成并自动提交搜索
// searchPage.waitForSelector('input[type="submit"]',).then(async () => {
//   const input = await searchPage.$('input[id="search"]');
//   await searchPage.evaluate((el) => {
//     el.value = '浙江';
//   }, input);
//   await searchPage.setDefaultTimeout(1000);
//   await searchPage.click('input[type="submit"]');
// })

// // 等待搜索结果页面加载完成并获取结果列表
// searchPage.waitForSelector('div.tables',).then(async () => {
//   const resultContainer = await searchPage.$('div.tables');
//   let resultList = await searchPage.evaluate((el) => {
//     const l = [];
//     for (let index = 0; index < el.children.length; index++) {
//       const ipItem = el.children[index];
//       const d = {};
//       if (ipItem.childElementCount === 5) {
//         // 组播地址
//         d.address = ipItem.children[0].innerText.trim();
//         // 跳转地址
//         d.href = `http://www.foodieguide.com/iptvsearch/hotellist.html?s=${d.address}`;
//         // 频道数
//         if (ipItem.children[1].childElementCount === 1) {
//           d.channelNumbers = Number(ipItem.children[1].children[0].innerText.trim());
//         } else {
//           d.channelNumbers = ipItem.children[1].innerText.trim();
//         }
//         // 存活状态
//         if (ipItem.children[2].childElementCount === 1) {
//           d.life = Number(ipItem.children[2].children[0].children[0].innerText.trim() || 0);
//         } else {

//         }
//         // 上线时间和运营商
//         d.info = ipItem.children[4].innerText.trim();

//         l.push(d);
//       }
//     }
//     return l;
//   }, resultContainer);


//   // 按存活时间排序，优先选择存活时间最长的
//   resultList.sort((a, b) => b.life - a.life);

//   // 检查结果
//   let idx = 0;
//   const detailPage = await browser.newPage();
//   const getBestChannleList = async () => {
//     const checkedAddress = resultList[idx];
//     await detailPage.goto(checkedAddress.href, { timeout: 3000000 });


//     detailPage.waitForSelector('div.result').then(async (response) => {
//       const jugeContents = await detailPage.$('div#content');
//       const jugePagination = await detailPage.$('div#Pagination');
//       // 判断源是否失效
//       // 判断结果是否有失效的内容
//       let isFail = await detailPage.evaluate((el) => {
//         return el.childElementCount === 1 && el.innerHTML.indexOf('失效') >= 0
//       }, jugeContents);
//       // 判断分页是否只有1页，防止不显示失效的内容时会卡进程
//       if (!isFail) {
//         isFail = await detailPage.evaluate((el) => {
//           return el.childElementCount === 3
//         }, jugePagination);
//       }


//       if (isFail) {
//         // 当前源失效直接跳下一个地址
//         idx++;
//         await getBestChannleList();
//         return;
//       } else {
//         // 源没有失效，获取频道列表

//         // 获取分页
//         const pagination = await detailPage.$('div#Pagination');

//         const pagis = await detailPage.evaluate((el) => {
//           console.log(el);
//           const pagiNodes = el.children;
//           const total = Number(pagiNodes[pagiNodes.length - 2].innerText);
//           console.log(total);
//           const pagis = new Array(total).fill(null);
//           console.log(pagis);
//           return pagis;
//         }, pagination);


//         // 获取分页的频道列表
//         const getPaginatedChannels = async (index) => {
//           const tempPagination = await detailPage.$('div#Pagination');
//           const currentPageChannels = await detailPage.evaluate((el, idx) => {
//             // 点击对应的页码
//             const targetEle = Array.from(el.children).find((pele) => pele.innerText === String(idx + 1));
//             targetEle.click();
//             const channels = [];
//             // 获取对应页码下的频道列表
//             const contents = document.querySelector('div#content');
//             for (let index = 0; index < contents.children.length; index++) {
//               const child = contents.children[index];
//               // 过滤第一个标题节点和中间的广告节点
//               if (child.childElementCount === 2) {
//                 channels.push({
//                   name: child.children[0].innerText.trim(),
//                   url: child.children[1].innerText.trim(),
//                 });
//               }
//             }
//             return channels;
//           }, tempPagination, index);
//           console.log(currentPageChannels)
//           return currentPageChannels;
//         };
//         let allChannels = [];
//         for (let index = 0; index < pagis.length; index++) {
//           const channels = await getPaginatedChannels(index);
//           allChannels = allChannels.concat(channels);
//         }

//         console.log(allChannels)

//         // const channleList = await detailPage.evaluate((el) => {
//         //   const channleNodes = el.children;
//         //   // 过滤掉第一个纯文本的标题节点和中间夹杂的广告节点
//         //   console.log(channleNodes);
//         //   const l = [];
//         //   for (let index = 0; index < channleNodes.length; index++) {
//         //     if (channleNodes[index].childElementCount === 2) {
//         //       const d = {};
//         //       d.name = channleNodes[index].children[0].innerText.trim();
//         //       d.url = channleNodes[index].children[1].innerText.trim();
//         //       l.push(d);
//         //     }
//         //   }
//         //   console.log(l);
//         //   return l;
//         // }, contents);
//       }

//       // console.log(channleList)
//     });
//   }

//   getBestChannleList();
// });







// app.get('/crawl', async (req, res) => {

//   const targetSelector = '.specific-element-class';
//   const element = await searchPage.$(targetSelector);
//   let content = null;
//   if (element) {
//     content = await searchPage.evaluate((el) => el.textContent, element);
//   }
//   await browser.close();
//   res.send(content || 'Element not found');
// });

// 先初始化加载主搜索页面，减少后续操作时间
app.get('/init', async (req, res) => {
  try {
    const browser = await puppeteer.launch({
      devtools: true, // 打开或关闭浏览器的开发者模式
      headless: false, // 是否以无头模式运行浏览器
      timeout: 300000, // 超时时间，单位为毫秒
      slowMo: 100, // 放慢速度，单位为毫秒
      ignoreHTTPSErrors: true, // 若访问的是https页面，则忽略https错误
    });
    // 先加载最初的搜索页面
    const page = await browser.newPage();
    const r = await page.goto('http://www.foodieguide.com/iptvsearch/hoteliptv.php', { timeout: 300000 });
    if (r.ok()) {
      gBrowser = browser;
      gSearchPage = page;
      res.send(response.success(true));
    } else {
      res.send(response.success(false));
    }
  } catch (error) {
    res.send(response.error(error));
  }
});

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
    const config = fs.readFileSync('./config/config.json', 'utf8');
    try {
      res.send(response.success(JSON.parse(config)));
    } catch (error) {
      res.send(response.success({}));
    }
  } catch (error) {
    res.send(response.error(error));
  }
});

// 保存配置
app.post('/saveConfig', async (req, res) => {
  try {
    fs.writeFileSync('./config/config.json', JSON.stringify(req.body));
    res.send(response.success(true));
  } catch (error) {
    res.send(response.error(error));
  }
});


const port = 5174;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});