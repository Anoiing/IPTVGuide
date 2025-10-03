# docker build --build-arg arch=amd64 -t iptvguide:版本号 "."
# docker save -o /home/AnoiV/iptvguide.tar iptvguide:版本号
# docker tag iptvguide:版本号 anoiv/iptvguide:latest
# docker push anoiv/iptvguide:latest

# 使用Node.js 20 Alpine镜像
FROM node:20-alpine

WORKDIR /app

# 安装pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装所有依赖（包括开发依赖，因为需要tsx）
RUN pnpm install --no-frozen-lockfile

# 复制构建好的应用和所有源代码
COPY dist-backup ./dist
COPY src ./src
COPY server.js ./

# 创建输出目录
RUN mkdir -p output

# 设置环境变量，指定端口为5174（与server.js中的默认端口一致）
ENV PORT=5174

# 暴露端口5174
EXPOSE 5174

# 启动完整服务器
CMD ["pnpm", "run", "start"]
