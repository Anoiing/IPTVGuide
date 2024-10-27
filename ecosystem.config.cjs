module.exports = {
  apps: [
    {
      name: "app",
      script: "npm",
      args: "run server",
      cwd: "./",
      autorestart: true,                     // 自动重启
      ignore_watch: ["node_modules", ".git"] // 忽略不需要监视的目录
    }
  ]
};