// Cron表达式间隔验证工具
import cron from 'node-cron';

/**
 * 验证cron表达式的执行间隔是否满足最小间隔要求
 * @param cronExpression cron表达式
 * @param minIntervalHours 最小间隔小时数，默认6小时
 * @returns {isValid: boolean, reason?: string}
 */
export function validateCronInterval(
  cronExpression: string,
  minIntervalHours: number = 6
): { isValid: boolean; reason?: string } {
  try {
    // 首先验证cron表达式的基本语法
    if (!cron.validate(cronExpression)) {
      return { isValid: false, reason: 'Cron表达式语法错误' };
    }

    // 解析cron表达式的各个部分
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) {
      return { isValid: false, reason: 'Cron表达式格式错误，应为5个部分' };
    }

    const [minute, hour, day, month, weekday] = parts;

    // 检查是否是每分钟执行（最危险的情况）
    if (minute === '*' && hour === '*') {
      return {
        isValid: false,
        reason: '不允许每分钟执行，执行间隔过于频繁',
      };
    }

    // 检查是否是每小时执行
    if (minute !== '*' && hour === '*') {
      return {
        isValid: false,
        reason: `不允许每小时执行，最小间隔为${minIntervalHours}小时`,
      };
    }

    // 检查小时字段的间隔
    if (hour.includes('/')) {
      const hourInterval = parseInt(hour.split('/')[1]);
      if (hourInterval < minIntervalHours) {
        return {
          isValid: false,
          reason: `小时间隔不能小于${minIntervalHours}小时，当前为${hourInterval}小时`,
        };
      }
    }

    // 检查分钟字段的间隔 - 如果小时字段不是通配符，则分钟间隔无关紧要
    // 但如果小时是通配符，则需要严格限制分钟间隔
    if (minute.includes('/') && hour === '*') {
      return {
        isValid: false,
        reason: `不允许在小时通配符的情况下使用分钟间隔，最小间隔为${minIntervalHours}小时`,
      };
    }

    // 检查是否是特定时间点执行（这种情况通常是允许的）
    // 例如：0 9 * * * (每天9点) 或 0 */6 * * * (每6小时)

    // 如果小时字段是具体数字列表，检查间隔是否满足要求
    if (hour.includes(',')) {
      const hourList = hour.split(',').map((h) => parseInt(h.trim())).sort((a, b) => a - b);
      
      // 检查相邻时间点之间的最小间隔
      for (let i = 1; i < hourList.length; i++) {
        const interval = hourList[i] - hourList[i - 1];
        if (interval < minIntervalHours) {
          return {
            isValid: false,
            reason: `相邻执行时间间隔不能小于${minIntervalHours}小时，发现${interval}小时间隔`,
          };
        }
      }
      
      // 检查最后一个时间点到第一个时间点的间隔（跨天）
      const wrapAroundInterval = 24 - hourList[hourList.length - 1] + hourList[0];
      if (wrapAroundInterval < minIntervalHours) {
        return {
          isValid: false,
          reason: `跨天执行时间间隔不能小于${minIntervalHours}小时，发现${wrapAroundInterval}小时间隔`,
        };
      }
    }

    // 模拟计算执行频率（简化版本）
    const estimatedDailyExecutions = estimateDailyExecutions(cronExpression);
    const maxDailyExecutions = Math.floor(24 / minIntervalHours);

    if (estimatedDailyExecutions > maxDailyExecutions) {
      return {
        isValid: false,
        reason: `执行频率过高，预计每天执行${estimatedDailyExecutions}次，最多允许${maxDailyExecutions}次（每${minIntervalHours}小时一次）`,
      };
    }

    return { isValid: true };
  } catch (error) {
    return {
      isValid: false,
      reason: `验证过程中发生错误: ${(error as Error).message}`,
    };
  }
}

/**
 * 估算cron表达式每天的执行次数（简化版本）
 */
function estimateDailyExecutions(cronExpression: string): number {
  const parts = cronExpression.trim().split(/\s+/);
  const [minute, hour, day, month, weekday] = parts;

  // 如果是每分钟执行
  if (minute === '*' && hour === '*') {
    return 1440; // 24 * 60
  }

  // 如果是每小时执行
  if (minute !== '*' && hour === '*') {
    return 24;
  }

  // 如果小时字段有间隔
  if (hour.includes('/')) {
    const interval = parseInt(hour.split('/')[1]);
    return 24 / interval;
  }

  // 如果小时字段是列表
  if (hour.includes(',')) {
    return hour.split(',').length;
  }

  // 如果是特定小时
  if (!hour.includes('*') && !hour.includes('/') && !hour.includes(',')) {
    return 1; // 每天一次
  }

  // 默认情况，假设每天一次
  return 1;
}

/**
 * 获取推荐的cron表达式示例
 */
export function getRecommendedCronExamples(): Array<{
  expression: string;
  description: string;
}> {
  return [
    { expression: '0 */6 * * *', description: '每6小时执行一次' },
    { expression: '0 */8 * * *', description: '每8小时执行一次' },
    { expression: '0 */12 * * *', description: '每12小时执行一次' },
    { expression: '0 2 * * *', description: '每天凌晨2点执行' },
    { expression: '0 9 * * *', description: '每天上午9点执行' },
    { expression: '0 2,14 * * *', description: '每天凌晨2点和下午2点执行（12小时间隔）' },
    { expression: '0 6,18 * * *', description: '每天早上6点和晚上6点执行（12小时间隔）' },
    { expression: '0 0,8,16 * * *', description: '每天0点、8点、16点执行（8小时间隔）' },
  ];
}
