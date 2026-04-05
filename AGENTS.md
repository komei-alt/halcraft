# ハルクラ (HalCraft) — エージェントルール

> **レプリカ**: このファイルは `CLAUDE.md` のレプリカ。差異がある場合は `CLAUDE.md` を優先する。

```
Status: 確定
Version: 3.1
Created: 2026-03-21
Updated: 2026-04-05
Replica of: CLAUDE.md
Game: ハルクラ (HalCraft)
```

---

## 1. プロジェクト概要

**ハルクラ**は、7歳のハルが描いたイラストを使ったオリジナルのマインクラフト風 3D ボクセルサンドボックスゲーム。
ブラウザ上で動作し、**デスクトップ（キーボード＋マウス）とモバイル（タッチ操作）の両方**に対応する。

### コンセプト

- **ハルの絵を活かす**: 全アセットは7歳のハルが手描きしたイラスト。テクスチャや3Dオブジェクトは、子供が描いた本来の味・雰囲気を最大限に活かして実装する
- **子供の夢を形にする**: ハルが夢見るオリジナルゲームの世界を忠実に再現する
- マインクラフト的な世界観（ブロック、クラフト、モブ、冒険）
- ブラウザで完結する Web ゲーム（デスクトップ＆モバイル両対応）
- 複数の切り替え可能な3Dワールド

### アセットの原則

1. **ハルのイラストが原本**: アセットは全て、ハルが描いた絵が出発点
2. **味を活かす実装**: テクスチャやモデルの生成時、子供らしいタッチや色使いを変えない。綺麗にしすぎない
3. **3Dオブジェクト化**: イラストは可能な限り本来の味を生かした3Dオブジェクトとして生成する
4. **コンセプトアート**: 世界観の参考資料。スタイルや色味の指針として使用（直接使用しない）

---

## 2. 技術スタック

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| フレームワーク | React 19 + TypeScript | UIとアプリ基盤 |
| ビルドツール | Vite 8 | 開発サーバー・バンドラー |
| 3D エンジン | Three.js + React Three Fiber (R3F) | 3Dレンダリングの中核 |
| 3D ユーティリティ | @react-three/drei | テクスチャ、ローダー等 |
| 物理エンジン | カスタム AABB 衝突判定 | ブロックワールド最適化の独自実装 |
| 状態管理 | Zustand | ゲーム状態（チャンク、インベントリ、HP 等） |
| 地形生成 | simplex-noise | プロシージャル地形の生成（FBMアルゴリズム） |
| ID 生成 | uuid | エンティティのユニーク ID |
| コンテナ | Docker + Nginx | 本番デプロイ（Synology NAS） |
| 公開 | Cloudflare Tunnel | 外部アクセス（halcraft.rosch.jp） |

> **注**: Rapier物理エンジンは初期実装で使用していたが、ブロックワールドとの相性問題により
> カスタムAABB衝突判定に置き換えた。パフォーマンスと精度の両面で改善。

---

## 3. ディレクトリ構造

