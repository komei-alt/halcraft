# ステージシステム再構築

## 概要

### 目的
ミッション・ボス戦中心の5ステージ構成を廃止し、**建築カテゴリ**と**戦争カテゴリ**の2軸 × 各4ステージ（計8ステージ）に再設計する。
各ステージはバイオーム（森・トロピカル・雪・砂漠）で差別化し、カテゴリごとにリセット仕様を変える。

### 非目標
- マルチプレイプロトコルの根本変更（`stageId` による部屋分離は維持）
- 地形生成アルゴリズムの全面刷新（既存 FBM ベースに**バイオームパラメータ**を注入する方式）
- モブ AI のロジック変更（スポーンルールのみ変更）

---

## 影響範囲

### 削除対象
| ファイル | 内容 | 理由 |
|---------|------|------|
| `types/stages.ts` | 旧ステージ定義 (`Mission`, `MissionType`, `STAGES`) | カテゴリ＋バイオーム構造に全面書き換え |
| `components/ui/MissionOverlay.tsx` | ミッション進捗表示 | ミッション概念廃止 |
| `components/ui/CoreHealthBar.tsx` | 防衛クリスタルHP | defend_core ミッション廃止 |
| `components/ui/BossHealthBar.tsx` | ボスHP表示 | defeat_boss ミッション廃止 |
| `App.tsx` 内のコア配置・ボススポーン effect | ミッション連動ロジック | 不要 |
| `useGameStore.ts` 内のミッション関連 state | `missionProgress`, `missionCleared`, `coreHp`, etc. | 不要 |
| `useMobStore.ts` 内の `trySpawnBoss` | ボススポーン | 不要 |

### 新規作成
| ファイル | 内容 |
|---------|------|
| `types/stages.ts` | 新ステージ定義（カテゴリ + バイオーム + リセットポリシー） |
| `types/biomes.ts` | バイオーム定義（地形パラメータ + ブロックマッピング + 環境色） |
| `utils/terrain/biomeConfig.ts` | バイオームごとの地形生成パラメータ |
| `components/ui/StageResetButton.tsx` | 手動リセットUI |

### 変更対象
| ファイル | 変更内容 |
|---------|---------|
| `utils/terrain/noise.ts` | シード値をバイオームIDから動的生成 |
| `utils/terrain/heightmap.ts` | バイオームパラメータ参照に切り替え |
| `utils/terrain/chunkGenerator.ts` | バイオームに応じたブロック種・構造物を生成 |
| `utils/terrain/structures/trees.ts` | バイオーム別の木の種類・密度 |
| `components/Environment.tsx` | バイオーム別の空色・霧色・光源色 |
| `components/ui/StartScreen.tsx` | カテゴリ選択 → ステージ選択の2段UI |
| `components/mobs/MobManager.tsx` | カテゴリに応じたスポーンルール |
| `stores/useGameStore.ts` | ミッション state 削除、リセット機能追加 |
| `stores/useWorldStore.ts` | ワールドリセット機能追加 |
| `App.tsx` | ミッション連動コード削除、リセットUI追加 |
| `server/index.js` | ステージID変更、戦争ステージの日次自動リセット |

---

## カテゴリ＋ステージ構造

### カテゴリ

| カテゴリ | ID | 説明 | リセット |
|---------|------|------|---------|
| 🏗️ 建築 | `build` | 自由に建築を楽しむ平和なワールド | 自動リセットなし / 手動リセット可 |
| ⚔️ 戦争 | `war` | モブが襲ってくる戦闘ワールド | 1日1回自動リセット / 手動リセット可 |

### ステージ一覧（計8ステージ）

| ステージID | カテゴリ | バイオーム | 名前 | テーマカラー |
|-----------|---------|----------|------|-------------|
| `build-forest` | 建築 | 森 | 🌲 森の建築場 | `#4caf50` |
| `build-tropical` | 建築 | トロピカル | 🌴 南国パラダイス | `#ff9800` |
| `build-snow` | 建築 | 雪 | ❄️ 雪の王国 | `#90caf9` |
| `build-desert` | 建築 | 砂漠 | 🏜️ 砂漠のオアシス | `#ffc107` |
| `war-forest` | 戦争 | 森 | 🌲 森の戦場 | `#388e3c` |
| `war-tropical` | 戦争 | トロピカル | 🌴 ジャングル戦線 | `#e65100` |
| `war-snow` | 戦争 | 雪 | ❄️ 極寒の前線 | `#1565c0` |
| `war-desert` | 戦争 | 砂漠 | 🏜️ 砂漠の決戦 | `#f57f17` |

