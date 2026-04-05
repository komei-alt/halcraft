// アップデート履歴データ
// 新しい機能やバグ修正を実装した際、このファイルの先頭にエントリを追加する。
// 細かすぎる変更（内部リファクタ、テスト追加等）は記録不要。
// ユーザーが見て嬉しい・意味のある変更のみ記載する。
//
// === 追記ルール ===
// 1. UPDATES 配列の先頭に新しいエントリを追加する（新しい順）
// 2. 同日の複数変更は items にまとめる
// 3. type: 'feature' | 'fix' | 'improve' を適切に選択
// 4. text はハル（7歳）にも伝わるようなシンプルな日本語で書く
// 5. 内部的な改善（リファクタ、lint修正等）は含めない

/** アップデートの種類 */
export type UpdateType = 'feature' | 'fix' | 'improve';

/** 個別のアップデート項目 */
export interface UpdateItem {
  /** 種類: feature=新機能, fix=バグ修正, improve=改善 */
  type: UpdateType;
  /** 説明テキスト（短く簡潔に） */
  text: string;
}

/** 日付ごとのアップデートグループ */
export interface UpdateGroup {
  /** 日付 (YYYY-MM-DD) */
  date: string;
  /** その日のアップデート一覧 */
  items: UpdateItem[];
}

/** アイコンマッピング */
export const UPDATE_ICONS: Record<UpdateType, string> = {
  feature: '✨',
  fix: '🔧',
  improve: '⚡',
};

/**
 * アップデート履歴（新しい順）
 *
 * 【追記の仕方】
 * 配列の先頭に新しいエントリを追加してください。
 * 既存の日付エントリの items に追記してもOK。
 */
export const UPDATES: UpdateGroup[] = [
  {
    date: '2026-04-05',
    items: [
      { type: 'feature', text: 'アイアンゴーレムを追加！ SPAWNERブロックでよびだせるよ' },
      { type: 'feature', text: 'ヘリコプターにコックピットビューを追加' },
      { type: 'feature', text: 'ヘリコプターにヘッドライトをつけた' },
      { type: 'feature', text: 'ボイスチャットにスピーカー/マイクアイコンを表示' },
      { type: 'feature', text: 'だれかが来たらプッシュ通知でおしらせ' },
      { type: 'fix', text: '画面がずっとブルブルするバグを修正' },
      { type: 'fix', text: 'ヘリコプターからおりるときのバグを修正' },
    ],
  },
  {
    date: '2026-04-04',
    items: [
      { type: 'feature', text: 'ヘリコプターのマルチプレイ同期' },
      { type: 'feature', text: 'ヘリをおりるとヘリポートにもどる' },
      { type: 'fix', text: 'カメラがずっと揺れるバグを修正' },
      { type: 'fix', text: 'ヘリに関するいろんなバグを修正' },
    ],
  },
  {
    date: '2026-03-26',
    items: [
      { type: 'feature', text: 'ヘリコプターを追加！ ヘリポートと村もできた' },
      { type: 'improve', text: 'ワールドの表示がもっと速くなった' },
      { type: 'fix', text: 'いろんな表示バグを修正' },
    ],
  },
  {
    date: '2026-03-25',
    items: [
      { type: 'feature', text: 'のりもの（飛行・着陸）システムを追加' },
      { type: 'improve', text: '3Dモデルが軽くなった' },
      { type: 'fix', text: 'キャラが地面でブルブルするバグを修正' },
    ],
  },
  {
    date: '2026-03-24',
    items: [
      { type: 'feature', text: 'ニワトリとクモを追加！ スポーン地点に家もできた' },
      { type: 'feature', text: '木が自動で生える！ ワールドが広くなった' },
      { type: 'feature', text: '戦闘システムを大幅パワーアップ' },
      { type: 'improve', text: 'ゲーム全体がサクサク動くように' },
    ],
  },
  {
    date: '2026-03-23',
    items: [
      { type: 'feature', text: 'プレイヤー同士でバトルできるように！' },
      { type: 'feature', text: 'やられた時のアニメーションを追加' },
      { type: 'feature', text: 'マルチプレイ大幅強化（時間・モブ同期）' },
      { type: 'feature', text: '名前が画面に大きく表示されるように' },
      { type: 'feature', text: '効果音5種類を追加' },
    ],
  },
];
