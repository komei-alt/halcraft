# ============================================
# ハルクラ (HalCraft) - Multi-stage Docker Build
# 静的サイトとして Nginx でサーブ
# ============================================
#
# ハルクラは Vite + React の SPA なので、
# ビルド成果物を Nginx で配信するだけで動作する。
#
# ビルド:
#   docker build -t halcraft:latest .
#
# 実行:
#   docker run -d -p 4000:80 halcraft:latest

# --- Stage 1: Build ---
FROM node:22-alpine AS builder
WORKDIR /app

# 依存関係のインストール（キャッシュ効率化）
COPY package.json package-lock.json ./
RUN npm ci

# ソースコードのコピーとビルド
COPY . .
RUN npm run build

# --- Stage 2: Production (Nginx) ---
FROM nginx:alpine AS runner

# カスタム Nginx 設定
COPY nginx.conf /etc/nginx/conf.d/default.conf

# ビルド成果物をコピー
COPY --from=builder /app/dist /usr/share/nginx/html

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
