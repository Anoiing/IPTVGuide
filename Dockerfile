# docker build --build-arg arch=amd64 -t iptvguide:latest "."

ARG arch='amd'
FROM --platform=linux/${arch} node:18

RUN apt-get update --fix-missing && apt-get install -y \
ca-certificates \
fonts-liberation \
libasound2 \
libatk-bridge2.0-0 \
libatk1.0-0 \
libc6 \
libcairo2 \
libcups2 \
libdbus-1-3 \
libexpat1 \
libfontconfig1 \
libgbm1 \
libgcc1 \
libglib2.0-0 \
libgtk-3-0 \
libnspr4 \
libnss3 \
libpango-1.0-0 \
libpangocairo-1.0-0 \
libstdc++6 \
libx11-6 \
libx11-xcb1 \
libxcb1 \
libxcomposite1 \
libxcursor1 \
libxdamage1 \
libxext6 \
libxfixes3 \
libxi6 \
libxrandr2 \
libxrender1 \
libxss1 \
libxtst6 \
lsb-release \
wget \
xdg-utils
# RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
# RUN sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
# RUN apt-get install -y google-chrome-stable

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
RUN PUPPETEER_PRODUCT=chrome yarn install
RUN mkdir -p config
RUN mkdir -p output

# 暴露端口 5174
EXPOSE 5174

# 设置环境变量
ENV TZ="Asia/Shanghai"

# 设置容器启动时执行的命令或脚本
ENTRYPOINT ["./entrypoint.sh"]