```
Hobby _Hal_Game 01/
├── CLAUDE.md              ← ルール正本
├── AGENTS.md              ← 本ファイル（レプリカ）
├── docker-compose.yml     ← NASデプロイ用
├── halcraft/              ← ゲーム本体（Vite + React プロジェクト）
│   ├── Dockerfile             ← マルチステージビルド（Node → Nginx）
│   ├── nginx.conf             ← SPA ルーティング設定
│   ├── .dockerignore          ← Docker ビルド除外
│   ├── src/
│   │   ├── main.tsx           ← エントリーポイント
│   │   ├── App.tsx            ← ルートコンポーネント（Canvas統合）
│   │   ├── App.css            ← アプリスタイル
│   │   ├── index.css          ← グローバルスタイル
│   │   ├── types/
│   │   │   ├── blocks.ts         ← ブロック種別定義（15種）
│   │   │   └── crafting.ts       ← クラフトレシピ定義
│   │   ├── stores/
│   │   │   ├── useGameStore.ts    ← ゲームフェーズ・昼夜サイクル管理
│   │   │   ├── usePlayerStore.ts  ← HP・ホットバー・ダメージ管理
│   │   │   ├── useWorldStore.ts   ← チャンク・ブロックデータ管理
│   │   │   ├── useInventoryStore.ts ← インベントリ管理
│   │   │   └── useMobStore.ts     ← モブの状態管理
│   │   ├── utils/
│   │   │   └── terrain.ts        ← 地形生成（FBM + simplex-noise）
│   │   └── components/
│   │       ├── Player.tsx         ← FPS プレイヤー（カスタム物理）
│   │       ├── World.tsx          ← チャンクベース地形描画
│   │       ├── Environment.tsx    ← スカイ・ライティング・霧
│   │       ├── BlockInteraction.tsx ← ブロック破壊/設置
│   │       ├── BlockLights.tsx    ← 光源ブロックの動的ライティング
│   │       ├── TorchRenderer.tsx  ← 松明の3D描画
│   │       ├── BedRenderer.tsx    ← ベッドの3D描画
│   │       ├── mobs/
│   │       │   ├── MobManager.tsx    ← モブの一括管理・AI
│   │       │   ├── Zombie.tsx        ← ゾンビ（敵）
│   │       │   ├── Spider.tsx        ← クモ（敵）
│   │       │   ├── Chicken.tsx       ← ニワトリ（中立）
│   │       │   ├── Prototype.tsx     ← プロトタイプ（味方・GLBモデル）
│   │       │   └── IronGolem.tsx     ← アイアンゴーレム（味方・ボクセル）
│   │       └── ui/
│   │           ├── StartScreen.tsx    ← タイトル画面
│   │           ├── Crosshair.tsx      ← 照準UI
│   │           ├── Hotbar.tsx         ← ブロック選択バー
│   │           ├── HealthBar.tsx      ← HP表示
│   │           ├── DamageOverlay.tsx   ← ダメージエフェクト
│   │           ├── TimeDisplay.tsx    ← 昼夜時間表示
│   │           └── CraftingScreen.tsx ← クラフト画面
│   ├── public/
│   │   └── textures/
│   │       ├── blocks/            ← ブロックテクスチャ（15種）
│   │       └── sky.png            ← スカイボックステクスチャ
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig*.json
├── アセット/                ← 素材ライブラリ（ハルのイラスト原本）
│   └── 2026:03:21/          ← 日付別アセット（70素材）
│       ├── *.png                ← ハルが描いた元画像
│       └── processed/          ← 背景除去済みアセット（BiRefNet処理）
├── .agent/
│   └── workflows/
│       └── deploy.md          ← NASデプロイワークフロー
├── PLAN/                  ← 設計プラン（実行完了後は archive/ へ）
│   └── archive/
└── DOCUMENT/              ← ドキュメント（完了済みは archive/ へ）
    ├── DEPLOYMENT.md          ← デプロイ・運用ドキュメント
    └── archive/
```

---

## 4. アセット分類体系（v2）

全70素材を6カテゴリに分類して管理する。

| カテゴリ | 数 | 説明 |
|---------|---|------|
| 🧱 Block | 15 | マイクラ風の統一サイズ（1×1×1）ブロック。掘る・置く |
| 🧊 3D Object | ~40 | キャラクター、乗り物、武器、装備、通貨など |
| 🏠 Building | 5 | ブロック構成の破壊可能な建造物（中に入れる空間あり） |
| 🌍 World | 6 | プロシージャル生成される切り替え可能な3Dワールド |
| 🖼️ UI | 7 | HUD・メニューの2Dオーバーレイ |
| 🎨 Concept Art | 5 | 世界観の参考資料（直接使用しない） |

### ルール
- 複数描かれた素材 → 単体で切り出して個別オブジェクト化
- 建物系 → 壊せるブロックで構成し、中に入れる空間を作る
- 背景 → 平面に絵を貼るのではなく、3Dワールドとしてプロシージャル生成
- コンセプトアート → あくまで世界観の参考。スタイルや色味の指針

### モブ一覧

| モブ名 | タイプ | 陣営 | HP | 特徴 |
|--------|--------|------|-----|------|
| ゾンビ | `zombie` | 敵 | 10 | 夜間スポーン、プレイヤーを追跡・攻撃 |
| クモ | `spider` | 敵 | 8 | 夜間スポーン、高速移動 |
| ニワトリ | `chicken` | 中立 | 4 | 昼間スポーン、プレイヤーから逃げる |
| プロトタイプ | `prototype` | 味方 | 50 | GLBモデル、プレイヤー追従・敵を攻撃 |
| アイアンゴーレム | `iron_golem` | 味方 | 40 | SPAWNERブロックから召喚、ボクセルスタイル、敵を自動攻撃 |

---

## 5. 開発原則

### 5.1 AIファースト

- **全てAntigravity上で完結**する。
- 人間が手動コーディングすることを前提としない。

### 5.2 パフォーマンス設計

- **InstancedMesh** でブロックを効率描画（ブロック種別ごとに1つ）
- **チャンクシステム**: 16×16×64 のチャンク単位で管理
- **露出面のみ描画**: 埋もれたブロックはレンダリングしない
- **バージョン管理の再描画**: 変更されたチャンクのみ再構築
- **カスタム物理**: Rapierを使わずAABB衝突判定で軽量動作

### 5.3 操作体系（デュアルプラットフォーム）

#### デスクトップ（キーボード＋マウス）

