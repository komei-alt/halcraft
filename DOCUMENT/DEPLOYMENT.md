# ハルクラ デプロイ・運用ドキュメント

> ハルクラは Vite + React の SPA。Nginx コンテナで配信し、Cloudflare Tunnel で公開する。

```
Status: 確定
Version: 1.0
Created: 2026-03-22
```

---

## 1. アーキテクチャ

```
[ビルドフロー]
Mac Studio (or MacBook Air)
  → npm run build (Vite SPA ビルド)
  → tar + ssh → NAS
  → docker build (Nginx イメージ)
  → docker compose up -d

[外部アクセス]
ユーザー → halcraft.roshco.jp → Cloudflare Tunnel → NAS:4000 (Nginx)

[社内アクセス]
ブラウザ → http://192.168.100.100:4000
```

---

## 2. 接続情報

| 項目 | 値 |
|------|-----|
| SSH Host | `nas` (= `rosch-admin@192.168.100.100`) |
| プロジェクトパス | `/volume1/docker/halcraft` |
| Docker イメージ | `halcraft:latest` |
| 内部ポート | `4000` |
| 本番 URL | `https://halcraft.roshco.jp` |
| ドメイン | `roshco.jp`（サブドメイン: `halcraft`） |

---

## 3. コンテナ構成

| コンテナ名 | イメージ | ポート | 用途 |
|-----------|---------|--------|------|
| `halcraft` | `halcraft:latest` | 4000:80 | Nginx SPA 配信 |

> DB は不要。ゲーム状態はクライアントサイドの Zustand で管理。

---

## 4. Cloudflare Tunnel 設定

NAS 上の既存 `cloudflared` コンテナの Tunnel 設定に、ハルクラのルートを追加する。

### 設定追加手順

1. Cloudflare Zero Trust ダッシュボードにログイン
2. Access → Tunnels → 既存の Tunnel を選択
3. Public Hostname に追加:
   - **Subdomain**: `halcraft`
   - **Domain**: `roshco.jp`
   - **Service**: `http://192.168.100.100:4000`

### DNS レコード（自動作成）

Tunnel 設定時に Cloudflare が自動的に CNAME レコードを作成する:

```
halcraft.roshco.jp → <tunnel-id>.cfargotunnel.com (CNAME, Proxied)
```

### 注意事項

- `roshco.jp` のドメインが Cloudflare で管理されている必要がある
- SSL は Cloudflare が自動管理（Full (strict) 推奨）
- Tunnel がまだ `roshco.jp` ゾーンに接続されていない場合は、新しい Tunnel を作成するか、既存 Tunnel に `roshco.jp` のホスト名を追加する

---

## 5. デプロイ

### クイックスタート

```bash
/deploy   # エージェントにデプロイを指示
```

### 手動デプロイ

```bash
# 1. ローカルビルド
cd halcraft && npm run build

# 2. NAS にファイル同期
cd /Users/komei/Develop/Hobby\ _Hal_Game\ 01 && \
tar cf - \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='halcraft/dist' \
  halcraft/ docker-compose.yml | \
ssh nas "sudo mkdir -p /volume1/docker/halcraft && sudo tar xf - -C /volume1/docker/halcraft --strip-components=0"

# 3. Docker ビルド & 起動
ssh nas "cd /volume1/docker/halcraft && sudo /usr/local/bin/docker compose up -d --build"

# 4. ヘルスチェック
curl -s -o /dev/null -w '%{http_code}' http://192.168.100.100:4000
```

---

## 6. ヘルスチェックと動作確認

```bash
# コンテナ状態
ssh nas "sudo /usr/local/bin/docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep halcraft"

# ログ確認
ssh nas "sudo /usr/local/bin/docker logs halcraft --tail 50"

# 社内アクセス
curl -s http://192.168.100.100:4000

# 外部アクセス（Tunnel 設定後）
curl -s https://halcraft.roshco.jp
```

---

## 7. 緊急時のリカバリ

```bash
# コンテナ再起動
ssh nas "sudo /usr/local/bin/docker restart halcraft"

# 完全再ビルド
ssh nas "cd /volume1/docker/halcraft && sudo /usr/local/bin/docker compose down && sudo /usr/local/bin/docker compose up -d --build"

# イメージのクリーンアップ（ディスク不足時）
ssh nas "sudo /usr/local/bin/docker image prune -f"
```

---

*最終更新: 2026-03-22*
