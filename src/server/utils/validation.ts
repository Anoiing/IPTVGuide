// 数据验证工具函数

/**
 * 格式化时间戳，移除时区信息
 * @param date 日期对象
 */
export function formatTimestamp(date: Date): string {
  return date.toString().replace('GMT+0800 (中国标准时间)', '');
}

/**
 * 计算数组的平均值
 * @param numbers 数字数组
 */
export function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

/**
 * 限制数组大小，保留最后的N个元素
 * @param array 要限制的数组
 * @param maxSize 最大大小
 */
export function limitArraySize<T>(array: T[], maxSize: number): T[] {
  return array.length > maxSize ? array.slice(-maxSize) : array;
}

/**
 * 统计对象数组中某个属性的出现次数
 * @param items 对象数组
 * @param keyExtractor 提取键的函数
 */
export function countByKey<T>(
  items: T[],
  keyExtractor: (item: T) => string
): { [key: string]: number } {
  const stats: { [key: string]: number } = {};
  items.forEach((item) => {
    const key = keyExtractor(item);
    stats[key] = (stats[key] || 0) + 1;
  });
  return stats;
}

/**
 * 验证IP地址格式
 * @param ip IP地址字符串
 */
export function isValidIP(ip: string): boolean {
  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipRegex.test(ip);
}

/**
 * 验证IP:端口格式
 * @param address IP:端口字符串
 */
export function isValidIPWithPort(address: string): boolean {
  const parts = address.split(':');
  if (parts.length !== 2) return false;

  const [ip, port] = parts;
  const portNum = parseInt(port, 10);

  return isValidIP(ip) && !isNaN(portNum) && portNum > 0 && portNum <= 65535;
}

/**
 * 验证URL格式
 * @param url URL字符串
 */
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证HTTP URL格式，排除UDP协议
 * @param url URL字符串
 */
export function isValidHttpURL(url: string): boolean {
  // 排除UDP协议的地址
  if (url.startsWith('udp://')) {
    return false;
  }

  return (
    isValidURL(url) && (url.startsWith('http://') || url.startsWith('https://'))
  );
}

/**
 * 清理和验证频道名称
 * @param name 频道名称
 */
export function sanitizeChannelName(name: string): string | null {
  if (!name || typeof name !== 'string') return null;

  const cleaned = name.trim();
  if (cleaned.length === 0) return null;

  return cleaned;
}

/**
 * 验证cron表达式格式（简单验证）
 * @param cronExpression cron表达式
 */
export function isValidCronExpression(cronExpression: string): boolean {
  if (!cronExpression || typeof cronExpression !== 'string') return false;

  const parts = cronExpression.trim().split(/\s+/);
  return parts.length === 5 || parts.length === 6;
}

/**
 * 过滤无用的日志消息（来自旧的Puppeteer实现）
 * @param message 日志消息
 */
export function shouldFilterLogMessage(message: string): boolean {
  return (
    message.includes('Attempted to use detached Frame') ||
    message.includes('Protocol error')
  );
}