---

## バイオーム定義

各バイオームは以下のパラメータで地形を差別化する：

```typescript
interface BiomeConfig {
  id: 'forest' | 'tropical' | 'snow' | 'desert';
  name: string;

  // 地形パラメータ
  baseHeight: number;        // 基準高さ (default: 20)
  heightVariation: number;   // 高低差の振幅 (default: 10)
  detailScale: number;       // 細かい凹凸のスケール
  noiseFrequency: number;    // ノイズ周波数
  noiseSeed: number;         // シード値

  // ブロックマッピング
  surfaceBlock: BlockId;     // 地表ブロック
  subSurfaceBlock: BlockId;  // 地表下ブロック
  deepBlock: BlockId;        // 深層ブロック

  // 木・植生
  treeType: 'oak' | 'palm' | 'pine' | 'cactus';
  treeDensity: number;       // 0.0 ~ 1.0
  treeHeight: { min: number; max: number };

  // 環境色
  skyColor: string;          // hex color
  fogColor: string;
  sunColor: string;
  nightSkyColor: string;
  fogDistance: { near: number; far: number };

  // 追加の環境特性
  hasSnow: boolean;          // 地表に雪が積もるか
}
```

### バイオーム特性

| バイオーム | 地表 | 地下 | 植生 | 空色 | 特徴 |
|-----------|------|------|------|------|------|
| 森 (`forest`) | 草ブロック | 土 | オーク (密度 0.4) | 青空 | 現在の世界とほぼ同じ。基準 |
| トロピカル (`tropical`) | 草ブロック (明るめ) | 土 | ヤシの木 (密度 0.3) | 鮮やかな空 | 高い木、明るい色調 |
| 雪 (`snow`) | 雪ブロック ※新規 | 土 | 松の木 (密度 0.25) | 白っぽい空 | 雪が積もった地表、霧が近い |
| 砂漠 (`desert`) | 砂ブロック ※新規 | 砂ブロック | サボテン (密度 0.08) | オレンジがかった空 | 平坦で乾燥、低密度の植生 |

> **新規ブロック**: `SNOW` と `SAND` を `types/blocks.ts` に追加する必要がある。
> テクスチャはハルのイラストスタイルに合わせて作成。

---

## 画面フロー

### スタート画面（StartScreen.tsx）

```
┌─────────────────────────────────────────┐
│           ハルクラ タイトル画像           │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  🏗️ 建築    │  │  ⚔️ 戦争    │      │  ← カテゴリ選択（タブ切替）
│  └─────────────┘  └─────────────┘      │
│                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │🌲 森 │ │🌴南国│ │❄️ 雪 │ │🏜️砂漠│  │  ← 選択カテゴリ内のステージ4つ
│  │ 3人  │ │ 0人  │ │ 1人  │ │ 0人  │  │     プレイヤー数表示
│  └──────┘ └──────┘ └──────┘ └──────┘  │
│                                         │
│  [サバイバル] [クリエイティブ]             │  ← ゲームモード
│  ┌──────────────────┐                   │
│  │  なまえを入力してね │                   │  ← 名前入力
│  └──────────────────┘                   │
│  [スキン選択]                             │
│  [ クリックでスタート ]                    │
└─────────────────────────────────────────┘
```

### プレイ中のリセットUI

- ポーズメニュー or 画面端に「ワールドリセット」ボタンを配置
- 確認ダイアログ → リセット実行
- リセット時: チャンクデータをクリア → 再生成 → プレイヤーをスポーン地点に戻す

---

## データフロー

### ステージ選択 → ゲーム開始

```
StartScreen
  ├→ カテゴリ選択 (build / war)
  ├→ ステージ選択 (forest / tropical / snow / desert)
  ├→ stageId = `${category}-${biome}` を構成
  ├→ useGameStore.setStage(stageId)
  │     ├→ StageDefinition をルックアップ
  │     └→ BiomeConfig を決定
  ├→ useWorldStore.initChunks(renderDistance, biomeConfig)  ← biome パラメータ注入
  ├→ multiplayer.join(name, stageId)
  └→ Environment が biomeConfig を参照して色を変更
```

