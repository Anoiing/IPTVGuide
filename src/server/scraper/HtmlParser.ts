// HTML解析模块
import * as cheerio from 'cheerio';
import type { HtmlParser as IHtmlParser } from '../../shared/types/interfaces';
import type {
  ChannelInfo,
} from '../../shared/types/scraper';
import type { PaginationInfo } from '../../shared/types/api';
import { Logger } from '../utils/logger';
import {
  isValidIP,
  isValidIPWithPort,
  isValidHttpURL,
  sanitizeChannelName,
} from '../utils/validation';

export class HtmlParser implements IHtmlParser {
  private logger: Logger;

  // 需要移除的追踪脚本域名
  private trackingDomains: string[] = [
    's4.histats.com',
    'www.googletagmanager.com',
    'www.google-analytics.com',
    'googletagmanager.com',
    'google-analytics.com',
    'histats.com',
    'doubleclick.net',
    'googlesyndication.com',
    'facebook.com/tr',
    'connect.facebook.net',
  ];

  constructor(configDir: string = './config') {
    this.logger = new Logger(configDir);
  }

  parseHotelIPs(html: string): string[] {
    try {
      const $ = cheerio.load(html);

      // 清理追踪脚本
      this.removeTrackingScripts($);

      const ips: string[] = [];

      // 查找文本为"Hotel IPTV"的div节点
      $('div').each((_, element) => {
        const $div = $(element);
        const text = $div.text().trim();

        if (text.includes('Hotel IPTV')) {
          // 查找该div的span兄弟节点
          const $spans = $div.siblings('span');

          $spans.each((_, spanElement) => {
            const spanText = $(spanElement).text().trim();

            // 提取IP地址（可能包含端口）
            const ipMatches = spanText.match(
              /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g
            );

            if (ipMatches) {
              ipMatches.forEach((ip) => {
                // 验证IP格式
                const cleanIP = ip.split(':')[0]; // 获取不带端口的IP
                if (isValidIP(cleanIP) && !ips.includes(ip)) {
                  ips.push(ip);
                  this.logger.info(`找到Hotel IPTV IP: ${ip}`);
                }
              });
            }
          });
        }
      });

      // 如果没有找到，尝试其他选择器
      if (ips.length === 0) {
        this.logger.warn('主选择器未找到Hotel IPTV IP，尝试备用方法');

        // 尝试查找包含"Hotel"或"IPTV"的元素
        $('*').each((_, element) => {
          const $el = $(element);
          const text = $el.text();

          if (text.includes('Hotel') && text.includes('IPTV')) {
            // 在该元素及其兄弟元素中查找IP
            const allText = $el.parent().text();
            const ipMatches = allText.match(
              /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g
            );

            if (ipMatches) {
              ipMatches.forEach((ip) => {
                const cleanIP = ip.split(':')[0];
                if (isValidIP(cleanIP) && !ips.includes(ip)) {
                  ips.push(ip);
                  this.logger.info(`找到Hotel IPTV IP (备用方法): ${ip}`);
                }
              });
            }
          }
        });
      }

      this.logger.info(`解析到 ${ips.length} 个Hotel IPTV IP`);
      return ips;
    } catch (error) {
      this.logger.error('解析Hotel IP时出错', error);
      return [];
    }
  }

  parseChannelIPs(html: string): string[] {
    try {
      const $ = cheerio.load(html);

      // 清理追踪脚本
      this.removeTrackingScripts($);

      const channelIPs: string[] = [];

      // 查找class="result"的div节点
      $('.result').each((_, resultElement) => {
        const $result = $(resultElement);

        // 在result节点下查找class="channel"的元素
        $result.find('.channel').each((_, channelElement) => {
          const $channel = $(channelElement);
          const channelText = $channel.text().trim();

          // 提取带端口号的IP地址
          const ipMatches = channelText.match(
            /\b(?:\d{1,3}\.){3}\d{1,3}:\d+\b/g
          );

          if (ipMatches) {
            ipMatches.forEach((ip) => {
              if (isValidIPWithPort(ip) && !channelIPs.includes(ip)) {
                channelIPs.push(ip);
                this.logger.info(`找到频道IP: ${ip}`);
              }
            });
          }
        });
      });

      // 如果没有找到，尝试其他选择器
      if (channelIPs.length === 0) {
        this.logger.warn('主选择器未找到频道IP，尝试备用方法');

        // 尝试直接在页面中查找IP:端口格式
        const pageText = $('body').text();
        const ipMatches = pageText.match(/\b(?:\d{1,3}\.){3}\d{1,3}:\d+\b/g);

        if (ipMatches) {
          ipMatches.forEach((ip: string) => {
            if (isValidIPWithPort(ip) && !channelIPs.includes(ip)) {
              channelIPs.push(ip);
              this.logger.info(`找到频道IP (备用方法): ${ip}`);
            }
          });
        }
      }

      this.logger.info(`解析到 ${channelIPs.length} 个频道IP`);
      return channelIPs;
    } catch (error) {
      this.logger.error('解析频道IP时出错', error);
      return [];
    }
  }

