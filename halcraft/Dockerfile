# ============================================
# ハルクラ (HalCraft) - Multi-stage Docker Build
# 静的サイトとして Node でサーブ
# ============================================
#
# ハルクラは Vite + React の SPA なので、
# ビルド成果物を軽量な静的サーバーで配信するだけで動作する。
#
# ビルド:
#   docker build -t halcraft:latest .
#
# 実行:
#   docker run -d -p 4000:80 halcraft:latest

# --- Stage 1: Build ---
FROM public.ecr.aws/docker/library/node:22-alpine AS builder
WORKDIR /app

# 依存関係のインストール（キャッシュ効率化）
COPY package.json package-lock.json ./
RUN npm ci

# ソースコードのコピーとビルド
COPY . .
RUN npm run build

# --- Stage 2: Production (Static server) ---
FROM public.ecr.aws/docker/library/node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

# 静的配信サーバーとビルド成果物をコピー
COPY docker-static-server.mjs ./
COPY --from=builder /app/dist ./dist

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["node", "docker-static-server.mjs"]
