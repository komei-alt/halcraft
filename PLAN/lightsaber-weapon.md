# ライトセイバー武器システム

## 概要
- **目的**: スターウォーズ風のライトセイバーを新しい近接武器として実装。コンボ攻撃・効果音・動的光源を備えた、視覚的にインパクトのある武器
- **非目標**: マルチプレイヤー同期（後続タスク）、モバイル専用UI（既存の武器切替ボタンで対応）

## 影響範囲

### 新規ファイル
| ファイル | 役割 |
|---------|------|
| `src/components/Lightsaber.tsx` | ライトセイバー本体コンポーネント（3D描画、コンボアニメーション、光源） |
| `src/utils/lightsaberSounds.ts` | ライトセイバー専用サウンド（起動音、スイング音、ヒット音） |

### 変更ファイル
| ファイル | 変更内容 |
|---------|---------|
| `src/stores/usePlayerStore.ts` | `EquippedItem` 型に `'lightsaber'` を追加、`cycleEquippedItem` にルート追加 |
| `src/components/BlockInteraction.tsx` | `equippedItem === 'lightsaber'` 時の近接攻撃処理（ライトセイバー側で独自処理） |
| `src/components/ui/WeaponSwitchPopover.tsx` | ライトセイバー用のポップオーバーコンテンツ追加 |
| `src/App.tsx` | `<Lightsaber />` コンポーネントの追加 |

## 設計詳細

### 1. ライトセイバーの3D描画

#### 形状
- **柄（ヒルト）**: 円柱ジオメトリ。メタリックなグレー/シルバー
  - `CylinderGeometry(0.04, 0.035, 0.4, 8)` — 若干テーパー
  - グリップのリング: 小さなトーラスを2-3個配置
- **刃（ブレード）**: 内側の芯（白に近い色 + MeshBasicMaterial）と外側のグロー（半透明 + AdditiveBlending）の2層構造
  - 内芯: `CylinderGeometry(0.025, 0.02, 1.2, 8)` — `MeshBasicMaterial` で白〜薄い色
  - 外グロー: `CylinderGeometry(0.06, 0.05, 1.2, 8)` — `MeshBasicMaterial` + `transparent` + `AdditiveBlending` + opacity 0.4
  - 先端: 半球で丸めて見せる（`SphereGeometry` の半分）

#### 色のランダム設定
- ゲーム開始時（または武器切替時）にランダムで色を決定
- カラーパレット: `['#4488ff', '#44ff44', '#ff4444', '#aa44ff', '#ff8800', '#ffff44']`（青、緑、赤、紫、オレンジ、黄）
- 内芯は選択色を明るく（白に寄せる）、外グローは選択色そのまま

### 2. コンボ攻撃システム

#### コンボパターン（5段）
クリックするたびに次のコンボステップに進む。一定時間（0.8秒）操作がないとコンボリセット。

| ステップ | 名前 | 回転軸 | 角度範囲 | 持続時間 | ダメージ倍率 |
|---------|------|--------|---------|---------|------------|
| 1 | 右横斬り | Y軸中心、右→左 | -30° → +60° | 0.25s | 1.0x |
| 2 | 左横斬り | Y軸中心、左→右 | +60° → -30° | 0.22s | 1.1x |
| 3 | 右上斬り上げ | Z軸（対角線）、右下→左上 | +30° → -60° | 0.24s | 1.2x |
| 4 | 突き | Z軸方向、前方に突き出す | 0 → -0.6m 前進 | 0.2s | 1.3x |
| 5 | 大振り回転斬り | Y軸、全方向 | 0° → 360° | 0.35s | 1.8x |

#### アニメーション実装
- `useFrame` でフレームごとに補間（easeOutQuad / easeInOutCubic）
- 各コンボステップは `{ startRotation, endRotation, startPosition, endPosition, duration, easing }` の定義
- コンボ間の「繋ぎ」: 次のステップの開始姿勢が前のステップの終了姿勢からスムーズに遷移（lerpで0.08秒）

#### クリック入力
- `mousedown`（button=0）で攻撃トリガー
- `equippedItem === 'lightsaber'` の時のみ有効
- ライトセイバーの攻撃判定は `BlockInteraction.tryMeleeAttack()` と同じ仕組み（レイマーチ+AABB）を使い、ダメージ値を変える

### 3. 効果音（Web Audio API プロシージャル合成）

既存の `sounds.ts` のパターンに合わせ、新規ファイル `lightsaberSounds.ts` に実装。

#### 3.1 起動音（ `playLightsaberIgnite()` ）
- 低音のハム（サイン波 80Hz → 200Hz、0.4秒）
- 高音のシャープな立ち上がり（ノコギリ波 400Hz → 800Hz、0.15秒、フィルター付き）
- ノイズの微小バースト

