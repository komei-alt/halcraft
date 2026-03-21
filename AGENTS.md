# ハルクラ (HalCraft) — エージェントルール

> **レプリカ**: このファイルは `CLAUDE.md` のレプリカ。差異がある場合は `CLAUDE.md` を優先する。

```
Status: 確定
Version: 1.0
Created: 2026-03-21
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

---

## 2. 技術スタック

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| フレームワーク | React 19 + TypeScript | UIとアプリ基盤 |
| ビルドツール | Vite 8 | 開発サーバー・バンドラー |
| 3D エンジン | Three.js + React Three Fiber (R3F) | 3Dレンダリングの中核 |
| 3D ユーティリティ | @react-three/drei | カメラコントロール、テクスチャ、ローダー等 |
| 物理エンジン | @react-three/rapier (Rapier) | 衝突判定、重力、剛体シミュレーション |
| ポストプロセス | @react-three/postprocessing | ブルーム、SSAO 等のエフェクト |
| 状態管理 | Zustand | ゲーム状態（インベントリ、HP 等） |
| 地形生成 | simplex-noise | プロシージャル地形の生成 |
| ID 生成 | uuid | エンティティのユニーク ID |

---

## 3. ディレクトリ構造

```
Hobby _Hal_Game 01/
├── CLAUDE.md              ← ルール正本
├── AGENTS.md              ← 本ファイル（レプリカ）
├── halcraft/              ← ゲーム本体（Vite + React プロジェクト）
│   ├── src/
│   │   ├── main.tsx           ← エントリーポイント
│   │   ├── App.tsx            ← ルートコンポーネント（Canvas, Physics）
│   │   ├── App.css            ← アプリスタイル
│   │   ├── index.css          ← グローバルスタイル
│   │   ├── assets/            ← 静的アセット（画像）
│   │   └── components/        ← Reactコンポーネント
│   │       ├── Player.tsx         ← FPS プレイヤー操作
│   │       ├── World.tsx          ← 地形・ブロック世界
│   │       ├── Environment.tsx    ← スカイボックス・環境
│   │       └── Companion.tsx      ← NPC ボクセル化コンパニオン
│   ├── public/
│   │   └── textures/          ← ゲーム用テクスチャ
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig*.json
├── アセット/                ← 素材ライブラリ
│   └── YYYY:MM:DD/          ← 日付別アセット
│       ├── *.png                ← 元画像（AI生成）
│       └── processed/          ← 背景除去済みアセット
├── PLAN/                  ← 設計プラン（実行完了後は archive/ へ）
│   └── archive/
└── DOCUMENT/              ← ドキュメント（完了済みは archive/ へ）
    └── archive/