- **WASD**: 移動 / **Shift**: ダッシュ
- **Space**: ジャンプ
- **マウス**: 視点操作（PointerLock）
- **左クリック**: ブロック破壊
- **右クリック**: ブロック設置
- **1-9 / マウスホイール**: ホットバー選択
- **E**: クラフト画面の開閉

#### モバイル（タッチ操作）

- **左スティック（バーチャルジョイスティック）**: 移動
- **右エリアスワイプ**: 視点操作
- **タップ**: ブロック破壊
- **長押し**: ブロック設置
- **ジャンプボタン**: ジャンプ
- **ホットバースワイプ/タップ**: ブロック選択

> モバイル対応は段階的に実装する。Phase 1 ではタッチ検出とバーチャルジョイスティックから開始。

---

## 6. アーキテクチャ規約

### 6.1 コンポーネント構成

```
src/components/
├── Player.tsx             ← プレイヤー制御（カスタム物理、入力処理）
├── World.tsx              ← チャンクベース地形描画（InstancedMesh）
├── Environment.tsx        ← 環境描画（スカイ、光源、霧）
├── BlockInteraction.tsx   ← ブロック破壊/設置（レイマーチング）
├── BlockLights.tsx        ← 光源ブロックの動的ライティング
├── TorchRenderer.tsx      ← 松明の3Dオブジェクト描画
├── BedRenderer.tsx        ← ベッドの3Dオブジェクト描画
├── mobs/                  ← モブ種別ごとのコンポーネント
├── vehicles/              ← 乗り物コンポーネント（今後追加）
├── items/                 ← アイテムコンポーネント（今後追加）
├── buildings/             ← 建造物コンポーネント（今後追加）
└── ui/                    ← HUD・メニュー等の 2D UI
    └── mobile/            ← モバイル専用 UI（ジョイスティック等）
```

### 6.2 状態管理（Zustand）

```typescript
src/stores/
├── useGameStore.ts        ← ゲームフェーズ・昼夜サイクル管理
├── usePlayerStore.ts      ← HP、ホットバー選択、ダメージ
├── useWorldStore.ts       ← チャンクデータ、ブロック読み書き
├── useInventoryStore.ts   ← インベントリ管理
└── useMobStore.ts         ← モブの状態管理
```

### 6.3 テクスチャ・アセット管理

- ブロックテクスチャ → `public/textures/blocks/` に配置
- テクスチャは `THREE.TextureLoader` + メモリキャッシュ
- ピクセルアート風テクスチャは `NearestFilter` を適用
- 背景除去は **BiRefNet** モデル + **Alpha Matting** で高精度処理
- **ハルのイラストの線・色合い・テイストは保持する**

### 6.4 モバイル対応設計

- **入力抽象化**: デスクトップ/モバイルの入力を統一インターフェースで処理
- **レスポンシブUI**: UI コンポーネントはビューポートサイズに応じて表示を変更
- **パフォーマンス調整**: モバイルではレンダリング距離を自動的に縮小
- **タッチイベント**: `pointerdown/pointermove/pointerup` で統一処理

---

## 7. コーディング規約

### 7.1 TypeScript

- `strict: true` を維持
- `any` 型は使用禁止
- R3F コンポーネントの props は明示的にインターフェースを定義

### 7.2 命名

- コンポーネント: `PascalCase`（例: `Player.tsx`）
- ストア: `use[Name]Store.ts`
- ユーティリティ: `camelCase.ts`
- 定数: `UPPER_SNAKE_CASE`
- コメント: **日本語**

---

## 8. Git 規約

Conventional Commits 形式、日本語。

```
feat: チャンクベースの地形生成システムを実装
fix: プレイヤーの衝突判定バグを修正
assets: ブロックテクスチャ13種を追加
docs: AGENTS.md をv2アーキテクチャに更新
infra: NASデプロイ用Dockerfile追加
```

---

## 9. デプロイ

### 本番環境

| 項目 | 値 |
|------|-----|
| ホスティング | Synology NAS (Docker + Nginx) |
| URL | `https://halcraft.rosch.jp` |
| ポート | `:4000` (コンテナ内 `:80`) |
| DNS | Cloudflare Tunnel 経由 |

### クイックデプロイ

```bash
/deploy   # エージェントがSSH経由でNASへデプロイ
```

> 詳細は `DOCUMENT/DEPLOYMENT.md` および `.agent/workflows/deploy.md` を参照。

---

## 10. 開発コマンド

```bash
# 開発サーバー起動
cd halcraft && npm run dev -- --host

# 型チェック
cd halcraft && npx tsc --noEmit

# ビルド
cd halcraft && npm run build

# Docker ローカルテスト
cd halcraft && docker build -t halcraft:latest . && docker run -p 4000:80 halcraft:latest
```

---

*最終更新: 2026-04-05 v3.1*
