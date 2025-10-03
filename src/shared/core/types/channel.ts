/**
 * 频道相关类型定义
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

export type ChannelsByIP = Record<string, ChannelInfo[]>;

export interface IPInfo {
  address: string;
  port?: number;
  status: 'active' | 'inactive' | 'blacklisted';
  channelCount: number;
  lastChecked: Date;
  responseTime?: number;
  latency?: number;
}

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