```

---

## 4. 開発原則

### 4.1 AIファースト

- **全てAntigravity上で完結**する。コードの生成・デバッグ・テスト・ビルドをAIが自律的に行う。
- 人間が手動コーディングすることを前提としない。AIが全作業を遂行する。

### 4.2 3D化ルール

- 画像アセットからの 3D 化は、**裏面・側面・奥行きをAIが推論**して形状を生成する。
- 2D 画像を単にボクセル化する（Companion方式）にとどまらず、厚みと立体感をもたせる。
- テクスチャは `THREE.NearestFilter` を使い、ピクセルアート調の鮮明さを維持する。

### 4.3 自律バグ修正

- ビルドエラー、ランタイムエラーを検出した場合、AIが自律的に修正する。
- コンソールエラー、型エラー、ESLint 警告もプロアクティブに修正する。

### 4.4 操作体系

- **キーボード**: WASD 移動、Space ジャンプ、その他ゲーム操作キーは今後拡張
- **マウス**: 視点操作（PointerLockControls）、左クリック攻撃/設置、右クリック使用
- FPS 視点を基本とする

---

## 5. アーキテクチャ規約

### 5.1 コンポーネント構成

```
src/components/
├── Player.tsx         ← プレイヤー制御（移動、カメラ追従、入力処理）
├── World.tsx          ← ワールド生成（地形、ブロック）
├── Environment.tsx    ← 環境描画（スカイボックス、光源、天候）
├── Companion.tsx      ← NPC / モブ（画像→ボクセル変換）
├── ui/                ← HUD・メニュー等の 2D UI（今後追加）
├── blocks/            ← ブロック種別ごとのコンポーネント（今後追加）
├── mobs/              ← モブ種別ごとのコンポーネント（今後追加）
├── items/             ← アイテム種別ごとのコンポーネント（今後追加）
└── systems/           ← ゲームシステム（クラフト、インベントリ等、今後追加）
```

### 5.2 状態管理（Zustand）

ゲーム全体の状態は Zustand ストアで一元管理する。ストアは機能単位で分割する。

```typescript
// 命名規約
src/stores/
├── useGameStore.ts        ← ゲーム全体（フェーズ、設定）
├── usePlayerStore.ts      ← プレイヤー（HP、位置、インベントリ）
├── useWorldStore.ts       ← ワールド（ブロックデータ、チャンク）
└── useUIStore.ts          ← UI 状態（メニュー開閉、選択中スロット）
```

### 5.3 テクスチャ・アセット管理

- ゲーム内テクスチャ → `public/textures/` に配置
- アセットは `useTexture`（drei）でロードする
- ピクセルアート風テクスチャは必ず `NearestFilter` を適用
- 背景除去済みアセットを `アセット/YYYY:MM:DD/processed/` で管理

### 5.4 物理エンジン

- Rapier をベースとする物理シミュレーション
- 重力: `[0, -50, 0]`（高重力でフワフワ感を排除）
- プレイヤー: `CapsuleCollider` + `RigidBody(dynamic)`
- 地形/建物: `RigidBody(fixed)` + `cuboid` コライダー
- NPC: `RigidBody(fixed)` + `hull` コライダー

---

## 6. コーディング規約

### 6.1 TypeScript

- `strict: true` を維持する
- `any` 型は使用禁止。必ず適切な型を定義する
- R3F コンポーネントの props は明示的にインターフェースを定義する

### 6.2 コンポーネント

- 関数コンポーネント + hooks のみ使用（Class 非推奨）
- 1ファイル 1コンポーネント（default export はルート App のみ、他は named export）
- パフォーマンスが必要な箇所は `useMemo`, `useCallback`, `React.memo` を適切に使用

### 6.3 命名

- コンポーネント: `PascalCase` （例: `Player.tsx`, `IronGolem.tsx`）
- ストア: `use[Name]Store.ts` （例: `usePlayerStore.ts`）
- フック: `use[Name].ts` （例: `useKeyboard.ts`）
- ユーティリティ: `camelCase.ts` （例: `voxelizer.ts`）
- 定数: `UPPER_SNAKE_CASE` （例: `JUMP_FORCE`）
- コメント: **日本語**で記述する

### 6.4 パフォーマンス

- `InstancedMesh` を活用し、大量のブロック/ボクセルを効率的にレンダリング
- 描画範囲外のチャンクは非表示にする（チャンクローディング）
- `useFrame` 内で不要なオブジェクト生成を避ける（事前に `useRef` で保持）
- テクスチャアトラスを活用し、マテリアル数を最小限にする

---

## 7. Git 規約

### コミットメッセージ

Conventional Commits 形式、日本語で記述する。

```
feat: プレイヤーのジャンプ処理を実装
fix: 衝突判定の貫通バグを修正
refactor: World コンポーネントをチャンクベースに変更
assets: エンダーマンの3Dモデルを追加
docs: プロジェクトルール CLAUDE.md を策定
```

### ブランチ戦略

- `main`: 安定版
- `dev`: 開発ブランチ（日常の作業はここ）
- `feature/xxx`: 機能追加時

---

## 8. 開発コマンド

```bash
# 開発サーバー起動
cd halcraft && npm run dev -- --host

# ビルド
cd halcraft && npm run build

# リント
cd halcraft && npm run lint
```

---

*最終更新: 2026-03-21*
