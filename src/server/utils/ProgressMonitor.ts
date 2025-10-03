/**
 * 进度监控器
 * 监控任务执行进度和性能指标
 */

export interface TaskProgress {
  taskId: string;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number; // 0-100
  startTime: Date;
  endTime?: Date;
  duration?: number;
  processedItems: number;
  totalItems: number;
  currentItem?: string;
  errors: string[];
  warnings: string[];
}

export interface PerformanceMetrics {
  taskId: string;
  timestamp: Date;
  requestsPerSecond: number;
  averageResponseTime: number;
  successRate: number;
  uptime: number;
}

export interface ErrorReport {
  taskId: string;
  errorType: string;
  errorMessage: string;
  timestamp: Date;
  context?: Record<string, any>;
}

export class ProgressMonitor {
  private tasks: Map<string, TaskProgress> = new Map();
  private metrics: Map<string, PerformanceMetrics[]> = new Map();
  private errors: ErrorReport[] = [];
  private maxMetricsHistory = 1000;
  private maxErrorHistory = 500;

  // 任务管理
  createTask(
    taskId: string,
    name: string,
    totalItems: number = 0
  ): TaskProgress {
    const task: TaskProgress = {
      taskId,
      name,
      status: 'PENDING',
      progress: 0,
      startTime: new Date(),
      processedItems: 0,
      totalItems,
      errors: [],
      warnings: [],
    };

    this.tasks.set(taskId, task);
    return task;
  }

  updateTask(taskId: string, updates: Partial<TaskProgress>): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    Object.assign(task, updates);

    // 自动计算进度
    if (task.totalItems > 0) {
      task.progress = Math.round((task.processedItems / task.totalItems) * 100);
    }

    // 自动设置结束时间和持续时间
    if (updates.status === 'COMPLETED' || updates.status === 'FAILED') {
      task.endTime = new Date();
      task.duration = task.endTime.getTime() - task.startTime.getTime();
    }

    this.tasks.set(taskId, task);
  }

  getTask(taskId: string): TaskProgress | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskProgress[] {
    return Array.from(this.tasks.values());
  }

  getActiveTasks(): TaskProgress[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.status === 'RUNNING' || task.status === 'PENDING'
    );
  }

  removeTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.metrics.delete(taskId);
  }

  // 性能指标记录
  recordMetrics(
    taskId: string,
    metrics: Omit<PerformanceMetrics, 'taskId' | 'timestamp'>
  ): void {
    const fullMetrics: PerformanceMetrics = {
      taskId,
      timestamp: new Date(),
      ...metrics,
    };

    if (!this.metrics.has(taskId)) {
      this.metrics.set(taskId, []);
    }

    const taskMetrics = this.metrics.get(taskId)!;
    taskMetrics.push(fullMetrics);

    // 限制历史记录数量
    if (taskMetrics.length > this.maxMetricsHistory) {
      taskMetrics.splice(0, taskMetrics.length - this.maxMetricsHistory);
    }
  }

  getMetrics(taskId: string): PerformanceMetrics[] {
    return this.metrics.get(taskId) || [];
  }

  getLatestMetrics(taskId: string): PerformanceMetrics | undefined {
    const taskMetrics = this.metrics.get(taskId);
    return taskMetrics && taskMetrics.length > 0
      ? taskMetrics[taskMetrics.length - 1]
      : undefined;
  }

  // 错误报告
  reportError(error: Omit<ErrorReport, 'timestamp'>): void {
    const fullError: ErrorReport = {
      ...error,
      timestamp: new Date(),
    };

    this.errors.push(fullError);

    // 限制错误历史记录数量
    if (this.errors.length > this.maxErrorHistory) {
      this.errors.splice(0, this.errors.length - this.maxErrorHistory);
    }

    // 更新任务错误信息
    const task = this.tasks.get(error.taskId);
    if (task) {
      task.errors.push(error.errorMessage);
    }
  }

  getErrors(taskId?: string): ErrorReport[] {
    if (taskId) {
      return this.errors.filter((error) => error.taskId === taskId);
    }
    return [...this.errors];
  }

  getErrorStatistics(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.errors.forEach((error) => {
      stats[error.errorType] = (stats[error.errorType] || 0) + 1;
    });
    return stats;
  }

  // 统计信息
  getOverallStatistics() {
    const tasks = Array.from(this.tasks.values());
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
    const failedTasks = tasks.filter((t) => t.status === 'FAILED').length;
    const runningTasks = tasks.filter((t) => t.status === 'RUNNING').length;

    const totalProcessedItems = tasks.reduce(
      (sum, task) => sum + task.processedItems,
      0
    );
    const totalItems = tasks.reduce((sum, task) => sum + task.totalItems, 0);

    const completedTasksWithDuration = tasks.filter(
      (t) => t.status === 'COMPLETED' && t.duration
    );
    const averageDuration =
      completedTasksWithDuration.length > 0
        ? completedTasksWithDuration.reduce(
            (sum, task) => sum + (task.duration || 0),
            0
          ) / completedTasksWithDuration.length
        : 0;

    // 计算总体性能指标
    const allMetrics = Array.from(this.metrics.values()).flat();
    const recentMetrics = allMetrics.filter(
      (m) => Date.now() - m.timestamp.getTime() < 5 * 60 * 1000 // 最近5分钟
    );

    const avgResponseTime =
      recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.averageResponseTime, 0) /
          recentMetrics.length
        : 0;

    const avgSuccessRate =
      recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.successRate, 0) /
          recentMetrics.length
        : 0;

    const avgRequestsPerSecond =
      recentMetrics.length > 0
        ? recentMetrics.reduce((sum, m) => sum + m.requestsPerSecond, 0) /
          recentMetrics.length
        : 0;

    return {
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        failed: failedTasks,
        running: runningTasks,
        pending: totalTasks - completedTasks - failedTasks - runningTasks,
      },
      items: {
        processed: totalProcessedItems,
        total: totalItems,
        progress: totalItems > 0 ? (totalProcessedItems / totalItems) * 100 : 0,
      },
      performance: {
        averageDuration: Math.round(averageDuration),
        averageResponseTime: Math.round(avgResponseTime),
        successRate: Number(avgSuccessRate.toFixed(2)),
        requestsPerSecond: Number(avgRequestsPerSecond.toFixed(2)),
      },
      errors: {
        total: this.errors.length,
        byType: this.getErrorStatistics(),
        recent: this.errors.filter(
          (e) => Date.now() - e.timestamp.getTime() < 60 * 60 * 1000
        ).length, // 最近1小时
      },
      uptime: Math.round(process.uptime()),
    };
  }

  // 清理方法
  clearCompletedTasks(): void {
    const completedTaskIds = Array.from(this.tasks.entries())
      .filter(
        ([, task]) => task.status === 'COMPLETED' || task.status === 'FAILED'
      )
      .map(([taskId]) => taskId);

    completedTaskIds.forEach((taskId) => {
      this.tasks.delete(taskId);
      this.metrics.delete(taskId);
    });
  }

  clearOldErrors(olderThanHours: number = 24): void {
    const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;
    this.errors = this.errors.filter(
      (error) => error.timestamp.getTime() > cutoffTime
    );
  }

  reset(): void {
    this.tasks.clear();
    this.metrics.clear();
    this.errors = [];
  }
}

// 全局实例
export const progressMonitor = new ProgressMonitor();
