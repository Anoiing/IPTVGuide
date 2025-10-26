// 文件生成模块
import fs from 'fs';
import path from 'path';
import type { FileGenerator as IFileGenerator } from '../../shared/types/interfaces';
import type { ChannelInfo } from '../../shared/types/scraper';
import { Logger } from '../utils/logger';

export class FileGenerator implements IFileGenerator {
  private outputDir: string;
  private logger: Logger;

  constructor(outputDir: string = './output', configDir: string = './config') {
    this.outputDir = outputDir;
    this.logger = new Logger(configDir);

    // 确保输出目录存在
    this.ensureOutputDir();
  }

  /**
   * 生成JSON格式的频道列表文件
   * 
   * @param {Record<string, ChannelInfo[]>} channels - 频道数据
   * @returns {Promise<void>}
   */
  async generateJSON(channels: Record<string, ChannelInfo[]>): Promise<void> {
    try {
      // 生成按IP分类的完整数据
      const jsonData = {
        generatedAt: new Date().toISOString(),
        totalIPs: Object.keys(channels).length,
        totalChannels: Object.values(channels).reduce(
          (sum, channelList) => sum + channelList.length,
          0
        ),
        channelsByIP: channels,
      };

      const jsonPath = path.join(this.outputDir, 'channels.json');
      fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');

      // 生成扁平化的频道列表（兼容原格式）
      const flatChannels: ChannelInfo[] = [];
      Object.values(channels).forEach((channelList) => {
        flatChannels.push(...channelList);
      });

      // 按频道名排序
      flatChannels.sort(this.customSort);

      const flatJsonPath = path.join(this.outputDir, 'channels_flat.json');
      fs.writeFileSync(
        flatJsonPath,
        JSON.stringify(flatChannels, null, 2),
        'utf8'
      );

      this.logger.info(
        `Generated JSON files: ${jsonData.totalChannels} channels from ${jsonData.totalIPs} IPs`
      );
    } catch (error) {
      this.logger.error('生成JSON文件失败', error);
      throw new Error(`生成JSON文件失败: ${(error as Error).message}`);
    }
  }

  /**
   * 生成TXT格式的频道列表文件
   * 
   * @param {Record<string, ChannelInfo[]>} channels - 频道数据
   * @returns {Promise<void>}
   */
  async generateTXT(channels: Record<string, ChannelInfo[]>): Promise<void> {
    try {
      // 生成扁平化的频道列表
      const flatChannels: ChannelInfo[] = [];
      Object.values(channels).forEach((channelList) => {
        flatChannels.push(...channelList);
      });

      // 按频道名排序
      flatChannels.sort(this.customSort);

      // 生成TXT格式内容
      const txtContent = flatChannels
        .map((channel) => `${channel.name},${channel.name}\n${channel.url}`)
        .join('\n');

      const txtPath = path.join(this.outputDir, 'channels.txt');
      fs.writeFileSync(txtPath, txtContent, 'utf8');

      this.logger.info(`生成TXT文件: ${flatChannels.length} 个频道`);
    } catch (error) {
      this.logger.error('生成TXT文件失败', error);
      throw new Error(`生成TXT文件失败: ${(error as Error).message}`);
    }
  }

  async generateM3U(channels: Record<string, ChannelInfo[]>): Promise<void> {
    try {
      // 生成扁平化的频道列表
      const flatChannels: ChannelInfo[] = [];
      Object.values(channels).forEach((channelList) => {
        flatChannels.push(...channelList);
      });

      // 按频道名排序
      flatChannels.sort(this.customSort);

      // 生成M3U格式内容
      let m3uContent =
        '#EXTM3U x-tvg-url="https://live.fanmingming.com/e.xml"\n';

      m3uContent += flatChannels
        .map((channel) => {
          if (!channel.name) return '';

          // 清理频道名称用于logo
          let logoName = channel.name
            .replace('高清', '')
            .replace(' 4K', '')
            .replace(' 4k', '')
            .replace('-', '')
            .trim();

          // 确定频道分组
          let groupName = channel.group || '其他';
          if (logoName.includes('CCTV')) {
            groupName = '央视';
          } else if (logoName.includes('卫视')) {
            groupName = '卫视';
          } else if (logoName.includes('NewTV')) {
            groupName = '新视';
          } else if (logoName.includes('CHC')) {
            groupName = '电影';
          }

          // 生成logo URL
          const logoType = logoName.includes('广播') ? 'radio' : 'tv';
          const logoUrl = `https://live.fanmingming.com/${logoType}/${logoName}.png`;

          return `#EXTINF:-1 tvg-name="${channel.name}" tvg-logo="${logoUrl}" group-title="${groupName}",${channel.name}\n${channel.url}`;
        })
        .filter((line) => line) // 过滤空行
        .join('\n');

      const m3uPath = path.join(this.outputDir, 'channels.m3u');
      fs.writeFileSync(m3uPath, m3uContent, 'utf8');

      this.logger.info(`生成M3U文件: ${flatChannels.length} 个频道`);
    } catch (error) {
      this.logger.error('生成M3U文件失败', error);
      throw new Error(
        `Failed to generate M3U file: ${(error as Error).message}`
      );
    }
  }

  generateAll(channels: Record<string, ChannelInfo[]>): void {
    try {
      this.generateJSON(channels);
      this.generateTXT(channels);
      this.generateM3U(channels);

      const totalChannels = Object.values(channels).reduce(
        (sum, channelList) => sum + channelList.length,
        0
      );
      const totalIPs = Object.keys(channels).length;

      this.logger.info(
        `Generated all output files: ${totalChannels} channels from ${totalIPs} IPs`
      );
    } catch (error) {
      this.logger.error('Failed to generate output files', error);
      throw new Error(
        `Failed to generate output files: ${(error as Error).message}`
      );
    }
  }

  // 按数字、英文、中文的顺序排序（兼容原系统的排序逻辑）
  private customSort = (a: ChannelInfo, b: ChannelInfo): number => {
    const nameA = a.name;
    const nameB = b.name;

    let indexA = 0;
    let indexB = 0;

    while (indexA < nameA.length && indexB < nameB.length) {
      let charA = nameA[indexA];
      let charB = nameB[indexB];

      let numA: number | null = null;
      let numB: number | null = null;

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

  private ensureOutputDir(): void {
    try {
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
        this.logger.info(`Created output directory: ${this.outputDir}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to create output directory: ${this.outputDir}`,
        error
      );
      throw new Error(
        `Failed to create output directory: ${(error as Error).message}`
      );
    }
  }
}
