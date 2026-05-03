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
    date: '2026-05-03',
    items: [
      { type: 'feature', text: 'ESCキーでポーズ画面が出るようになったよ！再開やタイトルに戻れるよ' },
      { type: 'feature', text: '建築と戦争の2カテゴリでステージが選べるようになったよ！' },
      { type: 'feature', text: '森・南国・雪原・砂漠の4つのバイオームで遊べるようになった！' },
      { type: 'improve', text: 'マップが2倍に広くなったよ！もっと遠くまで冒険できる！' },
      { type: 'improve', text: '各バイオームに合わせた木（オーク・ヤシ・松・サボテン）が生えるよ' },
      { type: 'improve', text: 'バイオームごとに空の色や霧の雰囲気が変わるようになった' },
    ],
  },
  {
    date: '2026-05-02',
    items: [
      { type: 'improve', text: '手に持つピッケル・ロケット・機関銃の見た目と構え方がかっこよくなったよ' },
      { type: 'feature', text: 'ほかの人が持っている武器（銃・ロケットランチャー・ピッケル）が見えるようになったよ！' },
      { type: 'fix', text: 'ほかの人が乗っている乗り物がカクカクしないで滑らかに動くようになったよ' },
      { type: 'fix', text: '巨大ボスの巣ステージでボスがちゃんと出てくるようになったよ！' },
    ],
  },
  {
    date: '2026-05-01',
    items: [
      { type: 'fix', text: '飛行機が右にも曲がれるようになって、マウスで上昇と降下を調整しやすくなったよ' },
      { type: 'fix', text: '乗り物の破壊とリスポーンがマルチプレイで同期されるようになったよ！爆発エフェクトもみんなに見えるよ' },
      { type: 'improve', text: '壊れた乗り物が3秒で復活するようになったよ' },
      { type: 'fix', text: '武器で乗り物を壊しても爆発しないバグを修正' },
      { type: 'fix', text: '爆発の衝撃波リングと火球が表示されないバグを修正' },
      { type: 'feature', text: '飛行機から爆弾を投下できるようになった！右クリックかBキーで大爆発！' },
      { type: 'feature', text: '乗り物を攻撃して壊せるようになった！戦車、ヘリ、飛行機、車にダメージを与えると大爆発するよ' },
      { type: 'feature', text: '乗り物が壊れると超派手な爆発！乗っている人は死亡、近くの人もダメージを受けるよ' },
      { type: 'feature', text: '乗り物同士がぶつかるとお互いにダメージ！体当たりでも壊せるよ' },
      { type: 'improve', text: '乗り物の上にHPバーが出るようになったよ' },
      { type: 'fix', text: '車1の向きと座り方を直して、ちゃんと中に乗れるようにしたよ' },
      { type: 'feature', text: '機関銃で右クリックしてスコープをのぞけるようになったよ' },
      { type: 'feature', text: '新しい車1に4人で乗れるようになったよ' },
      { type: 'feature', text: '手に持てる機関銃を追加したよ' },
      { type: 'improve', text: 'ニワトリが新しい3Dモデルで出るようになったよ' },
    ],
  },
  {
    date: '2026-04-30',
    items: [
      { type: 'improve', text: 'エラーが起きた時に自動で気づいて直しやすくなったよ' },
      { type: 'feature', text: '岩盤ブロックがクラフト画面で作れるようになったよ' },
    ],
  },
  {
    date: '2026-04-29',
    items: [
      { type: 'feature', text: '新しい3Dモデルのゾンビ、アイアンゴーレム、ダーウィンが出るようになった！' },
      { type: 'feature', text: '戦車に乗ってガトリングと主砲ロケットをうてるようにした' },
      { type: 'feature', text: '滑走路と飛行機を追加して、走って離陸できるようにした' },
      { type: 'feature', text: 'ウォーデン装備が新しい3Dモデルで表示されるようになった' },
      { type: 'feature', text: 'サバイバルとクリエイティブをえらんでスタートできるようにした！' },
      { type: 'feature', text: 'クリエイティブではジャンプ2回で空を飛んで建築できるよ' },
      { type: 'improve', text: 'スマホでもジャンプ2回で飛行、▲と▼で上下に動けるようにした' },
    ],
  },
  {
    date: '2026-04-24',
    items: [
      { type: 'improve', text: 'ロケットのばくはつが、火花・けむり・破片でもっとはくりょくアップ！' },
      { type: 'fix', text: 'ほかの人にもロケットの弾とばくはつが見えるようにした' },
      { type: 'fix', text: 'ロケットのばくはつで、近くのブロックがこわれるようにした' },
      { type: 'fix', text: 'ロケットと固定タレットの弾が、ねらったところへ飛ぶように修正した' },
      { type: 'improve', text: 'ロケットが敵に当たった時の見た目をわかりやすくした' },
      { type: 'fix', text: 'こうげきのクールダウンがちゃんと効くように修正！' },
      { type: 'fix', text: 'かべの向こうの敵にこうげきが当たらないようにした' },
      { type: 'improve', text: 'こうげきが当たった時の火花とダメージ表示をかっこよくした！' },
      { type: 'improve', text: 'ゾンビやクモがそれぞれ自然にこうげきするようにした' },
    ],
  },
  {
    date: '2026-04-21',
    items: [
      { type: 'fix', text: 'ゲームをはじめたら、すぐロケットをうてるように修正！' },
      { type: 'feature', text: '⛏️と🚀をきりかえてあそべるようにした！' },
      { type: 'improve', text: '武器をもちかえると、つかいかたがポップで出るようにした！' },
    ],
  },
  {
    date: '2026-04-20',
    items: [
      { type: 'feature', text: 'かたにのせるロケットランチャーを追加！' },
      { type: 'feature', text: '大きなばくはつで、まわりのみんなにもダメージ！' },
      { type: 'improve', text: 'ロケットのえん・ひかり・ばくはつがもっとかっこよくなった' },
      { type: 'improve', text: 'スマホでも🚀ボタンでロケットをうてるようにした' },
    ],
  },
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
