/**
 * 监控服务
 * 负责系统监控、警报管理和性能分析
 */

import { progressMonitor, type PerformanceMetrics } from './ProgressMonitor';
import { errorHandler } from '../../shared/core/ErrorHandler';

export interface MonitoringConfig {
  enabled: boolean;
  checkInterval: number; // 检查间隔（毫秒）
  performanceThresholds: {
    maxResponseTime: number; // 最大响应时间（毫秒）
    minSuccessRate: number; // 最小成功率（百分比）
  };
  alertRetention: number; // 警报保留时间（小时）
}

export interface SystemAlert {
  id: string;
  type: 'PERFORMANCE' | 'ERROR' | 'SYSTEM' | 'TASK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  context?: Record<string, any>;
}

export class MonitoringService {
  private config: MonitoringConfig;
  private alerts: Map<string, SystemAlert> = new Map();
  private isRunning = false;
  private checkTimer?: NodeJS.Timeout;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enabled: true,
      checkInterval: 30000, // 30秒
      performanceThresholds: {
        maxResponseTime: 5000, // 5秒
        minSuccessRate: 80, // 80%
      },
      alertRetention: 24, // 24小时
      ...config,
    };
  }

  /**
   * 启动监控服务
   */
  start(): void {
    if (!this.config.enabled || this.isRunning) return;

    this.isRunning = true;
    this.scheduleNextCheck();
    console.log('监控服务已启动');
  }

  /**
   * 停止监控服务
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.checkTimer) {
      clearTimeout(this.checkTimer);
      this.checkTimer = undefined;
    }
    console.log('监控服务已停止');
  }

  private scheduleNextCheck(): void {
    if (!this.isRunning) return;

    this.checkTimer = setTimeout(() => {
      this.performHealthCheck();
      this.scheduleNextCheck();
    }, this.config.checkInterval);
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // 检查任务性能
      await this.checkTaskPerformance();

      // 检查系统错误
      await this.checkSystemErrors();

      // 清理过期警报
      this.cleanupOldAlerts();
    } catch (error) {
      errorHandler.handle(error, {
        context: 'MonitoringService.performHealthCheck',
      });
    }
  }

  private async checkTaskPerformance(): Promise<void> {
    const activeTasks = progressMonitor.getActiveTasks();
    const stats = progressMonitor.getOverallStatistics();

    // 检查响应时间
    if (
      stats.performance.averageResponseTime >
      this.config.performanceThresholds.maxResponseTime
    ) {
      this.createAlert(
        'PERFORMANCE',
        'MEDIUM',
        `平均响应时间过长: ${stats.performance.averageResponseTime}ms`,
        { responseTime: stats.performance.averageResponseTime }
      );
    }

    // 检查成功率
    if (
      stats.performance.successRate <
      this.config.performanceThresholds.minSuccessRate
    ) {
      this.createAlert(
        'PERFORMANCE',
        'MEDIUM',
        `请求成功率过低: ${stats.performance.successRate}%`,
        { successRate: stats.performance.successRate }
      );
    }

    // 检查错误率
    const errorStats = progressMonitor.getErrorStatistics();
    const totalErrors = Object.values(errorStats).reduce((a, b) => a + b, 0);
    if (totalErrors > 10) {
      this.createAlert('ERROR', 'HIGH', `错误数量过多: ${totalErrors}`, {
        errorStats,
        totalErrors,
      });
    }

    // 检查长时间运行的任务
    activeTasks.forEach((task) => {
      const runningTime = Date.now() - task.startTime.getTime();
      if (runningTime > 30 * 60 * 1000) {
        // 30分钟
        this.createAlert('TASK', 'MEDIUM', `任务运行时间过长: ${task.name}`, {
          taskId: task.taskId,
          runningTime,
        });
      }
    });
  }

  private async checkSystemErrors(): Promise<void> {
    const recentErrors = errorHandler.getErrorHistory(100);
    const criticalErrors = recentErrors.filter(
      (error) => error.severity === 'CRITICAL'
    );

    if (criticalErrors.length > 0) {
      this.createAlert(
        'SYSTEM',
        'CRITICAL',
        `发现 ${criticalErrors.length} 个严重错误`,
        { errors: criticalErrors.map((e) => e.message) }
      );
    }
  }

  private createAlert(
    type: SystemAlert['type'],
    severity: SystemAlert['severity'],
    message: string,
    context?: Record<string, any>
  ): void {
    const alert: SystemAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      title: `${type} 警报`,
      message,
      timestamp: new Date(),
      acknowledged: false,
      context,
    };

    this.alerts.set(alert.id, alert);
    console.warn(`[监控警报] ${severity}: ${message}`, context);

    // 如果是严重错误，立即记录到错误处理器
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      errorHandler.handle(new Error(message), {
        context: 'MonitoringService',
        ...context,
      });
    }
  }

  // 警报管理
  getAlerts(acknowledged?: boolean): SystemAlert[] {
    const allAlerts = Array.from(this.alerts.values());
    if (acknowledged !== undefined) {
      return allAlerts.filter((alert) => alert.acknowledged === acknowledged);
    }
    return allAlerts;
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  dismissAlert(alertId: string): boolean {
    return this.alerts.delete(alertId);
  }

  clearAllAlerts(): void {
    this.alerts.clear();
  }

  private cleanupOldAlerts(): void {
    const cutoffTime = Date.now() - this.config.alertRetention * 60 * 60 * 1000;
    const alertsToRemove: string[] = [];

    this.alerts.forEach((alert, id) => {
      if (alert.timestamp.getTime() < cutoffTime) {
        alertsToRemove.push(id);
      }
    });

    alertsToRemove.forEach((id) => this.alerts.delete(id));
  }

  // 健康状态检查
  getHealthStatus(): {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    checks: Record<string, boolean>;
    alerts: number;
    uptime: number;
  } {
    const stats = progressMonitor.getOverallStatistics();
    const unacknowledgedAlerts = this.getAlerts(false);
    const criticalAlerts = unacknowledgedAlerts.filter(
      (a) => a.severity === 'CRITICAL'
    );

    const checks = {
      responseTimeOk:
        stats.performance.averageResponseTime <=
        this.config.performanceThresholds.maxResponseTime,
      successRateOk:
        stats.performance.successRate >=
        this.config.performanceThresholds.minSuccessRate,
      noConsecutiveErrors: stats.errors.recent < 5,
    };

    const allChecksPass = Object.values(checks).every(Boolean);
    const hasCriticalAlerts = criticalAlerts.length > 0;

    let status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    if (hasCriticalAlerts) {
      status = 'CRITICAL';
    } else if (!allChecksPass || unacknowledgedAlerts.length > 0) {
      status = 'WARNING';
    } else {
      status = 'HEALTHY';
    }

    return {
      status,
      checks,
      alerts: unacknowledgedAlerts.length,
      uptime: stats.uptime,
    };
  }

  // 配置管理
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // 如果启用状态改变，重启服务
    if (newConfig.enabled !== undefined) {
      if (newConfig.enabled && !this.isRunning) {
        this.start();
      } else if (!newConfig.enabled && this.isRunning) {
        this.stop();
      }
    }
  }

  getConfig(): MonitoringConfig {
    return { ...this.config };
  }
}

// 全局实例
export const monitoringService = new MonitoringService();
