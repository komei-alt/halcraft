---
description: ハルクラを Synology NAS にデプロイする
---

# ハルクラ デプロイワークフロー

// turbo-all

## 自動デプロイ（推奨）

GitHub に push するだけで NAS への自動デプロイが実行される。

### 仕組み

```
git push → GitHub Webhook → deploy.rosch.jp → NAS (halcraft-webhook)
→ git pull + docker compose build + up -d
```

### 確認方法

```bash
# Webhook サーバーのヘルスチェック
curl -s https://deploy.rosch.jp/webhook/health

# デプロイログ確認
ssh nas "sudo /usr/local/bin/docker logs halcraft-webhook --tail 30"
```

---

## 手動デプロイ

自動デプロイが動かない場合や、緊急時に使う。

### 前提条件

- SSH: `ssh nas` でパスワードなしアクセス可能
- NAS上のプロジェクトパス: `/volume1/docker/halcraft-repo`（git clone 済み）
- ポート: `4000` (Nginx), `9000` (Webhook)
- URL: `https://halcraft.rosch.jp` (Cloudflare Tunnel 経由)

### 手順

#### 1. ローカルビルド検証

```bash
cd halcraft && npm run build
```

ビルドエラーがないことを確認する。

#### 2. 型チェック

```bash
cd halcraft && npx tsc --noEmit
```

型エラーがないことを確認する。

#### 3. NAS のリポジトリを更新（git pull）

```bash
ssh nas "cd /volume1/docker/halcraft-repo && sudo git pull origin main"
```

#### 4. NAS 上で Docker ビルド

```bash
ssh nas "cd /volume1/docker/halcraft-repo && sudo /usr/local/bin/docker compose build --no-cache"
```

#### 5. コンテナ入替

```bash
ssh nas "cd /volume1/docker/halcraft-repo && sudo /usr/local/bin/docker compose up -d --force-recreate"
```

#### 6. ヘルスチェック

```bash
ssh nas "sudo /usr/local/bin/docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep halcraft"
```

コンテナが `Up` 状態であることを確認する。

```bash
curl -s -o /dev/null -w '%{http_code}' http://192.168.100.100:4000
```

`200` が返ることを確認する。

#### 7. 外部アクセス確認

```bash
curl -sk -o /dev/null -w '%{http_code}' https://halcraft.rosch.jp
```

## トラブルシューティング

### コンテナが起動しない

```bash
ssh nas "sudo /usr/local/bin/docker compose -f /volume1/docker/halcraft-repo/docker-compose.yml logs --tail 50"
```

### ビルドエラー

```bash
ssh nas "sudo /usr/local/bin/docker compose -f /volume1/docker/halcraft-repo/docker-compose.yml build 2>&1 | tail -30"
```

### 完全リセット

```bash
ssh nas "cd /volume1/docker/halcraft-repo && sudo /usr/local/bin/docker compose down && sudo /usr/local/bin/docker compose up -d --build"
```

### Webhook サーバーのログ

```bash
ssh nas "sudo /usr/local/bin/docker logs halcraft-webhook --tail 50"
```
