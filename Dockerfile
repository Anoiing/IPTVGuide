# docker build --build-arg arch=amd64 -t iptvguide:latest "."
# docker save -o /Users/anoiv/desktop/iptvguide.tar iptvguide

ARG arch='amd64'
# 使用Node.js的官方Docker镜像作为基础镜像  
FROM --platform=linux/${arch} node:18-alpine

# 设置环境变量，以便 puppeteer 可以下载正确的 Chromium 版本  
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true  
ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium-browser  

# 安装必要的依赖  
RUN apk add --no-cache \  
    chromium \  
    nss \  
    freetype \  
    harfbuzz \  
    ca-certificates \  
    ttf-freefont \  
    gcc \  
    g++ \  
    make \  
    python3 \  
    && npm install -g npm

# 设置工作目录
WORKDIR /app

# 复制前端和后端文件
COPY ./dist /app/dist
COPY ./server.js /app
COPY ./ecosystem.config.cjs /app
COPY ./entrypoint.sh /app
COPY ./package.server.json /app/package.json

# 安装依赖
# RUN npm i pm2 --registry=https://registry.npmmirror.com
RUN yarn

# 预创建文件夹，防止读不到报错
RUN mkdir -p config
RUN mkdir -p output

# 暴露端口 5174
EXPOSE 5174

# 设置环境变量
ENV TZ="Asia/Shanghai"

# 设置容器启动时执行的命令或脚本
# ENTRYPOINT ["/app/entrypoint.sh"]
# CMD ["pm2-runtime start ecosystem.config.cjs"]
CMD ["node", "server.js"]