  /**
   * 解析频道列表
   * @param html HTML内容
   * @returns 频道信息数组
   */
  /**
   * 解析频道列表
   * @param html HTML内容
   * @returns 频道信息数组
   */
  parseChannelList(html: string): ChannelInfo[] {
    try {
      // 检查HTML是否为空或无效
      if (!html || html.trim() === '') {
        this.logger.error('接收到空HTML内容');
        return [];
      }

      this.logger.debug(`开始解析HTML，长度: ${html.length} 字符`);
      this.logger.debug(`HTML前500字符: ${html.substring(0, 500)}`);

      // 修复不完整的HTML结构
      let fixedHtml = html;

      // 检查HTML结构是否完整
      const hasHead = html.includes('<head>');
      const hasBody = html.includes('<body>');
      const hasHtml = html.includes('<html');
      const hasDoctype = html.includes('<!DOCTYPE');

      this.logger.debug(
        `HTML结构检查 - DOCTYPE: ${hasDoctype}, HTML: ${hasHtml}, HEAD: ${hasHead}, BODY: ${hasBody}`
      );

      if (hasHead && !hasBody) {
        // 如果有head但没有body，在head结束后添加body标签
        const headEndIndex = html.indexOf('</head>');
        if (headEndIndex !== -1) {
          const beforeHead = html.substring(0, headEndIndex + 7); // 包含</head>
          const afterHead = html.substring(headEndIndex + 7);
          fixedHtml = beforeHead + '\n<body>\n' + afterHead + '\n</body>';
          this.logger.debug('修复HTML：添加了body标签');
        }
      } else if (!hasHead && !hasBody && hasHtml) {
        // 如果既没有head也没有body，但有html标签，查找DOCTYPE和html标签后添加完整结构
        const doctypeMatch = html.match(/<!DOCTYPE[^>]*>\s*<html[^>]*>/i);
        if (doctypeMatch) {
          const afterHtml = html.substring(
            doctypeMatch.index! + doctypeMatch[0].length
          );
          fixedHtml =
            doctypeMatch[0] +
            '\n<head></head>\n<body>\n' +
            afterHtml +
            '\n</body>\n</html>';
          this.logger.debug('修复HTML：添加了完整的head和body结构');
        } else {
          // 如果没有DOCTYPE但有html标签，直接在html标签后添加结构
          const htmlMatch = html.match(/<html[^>]*>/i);
          if (htmlMatch) {
            const afterHtml = html.substring(
              htmlMatch.index! + htmlMatch[0].length
            );
            fixedHtml =
              htmlMatch[0] +
              '\n<head></head>\n<body>\n' +
              afterHtml +
              '\n</body>\n</html>';
            this.logger.debug('修复HTML：在html标签后添加了head和body');
          }
        }
      } else if (!hasHead && !hasBody && !hasHtml && !hasDoctype) {
        // 如果是纯HTML片段（listall.php返回的部分HTML节点），直接包装在基本HTML结构中
        fixedHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
${html}
</body>
</html>`;
        this.logger.debug('修复HTML：包装为完整的HTML文档');
      }

      // 使用更宽松的解析选项
      const $ = cheerio.load(fixedHtml, {
        xmlMode: false,
        decodeEntities: true,
        normalizeWhitespace: true,
        recognizeSelfClosing: true,
        // 添加更宽松的解析选项
        lowerCaseTags: true,
        lowerCaseAttributeNames: true,
      });

      // 清理追踪脚本
      this.removeTrackingScripts($);

      const channels: ChannelInfo[] = [];

      // 检查是否是源失效页面
      const pageText = $('body').text();
      if (pageText.includes('源暂时失效') || pageText.includes('请稍候再试')) {
        this.logger.warn('检测到源失效页面');
        return [];
      }

      // 详细分析HTML结构
      const totalResultCount = $('.result').length;
      const tablesResultCount = $('.tables .result').length;

      // 检查各种可能的class名称
      const resultVariants = [
        '.result',
        '.Result',
        '.RESULT',
        '[class*="result"]',
        '[class*="Result"]',
      ];
      const channelVariants = [
        '.channel',
        '.Channel',
        '.CHANNEL',
        '[class*="channel"]',
        '[class*="Channel"]',
      ];
      const m3u8Variants = [
        '.m3u8',
        '.M3U8',
        '[class*="m3u8"]',
        '[class*="M3U8"]',
      ];

      this.logger.debug('检查各种class变体:');
      resultVariants.forEach((selector) => {
        const count = $(selector).length;
        if (count > 0) {
          this.logger.debug(`  ${selector}: ${count} 个元素`);
        }
      });

      channelVariants.forEach((selector) => {
        const count = $(selector).length;
        if (count > 0) {
          this.logger.debug(`  ${selector}: ${count} 个元素`);
        }
      });

      m3u8Variants.forEach((selector) => {
        const count = $(selector).length;
        if (count > 0) {
          this.logger.debug(`  ${selector}: ${count} 个元素`);
        }
      });

      // 统计同时包含.channel和.m3u8的.result元素
      let validResultCount = 0;
      $('.result').each((_, element) => {
        const $result = $(element);
        const hasChannel = $result.find('.channel').length > 0;
        const hasM3u8 = $result.find('.m3u8').length > 0;
        if (hasChannel && hasM3u8) {
          validResultCount++;
        }
      });

      this.logger.info(
        `找到 ${totalResultCount} 个 .result 元素，其中 ${tablesResultCount} 个在 .tables 内，${validResultCount} 个同时包含 .channel 和 .m3u8`
      );

      // 如果标准选择器没找到，尝试查找所有可能的结构
      if (totalResultCount === 0) {
        this.logger.warn('未找到.result元素，分析整体HTML结构');

        // 输出所有class属性
        const allClasses = new Set<string>();
        $('*[class]').each((_, element) => {
          const classes = $(element).attr('class')?.split(/\s+/) || [];
          classes.forEach((cls) => allClasses.add(cls));
        });

        this.logger.debug(
          `HTML中发现的所有class: ${Array.from(allClasses).sort().join(', ')}`
        );

        // 查找包含"result"、"channel"、"m3u8"等关键词的元素
        const keywordElements = {
          result: $('*').filter((_, el) => {
            const className = $(el).attr('class') || '';
            return className.toLowerCase().includes('result');
          }).length,
          channel: $('*').filter((_, el) => {
            const className = $(el).attr('class') || '';
            return className.toLowerCase().includes('channel');
          }).length,
          m3u8: $('*').filter((_, el) => {
            const className = $(el).attr('class') || '';
            return className.toLowerCase().includes('m3u8');
          }).length,
        };

        this.logger.debug(
          `包含关键词的元素数量: result=${keywordElements.result}, channel=${keywordElements.channel}, m3u8=${keywordElements.m3u8}`
        );

        return this.parseAlternativeStructure($);
      }

      // 只查找同时包含.channel和.m3u8的.result节点
      $('.result').each((index, resultElement) => {
        const $result = $(resultElement);

        // 检查是否同时包含.channel和.m3u8节点
        const $channelDiv = $result.find('.channel');
        const $m3u8Div = $result.find('.m3u8');

        // 详细记录每个result的结构
        this.logger.debug(`第 ${index + 1} 个 .result 元素分析:`);
        this.logger.debug(`  - .channel 元素数量: ${$channelDiv.length}`);
        this.logger.debug(`  - .m3u8 元素数量: ${$m3u8Div.length}`);

        // 如果没有找到标准选择器，尝试其他可能的选择器
        if ($channelDiv.length === 0) {
          const alternativeChannelSelectors = [
            '.Channel',
            '.CHANNEL',
            '[class*="channel"]',
            '[class*="Channel"]',
          ];
          alternativeChannelSelectors.forEach((selector) => {
            const count = $result.find(selector).length;
            if (count > 0) {
              this.logger.debug(
                `  - 备用频道选择器 ${selector}: ${count} 个元素`
              );
            }
          });
        }

        if ($m3u8Div.length === 0) {
          const alternativeM3u8Selectors = [
            '.M3U8',
            '[class*="m3u8"]',
            '[class*="M3U8"]',
          ];
          alternativeM3u8Selectors.forEach((selector) => {
            const count = $result.find(selector).length;
            if (count > 0) {
              this.logger.debug(
                `  - 备用M3U8选择器 ${selector}: ${count} 个元素`
              );
            }
          });
        }

        // 记录result元素的HTML结构（前200字符）
        const resultHtml = $result.html() || '';
        this.logger.debug(
          `  - HTML结构前200字符: ${resultHtml.substring(0, 200)}`
        );

        // 记录所有子元素的class属性
        const childClasses: string[] = [];
        $result.find('*').each((_, child) => {
          const className = $(child).attr('class');
          if (className && !childClasses.includes(className)) {
            childClasses.push(className);
          }
        });
        this.logger.debug(`  - 子元素class列表: ${childClasses.join(', ')}`);

        if ($channelDiv.length === 0 || $m3u8Div.length === 0) {
          this.logger.debug(`  - 跳过：缺少必要的子元素`);
          return;
        }

        // 跳过包含"源暂时失效"的result
        const resultText = $result.text();
        if (resultText.includes('源暂时失效')) {
          return; // 跳过这个result
        }

        // 获取频道名称 - 从div中的文本内容获取
        let channelName = '';

        // 查找 style="float: left;" 的div，这是频道名称所在的位置
        const $channelNameDiv = $channelDiv
          .find('div[style*="float: left"]')
          .first();
        if ($channelNameDiv.length > 0) {
          const nameText = sanitizeChannelName($channelNameDiv.text());
          if (nameText) {
            channelName = nameText;
          }
        }

        // 如果没有找到，尝试从a标签下的div获取频道名称
        if (!channelName) {
          const $channelNameDiv2 = $channelDiv.find('a div').first();
          if ($channelNameDiv2.length > 0) {
            const nameText = sanitizeChannelName($channelNameDiv2.text());
            if (nameText) {
              channelName = nameText;
            }
          }
        }

        // 如果还没有找到，尝试直接从div获取
        if (!channelName) {
          const nameText = sanitizeChannelName($channelDiv.text());
          if (nameText) {
            channelName = nameText;
          }
        }

        if (!channelName) {
          this.logger.warn(`第 ${index + 1} 个 result 中未找到有效频道名称`);
          return;
        }

        // 查找频道URL（在.m3u8 div中的table td中）
        // $m3u8Div已在前面声明，这里直接使用
        // 在table的td中查找URL - 查找包含http的td
        let channelUrl = '';
        $m3u8Div.find('td').each((_, tdElement) => {
          const tdText = $(tdElement).text().trim();
          if (tdText.startsWith('http://') || tdText.startsWith('https://')) {
            channelUrl = tdText;
            return false; // 找到后停止循环
          }
        });

        // 如果在td中没找到，尝试在整个m3u8 div中查找
        if (!channelUrl) {
          const m3u8Text = $m3u8Div.text();
          const urlMatches = m3u8Text.match(/https?:\/\/[^\s]+/g);
          if (urlMatches && urlMatches.length > 0) {
            channelUrl = urlMatches[0];
          }
        }

        // 验证URL，排除UDP协议
        if (
          channelUrl &&
          !channelUrl.startsWith('udp://') &&
          isValidHttpURL(channelUrl)
        ) {
          // 确定频道分组
          let group = '其他';
          if (channelName.includes('CCTV')) {
            group = '央视';
          } else if (channelName.includes('卫视')) {
            group = '卫视';
          } else if (channelName.includes('NewTV')) {
            group = '新视';
          } else if (channelName.includes('CHC')) {
            group = '电影';
          }

          this.logger.info(`解析到频道: ${channelName} -> ${channelUrl}`);
          channels.push({
            name: channelName,
            url: channelUrl,
            group,
          });
        } else {
          this.logger.warn(
            `第 ${index + 1} 个 result 中未找到有效URL，频道名: ${channelName}`
          );
        }
      });

      // 如果没有找到频道，尝试备用方法
      if (channels.length === 0) {
        this.logger.warn('主方法未找到频道，尝试备用方法');
        return this.parseWithBackupMethod($);
      }

      this.logger.info(`解析到 ${channels.length} 个频道`);
      return channels;
    } catch (error) {
      this.logger.error('解析频道列表时出错', error);
      return [];
    }
  }

  /**
   * 备用解析方法，当主要解析方法失败时使用
   * @param $ cheerio实例
   * @returns 频道信息数组
   */
  private parseWithBackupMethod($: cheerio.Root): ChannelInfo[] {
    const channels: ChannelInfo[] = [];

    try {
      // 尝试查找所有包含http://的文本
      $('*').each((_, element) => {
        const $el = $(element);
        const text = $el.text();

        // 查找HTTP/HTTPS URL，自动排除UDP协议
        const urlMatches = text.match(/https?:\/\/[^\s]+/g);
        if (urlMatches) {
          urlMatches.forEach((url) => {
            // 清理URL中可能的多余字符
            let cleanUrl = url;
            // 如果URL后面有引号或其他非URL字符，去除
            const endPos = url.search(/["\s<>]/);
            if (endPos > 0) {
              cleanUrl = url.substring(0, endPos);
            }

            if (!cleanUrl.startsWith('udp://') && isValidHttpURL(cleanUrl)) {
              // 尝试从父元素中找到频道名称
              const $parent = $el.closest('.result');
              let possibleName: string | null = '';

              if ($parent.length > 0) {
                const $channelDiv = $parent
                  .find('.channel div[style*="float: left"]')
                  .first();
                // 确保找到了元素再获取文本
                if ($channelDiv.length > 0) {
                  possibleName = sanitizeChannelName($channelDiv.text());
                } else {
                  // 如果没找到指定元素，尝试从父元素获取文本
                  possibleName = sanitizeChannelName($parent.text());
                  this.logger.debug(
                    `未找到频道名称元素，使用父元素文本: ${possibleName}`
                  );
                }
              }

              // 如果没有找到名称，尝试从URL中提取
              if (!possibleName || possibleName.trim() === '') {
                // 从URL中提取可能的频道名
                const urlParts = cleanUrl.split('/');
                const lastPart = urlParts[urlParts.length - 1];
                if (lastPart && lastPart.length > 0) {
                  // 移除扩展名和参数
                  const nameWithoutExt = lastPart.split('.')[0].split('?')[0];
                  if (nameWithoutExt && nameWithoutExt.length > 0) {
                    possibleName = nameWithoutExt;
                  }
                }
              }

              // 如果仍然没有名称，使用"未命名频道"
              if (!possibleName) {
                possibleName = `未命名频道${channels.length + 1}`;
              }

              if (
                !channels.some(
                  (ch) => ch.name === possibleName && ch.url === cleanUrl
                )
              ) {
                // 确定频道分组
                let group = '其他';
                if (possibleName.includes('CCTV')) {
                  group = '央视';
                } else if (possibleName.includes('卫视')) {
                  group = '卫视';
                } else if (possibleName.includes('NewTV')) {
                  group = '新视';
                } else if (possibleName.includes('CHC')) {
                  group = '电影';
                }

                channels.push({
                  name: possibleName,
                  url: cleanUrl,
                  group,
                });
                this.logger.info(
                  `备用方法解析到频道: ${possibleName} -> ${cleanUrl}`
                );
              }
            }
          });
        }
      });

      this.logger.info(`备用方法解析到 ${channels.length} 个频道`);
      return channels;
    } catch (error) {
      this.logger.error('备用解析方法出错', error);
      return [];
    }
  }

  /**
   * 解析替代结构，当页面不包含.result元素时使用
   * @param $ cheerio实例
   * @returns 频道信息数组
   */
  private parseAlternativeStructure($: cheerio.Root): ChannelInfo[] {
    const channels: ChannelInfo[] = [];

    try {
      // 尝试查找表格结构
      $('table').each((_, tableElement) => {
        const $table = $(tableElement);

        // 查找表格行
        $table.find('tr').each((_, trElement) => {
          const $tr = $(trElement);
          const $tds = $tr.find('td');

          // 至少需要两列：频道名和URL
          if ($tds.length >= 2) {
            let channelName = '';
            let channelUrl = '';

            // 尝试从第一列获取频道名
            const nameText = sanitizeChannelName($($tds[0]).text());
            if (nameText) {
              channelName = nameText;
            }

            // 尝试从所有列中查找URL
            $tds.each((_, tdElement) => {
              const tdText = $(tdElement).text().trim();
              if (
                tdText.startsWith('http://') ||
                tdText.startsWith('https://')
              ) {
                channelUrl = tdText;
                return false; // 找到后停止循环
              }
            });

            // 如果没有找到URL，尝试查找a标签的href
            if (!channelUrl) {
              const $links = $tr.find('a[href^="http"]');
              if ($links.length > 0) {
                channelUrl = $links.attr('href') || '';
              }
            }

            // 验证并添加频道
            if (channelName && channelUrl && isValidHttpURL(channelUrl)) {
              // 确定频道分组
              let group = '其他';
              if (channelName.includes('CCTV')) {
                group = '央视';
              } else if (channelName.includes('卫视')) {
                group = '卫视';
              } else if (channelName.includes('NewTV')) {
                group = '新视';
              } else if (channelName.includes('CHC')) {
                group = '电影';
              }

              channels.push({
                name: channelName,
                url: channelUrl,
                group,
              });
              this.logger.info(
                `替代结构解析到频道: ${channelName} -> ${channelUrl}`
              );
            }
          }
        });
      });

      // 如果表格中没有找到频道，尝试查找列表结构
      if (channels.length === 0) {
        $('ul, ol').each((_, listElement) => {
          const $list = $(listElement);

          $list.find('li').each((_, liElement) => {
            const $li = $(liElement);
            const liText = $li.text();

            // 查找URL
            const urlMatches = liText.match(/https?:\/\/[^\s]+/g);
            if (urlMatches && urlMatches.length > 0) {
              let channelUrl = urlMatches[0];

              // 清理URL
              const endPos = channelUrl.search(/["\s<>]/);
              if (endPos > 0) {
                channelUrl = channelUrl.substring(0, endPos);
              }

              // 尝试从列表项文本中提取频道名
              let channelName: string | null = '';
              const textBeforeUrl = liText.split(channelUrl)[0].trim();
              if (textBeforeUrl) {
                channelName = sanitizeChannelName(textBeforeUrl);
              }

              // 如果没有找到名称，使用默认名称
              if (!channelName || channelName.trim() === '') {
                channelName = `未命名频道${channels.length + 1}`;
              }

              // 验证并添加频道
              if (isValidHttpURL(channelUrl)) {
                // 确定频道分组
                let group = '其他';
                if (channelName.includes('CCTV')) {
                  group = '央视';
                } else if (channelName.includes('卫视')) {
                  group = '卫视';
                } else if (channelName.includes('NewTV')) {
                  group = '新视';
                } else if (channelName.includes('CHC')) {
                  group = '电影';
                }

                channels.push({
                  name: channelName,
                  url: channelUrl,
                  group,
                });
                this.logger.info(
                  `列表结构解析到频道: ${channelName} -> ${channelUrl}`
                );
              }
            }
          });
        });
      }

      this.logger.info(`替代结构解析到 ${channels.length} 个频道`);
      return channels;
    } catch (error) {
      this.logger.error('替代结构解析出错', error);
      return [];
    }
  }

  parsePagination(html: string): PaginationInfo {
    try {
      const $ = cheerio.load(html);

      // 清理追踪脚本
      this.removeTrackingScripts($);

      // 查找id="Pagination"的div节点
      const $pagination = $('#Pagination');

      if ($pagination.length === 0) {
        this.logger.info('没有分页');
        return {
          totalPages: 1,
          currentPage: 1,
          hasNext: false,
          hasPrev: false,
          itemsPerPage: 0,
        };
      }

      const paginationChildren = $pagination.children();
      let totalPages = 1;
      let currentPage = 1;

      // 解析分页信息
      if (paginationChildren.length > 0) {
        // 最后第二个元素通常是总页数
        const secondLastChild = paginationChildren.eq(-2);
        const totalPagesText = secondLastChild.text().trim();
        const parsedTotal = parseInt(totalPagesText, 10);

        if (!isNaN(parsedTotal) && parsedTotal > 0) {
          totalPages = parsedTotal;
        }

        // 查找当前页（通常是高亮或特殊样式的元素）
        paginationChildren.each((index, element) => {
          const $el = $(element);
          const text = $el.text().trim();
          const pageNum = parseInt(text, 10);

          // 检查是否是当前页（可能有特殊class或样式）
          if (
            !isNaN(pageNum) &&
            ($el.hasClass('current') || $el.hasClass('active'))
          ) {
            currentPage = pageNum;
          }
        });
      }

      const hasNext = currentPage < totalPages;

      this.logger.info(
        `分页: ${currentPage}/${totalPages}, 有下一页: ${hasNext}`
      );

      return {
        totalPages,
        currentPage,
        hasNext,
        hasPrev: currentPage > 1,
        itemsPerPage: 0,
      };
    } catch (error) {
      this.logger.error('解析分页时出错', error);
      return {
        totalPages: 1,
        currentPage: 1,
        hasNext: false,
        hasPrev: false,
        itemsPerPage: 0,
      };
    }
  }

  /**
   * 移除HTML中的追踪脚本和元素
   * @param $ - cheerio根对象
   */
  private removeTrackingScripts($: cheerio.Root): void {
    try {
      let removedCount = 0;
      // 移除包含追踪域名的script标签
      $('script').each((_, element) => {
        const $script = $(element);
        const src = $script.attr('src');
        const content = $script.html();
        if (src && this.isTrackingDomain(src)) {
          $script.remove();
          removedCount++;
        } else if (content && this.containsTrackingCode(content)) {
          $script.remove();
          removedCount++;
        }
      });
      // 移除包含追踪域名的iframe标签
      $('iframe').each((_, element) => {
        const $iframe = $(element);
        const src = $iframe.attr('src');
        if (src && this.isTrackingDomain(src)) {
          $iframe.remove();
          removedCount++;
        }
      });
      // 移除包含追踪域名的img标签（像素追踪）
      $('img').each((_, element) => {
        const $img = $(element);
        const src = $img.attr('src');
        if (src && this.isTrackingDomain(src)) {
          $img.remove();
          removedCount++;
        }
      });
      // 移除包含追踪域名的link标签
      $('link').each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        if (href && this.isTrackingDomain(href)) {
          $link.remove();
          removedCount++;
        }
      });
      if (removedCount > 0) {
        this.logger.info(`移除了 ${removedCount} 个追踪脚本/元素`);
      }
    } catch (error) {
      this.logger.error('移除追踪脚本时出错', error);
    }
  }

  /**
   * 检查URL是否为追踪域名
   * @param url - 要检查的URL
   * @returns 是否为追踪域名
   */
  private isTrackingDomain(url: string): boolean {
    try {
      const urlObj = new URL(url, 'https://example.com'); // 提供base URL处理相对路径
      const hostname = urlObj.hostname.toLowerCase();

      return this.trackingDomains.some((domain) => {
        return hostname === domain || hostname.endsWith('.' + domain);
      });
    } catch (error) {
      // 如果URL解析失败，检查字符串是否包含追踪域名
      return this.trackingDomains.some((domain) =>
        url.toLowerCase().includes(domain)
      );
    }
  }

  /**
   * 检查内容是否包含追踪代码
   * @param content - 要检查的内容
   * @returns 是否包含追踪代码
   */
  private containsTrackingCode(content: string): boolean {
    const trackingKeywords = [
      'google-analytics',
      'googletagmanager',
      'gtag(',
      'ga(',
      'histats',
      'facebook.com/tr',
      'fbq(',
      '_gaq',
      'gtm.js',
    ];

    const lowerContent = content.toLowerCase();
    return trackingKeywords.some((keyword) => lowerContent.includes(keyword));
  }
}
