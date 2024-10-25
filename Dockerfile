FROM node:18

# 设置工作目录
WORKDIR /app

# 复制前端和后端文件
COPY ./dist ./dist
COPY ./server.js .
COPY ./ecosystem.config.cjs .
COPY ./entrypoint.sh .
COPY ./package.server.json ./package.json

# 安装依赖
RUN npm i pm2 -g
RUN yarn install
RUN mkdir -p config
RUN mkdir -p output


# 暴露端口 5174
EXPOSE 5174

# 设置环境变量
ENV TZ="Asia/Shanghai"

# 设置容器启动时执行的命令或脚本
ENTRYPOINT ["./entrypoint.sh"]
