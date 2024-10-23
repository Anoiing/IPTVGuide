FROM node:18

WORKDIR .

COPY package.json .

RUN pnpm install

COPY . .

EXPOSE 5173 5174

ENV CONFIG_DIR=/config
ENV OUT_DIR=/output
ENV TZ=Asia/Shanghai

CMD ["npm", "run", "dev", "&&", "node", "server.js"]