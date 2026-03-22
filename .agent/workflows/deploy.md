---
description: ハルクラを Synology NAS にデプロイする
---

# ハルクラ デプロイワークフロー

// turbo-all

## 前提条件

- SSH: `ssh nas` でパスワードなしアクセス可能
- NAS上のプロジェクトパス: `/volume1/docker/halcraft`
- ポート: `4000` (Nginx)
- URL: `https://halcraft.roshco.jp` (Cloudflare Tunnel 経由)

## 手順

### 1. ローカルビルド検証

```bash
cd halcraft && npm run build
```

ビルドエラーがないことを確認する。

### 2. 型チェック

```bash
cd halcraft && npx tsc --noEmit
```

型エラーがないことを確認する。

### 3. NAS にファイル同期（tar + ssh）

rsync は Synology NAS の PAM 制限で使えないため、tar + ssh パイプラインを使う。

```bash
cd /Users/komei/Develop/Hobby\ _Hal_Game\ 01 && \
tar cf - \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='halcraft/dist' \
  halcraft/ docker-compose.yml | \
ssh nas "sudo mkdir -p /volume1/docker/halcraft && sudo tar xf - -C /volume1/docker/halcraft --strip-components=0"
```

### 4. NAS 上で Docker ビルド

```bash
ssh nas "cd /volume1/docker/halcraft && sudo /usr/local/bin/docker compose build --no-cache"
```

### 5. コンテナ入替

```bash
ssh nas "cd /volume1/docker/halcraft && sudo /usr/local/bin/docker compose up -d --force-recreate"
```

### 6. ヘルスチェック

```bash
ssh nas "sudo /usr/local/bin/docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep halcraft"
```

コンテナが `Up` 状態であることを確認する。

```bash
curl -s -o /dev/null -w '%{http_code}' http://192.168.100.100:4000
```

`200` が返ることを確認する。

### 7. 外部アクセス確認（Cloudflare Tunnel 設定後）

```bash
curl -s -o /dev/null -w '%{http_code}' https://halcraft.roshco.jp
```

## トラブルシューティング

### コンテナが起動しない

```bash
ssh nas "sudo /usr/local/bin/docker compose -f /volume1/docker/halcraft/docker-compose.yml logs --tail 50"
```

### ビルドエラー

```bash
ssh nas "sudo /usr/local/bin/docker compose -f /volume1/docker/halcraft/docker-compose.yml build 2>&1 | tail -30"
```

### 完全リセット

```bash
ssh nas "cd /volume1/docker/halcraft && sudo /usr/local/bin/docker compose down && sudo /usr/local/bin/docker compose up -d --build"
```
