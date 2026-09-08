# ---------- 人力资源分析平台：生产镜像 ----------
# 使用轻量 Node 运行时（自带 npm）
FROM node:22-alpine

# 工作目录
WORKDIR /app

# 1) 先复制依赖清单并安装（利用 Docker 层缓存，改动源码不必重装依赖）
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# 2) 复制应用源码与静态资源
COPY . .

# 3) 数据目录（挂载点，便于持久化）
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# 端口
ENV PORT=3000
EXPOSE 3000

# 健康检查：命中 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# 启动
CMD ["node", "server.js"]
