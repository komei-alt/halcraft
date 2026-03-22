# モバイル対応プラン

```
Status: 実行中
Version: 1.0
Created: 2026-03-22
```

---

## 概要

スマホのSafariでハルクラを操作可能にする。
今後の全実装もモバイル対応を前提に進める。

## 現状の課題

| 機能 | デスクトップ | モバイル（現状） |
|---|---|---|
| 視点操作 | PointerLock + mousemove | ❌ PointerLockなし |
| 移動 | WASD キーボード | ❌ キーボードなし |
| ジャンプ | Space | ❌ |
| ブロック破壊 | 左クリック（PointerLock中） | ❌ |
| ブロック設置 | 右クリック（PointerLock中） | ❌ |
| ブロック選択 | 1-9キー / ホイール | ❌（タップ可能にすべき） |
| クラフト画面 | Eキー | ❌ |
| ゲーム開始 | クリック→PointerLock | ❌ タップでは開始するが操作不可 |

## 設計方針

### 入力抽象化レイヤーを作らない（今のフェーズでは）

現段階のコードは小規模なので、抽象化レイヤーは過剰。
代わりに **デバイス検出 + タッチ用UIコンポーネント** を追加する。

### 実装内容

#### 1. デバイス検出ユーティリティ (`utils/device.ts`)
- `isTouchDevice()` でタッチ端末かどうか判定
- `isMobile()` でモバイルビューポートか判定

#### 2. バーチャルジョイスティック (`ui/mobile/Joystick.tsx`)
- 左側にタッチ移動用のバーチャルジョイスティック
- 入力値をグローバルに公開して `Player.tsx` から参照

#### 3. タッチ視点操作 (`Player.tsx` 修正)
- 右半分のスワイプで視点回転
- PointerLockをスキップ（モバイル時）

#### 4. タッチでブロック操作 (`BlockInteraction.tsx` 修正)
- 右半分タップ → ブロック破壊
- 右半分長押し → ブロック設置

#### 5. モバイルジャンプボタン (`ui/mobile/JumpButton.tsx`)
- 右下にジャンプボタン配置

#### 6. モバイルアクションボタン (`ui/mobile/ActionButtons.tsx`)
- クラフト画面開閉ボタン
- ブロック設置モード切替

#### 7. ホットバーのタップ対応 (`Hotbar.tsx` 修正)
- スロットをタップで選択可能に

#### 8. スタート画面のモバイル対応 (`StartScreen.tsx` 修正)
- 「タップでスタート」表示
- モバイル操作説明の表示

#### 9. CSS調整 (`index.css` 修正)
- Safe Area対応（ノッチ/ホームバー）
- タッチハイライト無効化
- ビューポート固定

#### 10. GameCanvas設定 (`App.tsx` 修正)
- モバイル時のレンダリング距離調整

## UIレイアウト（モバイル）

```
┌─────────────────────────────────────┐
│              TimeDisplay            │
│                                     │
│                   +                 │
│    HealthBar                        │
│                                     │
│  ┌────┐                     ┌────┐  │
│  │Joy │     (右半分=視点)    │Jump│  │
│  │stick│                    │    │  │
│  └────┘         [Hotbar]    └────┘  │
│                              🔧     │
└─────────────────────────────────────┘
```

## ファイル作成・変更リスト

| ファイル | 操作 |
|---------|------|
| `src/utils/device.ts` | 新規 |
| `src/utils/touchInput.ts` | 新規 |
| `src/components/ui/mobile/Joystick.tsx` | 新規 |
| `src/components/ui/mobile/JumpButton.tsx` | 新規 |
| `src/components/ui/mobile/ActionButtons.tsx` | 新規 |
| `src/components/ui/mobile/MobileControls.tsx` | 新規 |
| `src/components/Player.tsx` | 修正 |
| `src/components/BlockInteraction.tsx` | 修正 |
| `src/components/ui/StartScreen.tsx` | 修正 |
| `src/components/ui/Hotbar.tsx` | 修正 |
| `src/components/ui/CraftingScreen.tsx` | 修正 |
| `src/index.css` | 修正 |
| `src/App.tsx` | 修正 |
