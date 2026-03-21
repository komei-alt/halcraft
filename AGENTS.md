# ハルクラ (HalCraft) — エージェントルール

> **レプリカ**: このファイルは `CLAUDE.md` のレプリカ。差異がある場合は `CLAUDE.md` を優先する。

```
Status: 確定
Version: 2.0
Created: 2026-03-21
Updated: 2026-03-21
Replica of: CLAUDE.md
Game: ハルクラ (HalCraft)
```

---

## 1. プロジェクト概要

**ハルクラ**は、マインクラフト風の 3D ボクセルサンドボックスゲーム。
ブラウザ上で動作し、キーボード＋マウスで操作する FPS 視点のゲーム。

### コンセプト

- マインクラフト的な世界観（ブロック、クラフト、モブ、冒険）
- 独自のアセットデザイン（AIで生成した画像アセットを 3D 化）
- ブラウザで完結する Web ゲーム
- 複数の切り替え可能な3Dワールド

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

> **注**: Rapier物理エンジンは初期実装で使用していたが、ブロックワールドとの相性問題により
> カスタムAABB衝突判定に置き換えた。パフォーマンスと精度の両面で改善。

---

## 3. ディレクトリ構造

```
Hobby _Hal_Game 01/
├── CLAUDE.md              ← ルール正本
├── AGENTS.md              ← 本ファイル（レプリカ）
├── halcraft/              ← ゲーム本体（Vite + React プロジェクト）
│   ├── src/
│   │   ├── main.tsx           ← エントリーポイント
│   │   ├── App.tsx            ← ルートコンポーネント（Canvas統合）
│   │   ├── App.css            ← アプリスタイル
│   │   ├── index.css          ← グローバルスタイル
│   │   ├── types/
│   │   │   └── blocks.ts         ← ブロック種別定義（13種）
│   │   ├── stores/
│   │   │   ├── useGameStore.ts    ← ゲームフェーズ管理
│   │   │   ├── usePlayerStore.ts  ← HP・ホットバー管理
│   │   │   └── useWorldStore.ts   ← チャンク・ブロックデータ管理
│   │   ├── utils/
│   │   │   └── terrain.ts        ← 地形生成（FBM + simplex-noise）
│   │   └── components/
│   │       ├── Player.tsx         ← FPS プレイヤー（カスタム物理）
│   │       ├── World.tsx          ← チャンクベース地形描画
│   │       ├── Environment.tsx    ← スカイ・ライティング・霧
│   │       ├── BlockInteraction.tsx ← ブロック破壊/設置
│   │       └── ui/
│   │           ├── Crosshair.tsx      ← 照準UI
│   │           ├── Hotbar.tsx         ← ブロック選択バー
│   │           └── StartScreen.tsx    ← タイトル画面
│   ├── public/
│   │   └── textures/
│   │       ├── blocks/            ← ブロックテクスチャ（13種）
│   │       └── sky.png            ← スカイボックステクスチャ
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig*.json
├── アセット/                ← 素材ライブラリ
│   └── 2026:03:21/          ← 日付別アセット（70素材）
│       ├── *.png                ← 元画像（AI生成）
│       └── processed/          ← 背景除去済みアセット（BiRefNet処理）
├── PLAN/                  ← 設計プラン（実行完了後は archive/ へ）
│   └── archive/
└── DOCUMENT/              ← ドキュメント（完了済みは archive/ へ）
    └── archive/
```

---

## 4. アセット分類体系（v2）

全70素材を6カテゴリに分類して管理する。

| カテゴリ | 数 | 説明 |
|---------|---|------|
| 🧱 Block | 13 | マイクラ風の統一サイズ（1×1×1）ブロック。掘る・置く |
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

### 5.3 操作体系

- **WASD**: 移動 / **Shift**: ダッシュ
- **Space**: ジャンプ
- **マウス**: 視点操作（PointerLock）
- **左クリック**: ブロック破壊
- **右クリック**: ブロック設置
- **1-9 / マウスホイール**: ホットバー選択

---

## 6. アーキテクチャ規約

### 6.1 コンポーネント構成

```
src/components/
├── Player.tsx             ← プレイヤー制御（カスタム物理、入力処理）
├── World.tsx              ← チャンクベース地形描画（InstancedMesh）
├── Environment.tsx        ← 環境描画（スカイ、光源、霧）
├── BlockInteraction.tsx   ← ブロック破壊/設置（レイマーチング）
├── ui/                    ← HUD・メニュー等の 2D UI
├── mobs/                  ← モブ種別ごとのコンポーネント（今後追加）
├── vehicles/              ← 乗り物コンポーネント（今後追加）
├── items/                 ← アイテムコンポーネント（今後追加）
└── buildings/             ← 建造物コンポーネント（今後追加）
```

### 6.2 状態管理（Zustand）

```typescript
src/stores/
├── useGameStore.ts        ← ゲームフェーズ管理
├── usePlayerStore.ts      ← HP、ホットバー選択
└── useWorldStore.ts       ← チャンクデータ、ブロック読み書き
```

### 6.3 テクスチャ・アセット管理

- ブロックテクスチャ → `public/textures/blocks/` に配置
- テクスチャは `THREE.TextureLoader` + メモリキャッシュ
- ピクセルアート風テクスチャは `NearestFilter` を適用
- 背景除去は **BiRefNet** モデル + **Alpha Matting** で高精度処理

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
```

---

## 9. 開発コマンド

```bash
# 開発サーバー起動
cd halcraft && npm run dev -- --host

# 型チェック
cd halcraft && npx tsc --noEmit

# ビルド
cd halcraft && npm run build
```

---

*最終更新: 2026-03-21 v2.0*
