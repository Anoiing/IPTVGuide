/**
 * 调度器相关类型定义
 * 统一管理所有调度器类型，避免重复定义
 */

/**
 * Cron调度器选项接口
 */
export interface CronSchedulerOptions {
  configDir: string;
  enableLogging: boolean;
}

/**
 * 调度器状态接口
 */
export interface SchedulerStatus {
  isRunning: boolean;
  nextExecution?: Date;
  lastExecution?: Date;
  cronExpression?: string;
}

/**
 * 任务信息接口
 */
export interface TaskInfo {
  id: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  result?: any;
  error?: string;
}

/**
 * 爬取决策接口
 */
export interface ScrapingDecision {
  shouldScrape: boolean;
  reason: 'AVAILABILITY_LOW' | 'NO_RECENT_DATA' | 'MANUAL_TRIGGER' | 'AVAILABILITY_OK';
  availabilityRate?: number;
  lastCheckTime?: Date;
}

/**
 * 调度任务接口
 */
export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  status: 'IDLE' | 'RUNNING' | 'ERROR';
  description?: string;
  metadata?: Record<string, any>;
}