#### 3.2 スイング音（ `playLightsaberSwing(comboStep)` ）
- コンボステップごとに音程を変化
  - Step 1: 低めのウォーン（200Hz → 350Hz）
  - Step 2: やや高いウォーン（250Hz → 400Hz）
  - Step 3: 上昇スイープ（300Hz → 600Hz）
  - Step 4: 短い突き音（500Hz → 250Hz、短時間）
  - Step 5: 長い回転音（200Hz → 500Hz → 200Hz、波状）
- 共通: ノコギリ波 + ローパスフィルター + 三角波のレイヤー（ハム感）

#### 3.3 ヒット音（ `playLightsaberHit()` ）
- ザッという衝撃（ノイズバースト + 低音パンチ）
- 高音のスパーク音（サイン波 1000Hz → 2000Hz、短い）

#### 3.4 アイドルハム（ `playLightsaberHum()` ）
- 低い持続的なハム音（サイン波 120Hz + 微妙なビブラート）
- 1秒程度のループ、 equip中は定期的に再生

### 4. 光源計算

#### PointLight の配置
- ライトセイバーの刃の中央付近に `PointLight` を1つ配置
- 色: ライトセイバーの選択色
- 強度: `intensity: 3`（アイドル時）→ `intensity: 5`（スイング中）
- 到達距離: `distance: 8`（アイドル時）→ `distance: 12`（スイング中）
- `decay: 2` で自然な減衰

#### 動的ライティング
- スイング中は強度を一時的にブースト（0.15秒のフラッシュ）
- ヒット時はさらに強く光らせる（`intensity: 8`、0.1秒）
- アイドル時はゆるやかなフリッカー（`Math.sin(time * 3) * 0.3` 程度）

### 5. 構成位置（FPSビュー）

既存武器の配置パターンを踏襲：
- **アイドル時**: カメラの右下に斜めに構える
  - offset: `Vector3(0.4, -0.5, -0.6)`
  - rotation: 刃が画面右上を向く（約45°傾斜）
- **スイング中**: コンボ定義に従ってアニメーション
- 右手のボクセル腕を描画（既存の `FIRST_PERSON_SKIN_COLOR` / `FIRST_PERSON_SLEEVE_COLOR` を再利用）

## 実装タスク

- [x] **Step 1**: `usePlayerStore` に `'lightsaber'` を `EquippedItem` 型に追加。`cycleEquippedItem` の遷移ルートに組み込み
- [x] **Step 2**: `lightsaberSounds.ts` を作成。4種のサウンド関数を実装
- [x] **Step 3**: `Lightsaber.tsx` を作成
  - 3.1: 刃とヒルトの3D形状描画
  - 3.2: カメラ追従（FPSビュー配置）
  - 3.3: ランダム色の選択と適用
  - 3.4: PointLight の配置と動的強度制御
  - 3.5: コンボアニメーションシステム（5段）
  - 3.6: マウスクリック入力 → コンボトリガー
  - 3.7: ヒット判定（既存の `findTargetMobData` / `findTargetPlayer` パターンを利用）
  - 3.8: サウンド再生のトリガー
- [x] **Step 4**: `BlockInteraction.tsx` — ライトセイバー装備時は既存の `equippedItem !== 'builder'` ガードで近接攻撃が自動スキップされるため、変更不要
- [x] **Step 5**: `WeaponSwitchPopover.tsx` にライトセイバー用コンテンツ追加
- [x] **Step 6**: `App.tsx` に `<Lightsaber />` を追加
- [x] **Step 7**: `updateLog.ts` にリリースノート追記、`package.json` のバージョン更新

## 受け入れ条件

- [ ] V キーで builder → rocket → machine_gun → lightsaber → builder の順に切り替わる
- [ ] ライトセイバー装備時、右下に光る刃が表示される
- [ ] 左クリックで5段コンボが順番に繰り出される
- [ ] コンボの各ステップで異なるスイング効果音が鳴る
- [ ] 起動時にイグニッション音が鳴る
- [ ] 刃の色がランダムに決まる（青/緑/赤/紫/オレンジ/黄のいずれか）
- [ ] ライトセイバーの光が周囲を照らす（PointLight が機能）
- [ ] スイング中に光の強度が増す
- [ ] モブ・プレイヤーへのダメージが正しく適用される
- [ ] `tsc --noEmit` がパスする

## リスク・保留事項

- **マルチプレイヤー同期**: リモートプレイヤーのライトセイバー表示は今回のスコープ外。`RemotePlayerWeapon.tsx` の拡張で対応予定
- **モバイル操作**: 既存のタップ攻撃がライトセイバーのコンボとして動作するかの検証が必要
- **PointLight 上限**: `BlockLights.tsx` が MAX_LIGHTS=12 でプーリングしている。ライトセイバーの PointLight は別枠（weapon group 内に配置）なので干渉しないが、GPU 負荷に注意
