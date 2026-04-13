---
description: ハルクラを Synology NAS にデプロイする
---

# ハルクラ NASデプロイ

// turbo-all

## 自動デプロイ

`git push origin main` で NAS bare repo の post-receive hook が発火し、180秒のデバウンス後に NAS Deploy Engine が自動デプロイを実行する。

### 仕組み

```
git push origin main → NAS bare repo → post-receive hook → デバウンス(180s) → nas-deploy.sh
```

---

## 手動デプロイ（エージェント実行）

```bash
ssh nas "/opt/nas-deploy/nas-deploy.sh --project halcraft --json"
```

### 障害診断

```bash
ssh nas "/opt/nas-deploy/nas-deploy.sh --project halcraft --diagnose --json"
```

### ロールバック

```bash
ssh nas "/opt/nas-deploy/nas-deploy.sh --project halcraft --rollback --json"
```

### ドライラン

```bash
ssh nas "/opt/nas-deploy/nas-deploy.sh --project halcraft --dry-run"
```

### ヘルスチェック

```bash
ssh nas "sudo /usr/local/bin/docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep halcraft"
```

## トラブルシューティング

### デプロイログ確認

```bash
ssh nas "cat /opt/nas-deploy/logs/halcraft/latest"
```

### コンテナログ確認

```bash
ssh nas "sudo /usr/local/bin/docker logs halcraft --tail 50"
```

### 完全リセット

```bash
ssh nas "cd /volume1/docker/halcraft-repo && sudo /usr/local/bin/docker compose down && sudo /usr/local/bin/docker compose up -d --build"
```