### バイオーム → 地形生成

```
BiomeConfig (types/biomes.ts)
  └→ chunkGenerator.ts
       ├→ heightmap.ts: BiomeConfig.baseHeight, heightVariation で高さ計算
       ├→ noise.ts: BiomeConfig.noiseSeed でシード切り替え
       ├→ surfaceBlock / subSurfaceBlock でブロック種を決定
       └→ structures/trees.ts: treeType, treeDensity で植生を決定
```

### リセットフロー

```
手動リセット:
  StageResetButton (UI)
    → useWorldStore.resetWorld()
       ├→ heightCache クリア
       ├→ chunks クリア
       └→ initChunks(renderDistance, biomeConfig) で再生成
    → usePlayerStore: スポーン地点にリセット
    → useMobStore: 全モブクリア
    → multiplayer: 'world:reset' イベント送信

自動リセット (戦争ステージ、1日1回):
  server/index.js
    → 毎朝0時（JST）にチェック
    → 戦争カテゴリの worldChanges をクリア
    → 接続中プレイヤーに 'world:reset' を emit
```

---

## 実装タスク

### Phase 1: 型定義と基盤（ミッション廃止 + 新構造）

- [ ] **1.1** `types/stages.ts` を新カテゴリ＋バイオーム構造に書き換え
  - `StageCategory` 型 (`'build' | 'war'`)
  - `BiomeId` 型 (`'forest' | 'tropical' | 'snow' | 'desert'`)
  - `StageDefinition` 型（ミッション削除、カテゴリ + バイオーム追加）
  - `STAGES` 配列を8ステージで再定義
  - `getCategoryStages(category)` ヘルパー
- [ ] **1.2** `types/biomes.ts` を新規作成
  - `BiomeConfig` インターフェース
  - 4バイオームの具体パラメータ定義
- [ ] **1.3** `types/blocks.ts` に `SNOW`, `SAND` ブロックを追加
  - テクスチャ: ハルスタイルの雪ブロック・砂ブロック画像を用意
- [ ] **1.4** `useGameStore.ts` からミッション関連 state を全削除
  - `missionProgress`, `missionCleared`, `addMissionProgress`
  - `coreHp`, `coreMaxHp`, `corePosition`, `damageCore`, `setCorePosition`
  - `advanceTime`/`syncTime` 内のミッション判定ロジック
  - 代わりに `currentBiome: BiomeConfig | null` を追加
- [ ] **1.5** ミッション系 UI コンポーネントを削除
  - `MissionOverlay.tsx` 削除
  - `CoreHealthBar.tsx` 削除
  - `BossHealthBar.tsx` 削除
  - `App.tsx` から import と使用箇所を削除
  - `App.tsx` 内のコア配置・ボススポーン useEffect を削除

### Phase 2: バイオーム対応の地形生成

- [ ] **2.1** `utils/terrain/biomeConfig.ts` を作成
  - グローバルな「現在のバイオーム」を管理
  - `setCurrentBiome(config)` / `getCurrentBiome()` 関数
- [ ] **2.2** `utils/terrain/noise.ts` をバイオームシード対応に
  - `createBiomeNoise(seed)` で動的にノイズ関数を生成
  - バイオーム切替時にリセット
- [ ] **2.3** `utils/terrain/heightmap.ts` をバイオーム対応に
  - `baseHeight`, `heightVariation` を BiomeConfig から取得
  - heightCache をバイオーム切替時にクリア
- [ ] **2.4** `utils/terrain/chunkGenerator.ts` をバイオーム対応に
  - 地表ブロック: `BiomeConfig.surfaceBlock`
  - 地下ブロック: `BiomeConfig.subSurfaceBlock`
  - 構造物配置もバイオームに応じて変更
- [ ] **2.5** `utils/terrain/structures/trees.ts` をバイオーム対応に
  - バイオームに応じた木の種類 (オーク / ヤシ / 松 / サボテン)
  - 密度の調整

### Phase 3: 環境（空・光源・霧）のバイオーム対応

- [ ] **3.1** `components/Environment.tsx` をバイオーム対応に
  - `BiomeConfig` の色定義を参照
  - 昼夜サイクルの色計算にバイオーム色を反映
  - 霧の距離をバイオームで調整

### Phase 4: UI（StartScreen の2段選択）

