// 日志工具函数 (向后兼容的包装器)
// 使用新的增强日志系统

export { 
  LogLevel,
  type LogEntry,
  type LoggerConfig
} from '../logging/types.js';

export { Logger } from '../logging/Logger.js';
