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
ユーザー → halcraft.rosch.jp → Cloudflare Tunnel → NAS:4000 (Nginx)

[社内アクセス（RTX1210 静的DNS）]
ブラウザ → halcraft.rosch.jp
  → RTX1210 DNS → 192.168.100.100（NAS直接）
  → NAS Nginx リバースプロキシ (:443) → halcraft コンテナ (:4000)
```

---

## 2. 接続情報

| 項目 | 値 |
|------|-----|
| SSH Host | `nas` (= `rosch-admin@192.168.100.100`) |
| プロジェクトパス | `/volume1/docker/halcraft` |
| Docker イメージ | `halcraft:latest` |
| 内部ポート | `4000` |
| 本番 URL | `https://halcraft.rosch.jp` |
| ドメイン | `rosch.jp`（サブドメイン: `halcraft`） |

---

## 3. コンテナ構成

| コンテナ名 | イメージ | ポート | 用途 |
|-----------|---------|--------|------|
| `halcraft` | `halcraft:latest` | 4000:80 | Nginx SPA 配信 |

> DB は不要。ゲーム状態はクライアントサイドの Zustand で管理。

---

## 3.5 ローカル直接アクセス（スプリットDNS）

社内ネットワークでは Cloudflare Tunnel を経由せず NAS に直接アクセスする。
全デバイス（子供の端末含む）で追加設定なしに自動的にローカルアクセスになる。

### 構成

1. **RTX1210 ルーター 静的DNS** (`dns static` コマンド)
   - `halcraft.rosch.jp` → `192.168.100.100`
   - `os.rosch.co.jp` → `192.168.100.100` ※ROSCH OS用
   - `core.rosch.co.jp` → `192.168.100.100` ※DSM用

2. **NAS Synology Nginx リバースプロキシ** (`/etc/nginx/conf.d/halcraft.conf`)
   - `halcraft.rosch.jp:443` → `localhost:4000`

### RTX1210 への静的DNS追加方法

```
管理 → 保守 → コマンドの実行
コマンド: dns static a <ホスト名> 192.168.100.100
例: dns static a halcraft.rosch.jp 192.168.100.100
```

### 確認コマンド

```bash
# DNS解決テスト（RTX1210経由）
nslookup halcraft.rosch.jp 192.168.100.1

# ローカルアクセス速度テスト
curl -sS -k -o /dev/null -w "HTTP:%{http_code} IP:%{remote_ip} Time:%{time_total}s\n" https://halcraft.rosch.jp
```

---

## 4. Cloudflare Tunnel 設定

NAS 上の既存 `cloudflared` コンテナの Tunnel 設定に、ハルクラのルートを追加する。

### 設定追加手順

1. Cloudflare Zero Trust ダッシュボードにログイン
2. Access → Tunnels → 既存の Tunnel を選択
3. Public Hostname に追加:
   - **Subdomain**: `halcraft`
   - **Domain**: `rosch.jp`
   - **Service**: `http://192.168.100.100:4000`

### DNS レコード（自動作成）

Tunnel 設定時に Cloudflare が自動的に CNAME レコードを作成する:

```
halcraft.rosch.jp → <tunnel-id>.cfargotunnel.com (CNAME, Proxied)
```

### 注意事項

- `rosch.jp` のドメインが Cloudflare で管理されている必要がある
- SSL は Cloudflare が自動管理（Full (strict) 推奨）
- Tunnel がまだ `rosch.jp` ゾーンに接続されていない場合は、新しい Tunnel を作成するか、既存 Tunnel に `rosch.jp` のホスト名を追加する

---

## 5. デプロイ

### 自動デプロイ（推奨）

`main` ブランチに `git push` するだけで自動的にNASにデプロイされる。

```bash
git push origin main
# GitHub Webhook → Cloudflare Tunnel → NAS Webhookサーバー → Docker ビルド & 起動
```

**仕組み**:
1. GitHub が push イベントを `https://deploy.rosch.jp/webhook` に送信
2. NAS上の Webhook サーバー（`:9000`）が署名検証 → デプロイスクリプト実行
3. git clone → `docker compose build --no-cache` → `docker compose up -d --force-recreate`

**設定場所**:
- Webhook サーバー: `/volume1/docker/deploy-webhook/`
- デプロイスクリプト: `/volume1/docker/deploy-webhook/scripts/deploy-halcraft.sh`
- GitHub Webhook: リポジトリ Settings → Webhooks

### クイックスタート（手動）

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

## 6. ソースコード管理

| 項目 | 値 |
|------|-----|
| GitHub | [komei-alt/halcraft](https://github.com/komei-alt/halcraft) (private) |
| ブランチ | `main` |
| 自動デプロイ | `main` に push で自動実行 |

---

## 7. ヘルスチェックと動作確認

```bash
# コンテナ状態
ssh nas "sudo /usr/local/bin/docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep halcraft"

# ログ確認
ssh nas "sudo /usr/local/bin/docker logs halcraft --tail 50"

# Webhookサーバーのログ
ssh nas "sudo /usr/local/bin/docker logs deploy-webhook --tail 50"

# 社内アクセス
curl -s http://192.168.100.100:4000

# 外部アクセス（Tunnel 設定後）
curl -s https://halcraft.rosch.jp

# Webhookサーバーのヘルスチェック
curl -s https://deploy.rosch.jp/health
```

## 7.5 RSDM Auto-Heal

ハルクラは RSDM 参加プロジェクト。`server` はサーバー例外、Socket.IO 接続エラー、ブラウザの未処理エラーを RSDM v2 schema で送信する。

- 参加設定: `.agents/project.yml`
- Hub 送信先: `RSDM_HUB_URL`（既定 `http://192.168.100.100:3102`）
- health URL: `https://halcraft.rosch.jp`, `https://halcraft-ws.rosch.jp/api/health`
- Auto-Heal 検証候補: `cd halcraft && npm run build`, `cd halcraft && npm run lint`, `node --check server/index.js`

RSDM Hub が落ちていてもゲームは停止しない。ログはローカル `.rosch/` にフォールバック保存される。

---

## 8. 緊急時のリカバリ

```bash
# コンテナ再起動
ssh nas "sudo /usr/local/bin/docker restart halcraft"

# 完全再ビルド
ssh nas "cd /volume1/docker/halcraft && sudo /usr/local/bin/docker compose down && sudo /usr/local/bin/docker compose up -d --build"

# イメージのクリーンアップ（ディスク不足時）
ssh nas "sudo /usr/local/bin/docker image prune -f"
```

---

*最終更新: 2026-03-22 v1.2*
