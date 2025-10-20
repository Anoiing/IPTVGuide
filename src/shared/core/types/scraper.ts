/**
 * 爬取相关类型定义
 */

import type { ChannelInfo } from './channel.ts';

export interface ScrapingResult {
  success: boolean;
  channelsByIP: Record<string, ChannelInfo[]>;
  totalChannels: number;
  processedIPs: string[];
  errors: string[];
  warnings?: string[];
  skipReason?: string;
  duration?: number;
  timestamp: Date;
  metadata?: {
    sourceCount: number;
    uniqueChannels: number;
    duplicateChannels: number;
  };
}

export type ScrapingStatus = 'IDLE' | 'RUNNING' | 'STOPPING' | 'ERROR';

export interface TaskError {
  timestamp: Date;
  type: 'HTTP_ERROR' | 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'SCRAPING_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT_ERROR' | 'CONFIG_ERROR';
  message: string;
  context?: any;
  stack?: string;
}

export interface ScrapingTask {
  id: string;
  status: ScrapingStatus;
  startTime: Date;
  endTime?: Date;
  progress: {
    currentStep: string;
    processedIPs: number;
    totalIPs: number;
    foundChannels: number;
    currentIP?: string;
    estimatedTimeRemaining?: number;
  };
  errors: TaskError[];
  warnings?: string[];
}

export interface ScrapingDecision {
  shouldScrape: boolean;
  reason: 'AVAILABILITY_LOW' | 'NO_RECENT_DATA' | 'MANUAL_TRIGGER' | 'AVAILABILITY_OK';
  availabilityRate?: number;
  lastCheckTime?: Date;
}