# ハルクラ マルチプレイ実装プラン

```
Status: 承認済み
Version: 2.0
Created: 2026-03-23
```

---

## 方針

- 名前だけで自由参加（認証なし、手軽さ最重視）
- チャットは見送り（将来検討）
- サーバー永続性あり（ブロック変更をファイル保存）
- ROSCH Craft の既存マルチプレイコードを設計参考に活用
- サーバーは HalCraft 専用（分離運用）

---

## Phase 1: サーバー基盤

新規: `server/` ディレクトリ
- `server/index.js` — Express + Socket.IO（CORS許可、ポート4001）
- `server/WorldChanges.js` — ブロック変更の永続化（JSON、5分自動保存）
- `server/package.json` — 依存関係
- `server/Dockerfile` — Node.js Alpine コンテナ

## Phase 2: クライアント通信

- `src/utils/socket.ts` — Socket.IO 接続管理
- `src/stores/useMultiplayerStore.ts` — リモートプレイヤー状態

## Phase 3: 名前入力 UI

- `src/components/ui/StartScreen.tsx` — 名前入力フィールド追加

## Phase 4: Voxel Avatar + NameTag

- `src/components/RemotePlayers.tsx` — 他プレイヤー描画
- `src/components/VoxelAvatar.tsx` — ボクセルアバター
- `src/components/NameTag.tsx` — 頭上の名前表示

## Phase 5: 統合 + インフラ

- `docker-compose.yml` — halcraft-server サービス追加
- `src/components/Player.tsx` — 位置送信追加
- `src/components/BlockInteraction.tsx` — ブロック変更送信追加
- Cloudflare Tunnel ルート追加

