// HTML解析模块
import * as cheerio from 'cheerio';
import type { HtmlParser as IHtmlParser } from '../../shared/types/interfaces.js';
import type {
  ChannelInfo,
  PaginationInfo,
} from '../../shared/types/scraper.js';
import { Logger } from '../utils/logger.js';
import {
  isValidIP,
  isValidIPWithPort,
  isValidHttpURL,
  sanitizeChannelName,
} from '../utils/validation.js';

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

  parseChannelList(html: string): ChannelInfo[] {
    try {
      const $ = cheerio.load(html);

      // 清理追踪脚本
      this.removeTrackingScripts($);

      const channels: ChannelInfo[] = [];

      // 检查是否是源失效页面
      const pageText = $('body').text();
      if (pageText.includes('源暂时失效') || pageText.includes('请稍候再试')) {
        this.logger.warn('检测到源失效页面');
        return [];
      }

      // 查找所有class="result"的div节点
      $('.result').each((_, resultElement) => {
        const $result = $(resultElement);

        // 跳过包含"源暂时失效"或统计信息的result
        const resultText = $result.text();
        if (
          resultText.includes('源暂时失效') ||
          (resultText.includes('共有') && resultText.includes('个频道'))
        ) {
          return; // 跳过这个result
        }

        // 查找频道名称（在.channel div中的a标签下的第一个div）
        const $channelDiv = $result.find('.channel');
        if ($channelDiv.length === 0) return;

        // 获取频道名称 - 在a标签下的第一个div中
        const $channelNameDiv = $channelDiv.find('a div').first();
        const channelName = sanitizeChannelName($channelNameDiv.text());

        if (!channelName) return;

        // 查找频道URL（在.m3u8 div中的table td中）
        const $m3u8Div = $result.find('.m3u8');
        if ($m3u8Div.length === 0) return;

        // 在table的td中查找URL - 查找包含http的td
        let channelUrl = '';
        $m3u8Div.find('td').each((_, tdElement) => {
          const tdText = $(tdElement).text().trim();
          if (tdText.startsWith('http://') || tdText.startsWith('https://')) {
            channelUrl = tdText;
            return false; // 找到后停止循环
          }
        });

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

          channels.push({
            name: channelName,
            url: channelUrl,
            group,
          });
        }
      });

      // 如果没有找到频道，尝试备用方法
      if (channels.length === 0) {
        this.logger.warn('主方法未找到频道，尝试备用方法');

        // 尝试查找所有包含http://的文本
        $('*').each((_, element) => {
          const $el = $(element);
          const text = $el.text();

          // 查找HTTP/HTTPS URL，自动排除UDP协议
          const urlMatches = text.match(/https?:\/\/[^\s]+/g);
          if (urlMatches) {
            urlMatches.forEach((url) => {
              if (!url.startsWith('udp://') && isValidHttpURL(url)) {
                // 尝试从父元素中找到频道名称
                const $parent = $el.closest('.result');
                if ($parent.length > 0) {
                  const $channelDiv = $parent.find('.channel div').first();
                  const possibleName = sanitizeChannelName($channelDiv.text());

                  if (
                    possibleName &&
                    !channels.some(
                      (ch) => ch.name === possibleName && ch.url === url
                    )
                  ) {
                    channels.push({
                      name: possibleName,
                      url: url,
                      group: '其他',
                    });
                  }
                }
              }
            });
          }
        });
      }

      this.logger.info(`解析到 ${channels.length} 个频道`);
      return channels;
    } catch (error) {
      this.logger.error('解析频道列表时出错', error);
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
      this.logger.warn('清理追踪脚本时出错', error);
    }
  }

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
