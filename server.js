/**
 * IPTV Guide 服务器启动文件
 * 重构后的简化启动文件，使用 EnhancedServer 作为核心服务器
 */

import dotenv from 'dotenv';
import { enhancedServer } from './src/server/core/EnhancedServer';

// 加载环境变量
dotenv.config();

/**
 * 启动服务器
 */
async function startServer() {
  try {
    console.log('正在启动 IPTV Guide 服务器...');
    
    // 启动增强服务器
    await enhancedServer.start();
    
    console.log('IPTV Guide 服务器启动成功！');
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  process.exit(1);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason);
  process.exit(1);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信号，正在优雅关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信号，正在优雅关闭服务器...');
  process.exit(0);
});

// 启动服务器
startServer();
