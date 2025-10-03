/**
 * 统一配置管理系统
 * 提供配置加载、保存、验证和热更新功能
 */

import fs from 'fs';
import path from 'path';
import { errorHandler, ErrorType } from './ErrorHandler.js';

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    default?: any;
    validate?: (value: any) => boolean | string;
    description?: string;
  };
}

export interface ConfigManagerOptions {
  configDir: string;
  configFile?: string;
  backupEnabled?: boolean;
  maxBackups?: number;
  autoSave?: boolean;
  validateOnLoad?: boolean;
}

export class ConfigManager<
  T extends Record<string, any> = Record<string, any>
> {
  private configPath: string;
  private backupDir: string;
  private config: T = {} as T;
  private schema?: ConfigSchema;
  private options: Required<ConfigManagerOptions>;
  private watchers: ((config: T) => void)[] = [];

  constructor(options: ConfigManagerOptions, schema?: ConfigSchema) {
    this.options = {
      configFile: 'config.json',
      backupEnabled: true,
      maxBackups: 5,
      autoSave: true,
      validateOnLoad: true,
      ...options,
    };

    this.configPath = path.join(
      this.options.configDir,
      this.options.configFile
    );
    this.backupDir = path.join(this.options.configDir, 'backups');
    this.schema = schema;

    this.ensureDirectories();
    this.loadConfig();
  }

  /**
   * 获取完整配置
   */
  getConfig(): T {
    return { ...this.config };
  }

  /**
   * 获取配置项
   */
  get<K extends keyof T>(key: K): T[K] {
    return this.config[key];
  }

  /**
   * 设置配置项
   */
  set<K extends keyof T>(key: K, value: T[K]): void {
    const oldValue = this.config[key];
    this.config[key] = value;

    if (this.options.autoSave) {
      this.saveConfig();
    }

    // 通知监听器
    this.notifyWatchers();
  }

  /**
   * 批量更新配置
   */
  update(updates: Partial<T>): void {
    const oldConfig = { ...this.config };

    Object.assign(this.config, updates);

    // 验证更新后的配置
    if (this.schema) {
      const validation = this.validateConfig(this.config);
      if (!validation.isValid) {
        // 回滚配置
        this.config = oldConfig;
        throw errorHandler.handleConfigError(
          `配置验证失败: ${validation.errors.join(', ')}`,
          updates
        );
      }
    }

    if (this.options.autoSave) {
      this.saveConfig();
    }

    this.notifyWatchers();
  }

  /**
   * 重置配置为默认值
   */
  reset(): void {
    if (!this.schema) {
      throw errorHandler.handleConfigError('无法重置配置：未定义配置模式');
    }

    const defaultConfig = this.getDefaultConfig();
    this.config = defaultConfig;

    if (this.options.autoSave) {
      this.saveConfig();
    }

    this.notifyWatchers();
  }

  /**
   * 加载配置
   */
  loadConfig(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        // 如果配置文件不存在，创建默认配置
        this.config = this.getDefaultConfig();
        this.saveConfig();
        return;
      }

      const configData = fs.readFileSync(this.configPath, 'utf8');
      const parsedConfig = JSON.parse(configData);

      // 验证配置
      if (this.options.validateOnLoad && this.schema) {
        const validation = this.validateConfig(parsedConfig);
        if (!validation.isValid) {
          throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
        }
      }

      this.config = { ...this.getDefaultConfig(), ...parsedConfig };
    } catch (error) {
      errorHandler.handleFileSystemError('load', this.configPath, error);

      // 尝试从备份恢复
      if (this.options.backupEnabled) {
        this.restoreFromBackup();
      } else {
        // 使用默认配置
        this.config = this.getDefaultConfig();
      }
    }
  }

  /**
   * 保存配置
   */
  saveConfig(): void {
    try {
      // 创建备份
      if (this.options.backupEnabled && fs.existsSync(this.configPath)) {
        this.createBackup();
      }

      // 验证配置
      if (this.schema) {
        const validation = this.validateConfig(this.config);
        if (!validation.isValid) {
          throw new Error(`配置验证失败: ${validation.errors.join(', ')}`);
        }
      }

      // 保存配置
      const configData = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, configData, 'utf8');
    } catch (error) {
      errorHandler.handleFileSystemError('save', this.configPath, error);
      throw error;
    }
  }

  /**
   * 验证配置
   */
  validateConfig(config: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.schema) {
      return { isValid: true, errors: [] };
    }

    for (const [key, schemaItem] of Object.entries(this.schema)) {
      const value = config[key];

      // 检查必需字段
      if (schemaItem.required && (value === undefined || value === null)) {
        errors.push(`缺少必需字段: ${key}`);
        continue;
      }

      // 如果值不存在且不是必需的，跳过验证
      if (value === undefined || value === null) {
        continue;
      }

      // 类型验证
      if (!this.validateType(value, schemaItem.type)) {
        errors.push(`字段 ${key} 类型错误，期望 ${schemaItem.type}`);
        continue;
      }

      // 自定义验证
      if (schemaItem.validate) {
        const validationResult = schemaItem.validate(value);
        if (validationResult !== true) {
          errors.push(
            typeof validationResult === 'string'
              ? validationResult
              : `字段 ${key} 验证失败`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 添加配置监听器
   */
  watch(callback: (config: T) => void): () => void {
    this.watchers.push(callback);

    // 返回取消监听的函数
    return () => {
      const index = this.watchers.indexOf(callback);
      if (index > -1) {
        this.watchers.splice(index, 1);
      }
    };
  }

  /**
   * 获取配置模式
   */
  getSchema(): ConfigSchema | undefined {
    return this.schema;
  }

  /**
   * 获取配置描述
   */
  getConfigDescription(): Record<string, string> {
    if (!this.schema) {
      return {};
    }

    const descriptions: Record<string, string> = {};
    for (const [key, schemaItem] of Object.entries(this.schema)) {
      if (schemaItem.description) {
        descriptions[key] = schemaItem.description;
      }
    }

    return descriptions;
  }

  /**
   * 导出配置
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 导入配置
   */
  importConfig(configData: string): void {
    try {
      const parsedConfig = JSON.parse(configData);

      // 验证导入的配置
      if (this.schema) {
        const validation = this.validateConfig(parsedConfig);
        if (!validation.isValid) {
          throw new Error(
            `导入的配置验证失败: ${validation.errors.join(', ')}`
          );
        }
      }

      this.config = { ...this.getDefaultConfig(), ...parsedConfig };

      if (this.options.autoSave) {
        this.saveConfig();
      }

      this.notifyWatchers();
    } catch (error) {
      errorHandler.handleConfigError('配置导入失败', error);
      throw error;
    }
  }

  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.options.configDir)) {
        fs.mkdirSync(this.options.configDir, { recursive: true });
      }

      if (this.options.backupEnabled && !fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
    } catch (error) {
      errorHandler.handleFileSystemError(
        'create directory',
        this.options.configDir,
        error
      );
      throw error;
    }
  }

  private getDefaultConfig(): T {
    if (!this.schema) {
      return {} as T;
    }

    const defaultConfig: any = {};
    for (const [key, schemaItem] of Object.entries(this.schema)) {
      if (schemaItem.default !== undefined) {
        defaultConfig[key] = schemaItem.default;
      }
    }

    return defaultConfig;
  }

  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      default:
        return true;
    }
  }

  private createBackup(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `config-${timestamp}.json`);

      fs.copyFileSync(this.configPath, backupPath);

      // 清理旧备份
      this.cleanupOldBackups();
    } catch (error) {
      errorHandler.handleFileSystemError(
        'create backup',
        this.configPath,
        error
      );
    }
  }

  private cleanupOldBackups(): void {
    try {
      const backupFiles = fs
        .readdirSync(this.backupDir)
        .filter((file) => file.startsWith('config-') && file.endsWith('.json'))
        .map((file) => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: fs.statSync(path.join(this.backupDir, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // 删除超出限制的备份文件
      if (backupFiles.length > this.options.maxBackups) {
        const filesToDelete = backupFiles.slice(this.options.maxBackups);
        filesToDelete.forEach((file) => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      errorHandler.handleFileSystemError(
        'cleanup backups',
        this.backupDir,
        error
      );
    }
  }

  private restoreFromBackup(): void {
    try {
      const backupFiles = fs
        .readdirSync(this.backupDir)
        .filter((file) => file.startsWith('config-') && file.endsWith('.json'))
        .map((file) => ({
          name: file,
          path: path.join(this.backupDir, file),
          mtime: fs.statSync(path.join(this.backupDir, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (backupFiles.length > 0) {
        const latestBackup = backupFiles[0];
        const backupData = fs.readFileSync(latestBackup.path, 'utf8');
        const parsedConfig = JSON.parse(backupData);

        this.config = { ...this.getDefaultConfig(), ...parsedConfig };
        console.log(`已从备份恢复配置: ${latestBackup.name}`);
      } else {
        this.config = this.getDefaultConfig();
        console.log('未找到备份文件，使用默认配置');
      }
    } catch (error) {
      errorHandler.handleFileSystemError(
        'restore from backup',
        this.backupDir,
        error
      );
      this.config = this.getDefaultConfig();
    }
  }

  private notifyWatchers(): void {
    this.watchers.forEach((callback) => {
      try {
        callback(this.config);
      } catch (error) {
        errorHandler.handle(error, { context: 'config watcher' });
      }
    });
  }
}