- [ ] **4.1** `components/ui/StartScreen.tsx` を再設計
  - カテゴリタブ（建築 / 戦争）を追加
  - 選択カテゴリ内の4ステージを表示
  - 各ステージカードにバイオームアイコン＋名前＋プレイヤー数
  - 戦争ステージには「次回リセット: ○時間後」表示
- [ ] **4.2** `components/ui/StageResetButton.tsx` を新規作成
  - ポーズ画面 or HUD 端に配置
  - 確認ダイアログ付き
  - リセット実行ロジック

### Phase 5: リセット機能

- [ ] **5.1** `useWorldStore.ts` にリセット機能を追加
  - `resetWorld()`: チャンクとキャッシュをクリアして再生成
- [ ] **5.2** クライアントのリセットフロー
  - ワールドリセット → プレイヤー位置リセット → モブクリア
- [ ] **5.3** マルチプレイのリセット同期
  - `world:reset` イベント追加
  - サーバーから全プレイヤーにリセットを通知

### Phase 6: サーバー対応

- [ ] **6.1** `server/index.js` のステージID変更
  - `world-1`〜`world-5` → `build-forest`, `war-forest`, etc. に変更
  - `Stage` クラスにカテゴリ属性を追加
- [ ] **6.2** 戦争ステージの日次自動リセット
  - 毎日0時（JST）にチェック
  - 戦争カテゴリの worldChanges をクリア
  - 接続中プレイヤーへの `world:reset` 通知
- [ ] **6.3** `/api/stages` エンドポイントの更新
  - カテゴリ情報を返却に含める
  - 次回リセット時刻を含める（戦争ステージのみ）
- [ ] **6.4** ボスステージ固有ロジック (`world-5` 判定) を削除

### Phase 7: テクスチャ生成

- [ ] **7.1** 雪ブロック (`snow.png`) テクスチャ作成
  - ハルの画風に合わせたピクセルアート
- [ ] **7.2** 砂ブロック (`sand.png`) テクスチャ作成
  - 同上
- [ ] **7.3** 雪の草ブロック用 face textures (`snow_top.png`, `snow_side.png`)

### Phase 8: 統合テスト＆デプロイ

- [ ] **8.1** `npx tsc --noEmit` で型チェック通過
- [ ] **8.2** 各バイオームでの地形生成を目視確認
- [ ] **8.3** カテゴリ切替 → ステージ選択 → ゲーム開始の一連フロー確認
- [ ] **8.4** 手動リセット動作確認
- [ ] **8.5** マルチプレイでのステージ同期確認
- [ ] **8.6** NAS デプロイ（`/deploy`）

---

## 受け入れ条件

- [ ] 8ステージ（2カテゴリ × 4バイオーム）が選択・プレイ可能
- [ ] 各バイオームで地形・植生・空色が明確に異なる
- [ ] 建築ステージはワールド変更が永続する（自動リセットなし）
- [ ] 戦争ステージは1日1回自動リセットされる
- [ ] 両カテゴリともUIから手動リセット可能
- [ ] 旧ミッション系 UI（進捗バー、コアHP、ボスHP）が表示されない
- [ ] `npx tsc --noEmit` エラーなし
- [ ] `npm run build` 成功
- [ ] マルチプレイで同一ステージ内のプレイヤーが正しく同期

---

## リスク・保留事項

### 決定済み
1. **ゲームモード**: サバイバル/クリエイティブの選択UIは廃止。カテゴリ（建築=平和/戦争=敵あり）が代替する
   - 建築カテゴリ = クリエイティブ的（敵モブなし、平和に建築）
   - 戦争カテゴリ = サバイバル的（夜間に敵スポーン、戦闘あり）
   - `GameMode` 型と関連UIは削除し、カテゴリから自動導出
2. **テクスチャ**: AI で仮テクスチャを生成、後でハルの絵に差し替え
3. **構造物**: ヘリポート・滑走路・村は全バイオーム共通で配置
4. **リセット時刻**: 毎日0時 (JST)

### リスク
- **heightCache のクリア忘れ**: バイオーム切替時にキャッシュをクリアしないと前のバイオームの地形が混ざる
- **マルチプレイ同期**: リセット中に新規プレイヤーが参加した場合のレースコンディション
- **パフォーマンス**: 砂漠バイオームは植生が少ない分、描画は軽い。雪バイオームは霧が近い分、チャンク数が減って軽い。問題なし想定
