# IPTV Guide

IPTV电视直播源更新工具 - 一个基于 Node.js + TypeScript + Svelte 的 Web 应用，用于爬取和管理 IPTV 频道源。

## 功能特性

- 📺 **自动爬取**: 定时从数据源获取最新的IPTV频道信息
- 🔄 **智能更新**: 自动检测频道可用性并更新失效链接
- 📋 **多格式输出**: 支持M3U、JSON、TXT等多种格式输出
- 🎯 **M3U直接访问**: 提供 `/m3u` 路由，可直接获取标准格式的播放列表
- ⚙️ **灵活配置**: 可自定义爬取频率、请求延迟等参数
- 🛡️ **安全保障**: 内置黑名单机制，防止无效IP影响爬取效率
- 📊 **实时监控**: 提供系统状态监控和日志查看功能
- 🐳 **Docker支持**: 一键部署，支持多平台运行

## 快速开始

### 使用Docker部署（推荐）

```bash
# 克隆项目
git clone https://github.com/yourusername/iptvguide.git
cd iptvguide

# 启动服务
docker-compose up -d

# 访问应用
http://localhost:5174
```

### 本地开发

```bash
# 安装依赖
npm install -g pnpm
pnpm install

# 启动开发服务器
pnpm run dev

# 构建生产版本
pnpm run build

# 启动生产服务器
pnpm run start
```

### Docker构建

```bash
# 构建amd64架构镜像
docker build --build-arg arch=amd64 -t iptvguide:2.0.0 .

# 或同时打上latest标签
docker build --build-arg arch=amd64 -t iptvguide:2.0.0 -t iptvguide:latest .

# 运行容器
docker run --rm -p 5174:5174 iptvguide:2.0.0
```

## API接口

### M3U播放列表

直接获取M3U格式的播放列表：

```
GET /m3u
```

**响应头:**
- `Content-Type: audio/x-mpegurl; charset=utf-8`
- `Content-Disposition: inline; filename="channels.m3u"`

**示例:**
```bash
# 下载M3U文件
curl -o channels.m3u http://localhost:5174/m3u

# 在IPTV播放器中使用
播放列表URL: http://localhost:5174/m3u
```

### 其他API

- `GET /api/getStatus` - 获取系统状态
- `GET /api/runOnce` - 手动执行一次爬取任务
- `GET /api/cancel` - 取消当前运行的任务

## 配置说明

### 系统配置

在Web界面中可以配置以下参数：

- **定时任务**: 设置自动爬取的Cron表达式
- **请求延迟**: 控制请求间隔，避免被目标网站限制
- **重试次数**: 设置请求失败时的重试次数
- **黑名单**: 管理无效的IP地址

### 环境变量

```bash
# 应用端口
PORT=5174

# 时区设置
TZ=Asia/Shanghai

# 运行环境
NODE_ENV=production
```

## 许可证

[MIT License](LICENSE)