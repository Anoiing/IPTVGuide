/**
 * 频道相关类型定义
 * 统一管理所有频道类型，避免重复定义
 */

/**
 * 频道信息接口
 */
export interface ChannelInfo {
  name: string;
  url: string;
  group?: string;
  logo?: string;
  epg?: string;
  quality?: 'SD' | 'HD' | 'FHD' | '4K';
  language?: string;
  country?: string;
  bitrate?: number;
  codec?: string;
}

/**
 * 频道按IP分组类型
 */
export type ChannelsByIP = Record<string, ChannelInfo[]>;

/**
 * IP信息接口
 */
export interface IPInfo {
  address: string;
  port?: number;
  status: 'active' | 'inactive' | 'blacklisted';
  channelCount: number;
  lastChecked: Date;
  responseTime?: number;
  latency?: number;
}

/**
 * 频道验证结果接口
 */
export interface ChannelValidationResult {
  channel: ChannelInfo;
  isAvailable: boolean;
  responseTime?: number;
  errorMessage?: string;
  httpStatus?: number;
  streamInfo?: {
    contentType?: string;
    contentLength?: number;
    isStreamable?: boolean;
  };
  checkedAt: Date;
}