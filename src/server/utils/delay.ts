// 延迟和重试工具函数

/**
 * 创建一个延迟Promise
 * @param ms 延迟毫秒数
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 生成随机延迟时间（毫秒）
 * @param min 最小延迟秒数
 * @param max 最大延迟秒数
 */
export function randomDelay(min: number = 1, max: number = 3): number {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

/**
 * 指数退避延迟计算
 * @param attempt 重试次数（从0开始）
 * @param baseDelay 基础延迟毫秒数
 * @param maxDelay 最大延迟毫秒数
 */
export function exponentialBackoff(
  attempt: number,
  baseDelay: number = 1000,
  maxDelay: number = 30000
): number {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  // 添加一些随机性避免雷群效应
  return Math.round(delay + Math.random() * 1000);
}
