export type DialogueCueId =
  | 'system.stage_start'
  | 'system.low_health'
  | 'system.victory'
  | 'prototype.greeting'
  | 'prototype.support'
  | 'golem.ready'
  | 'boss.challenge';

export interface DialogueCueDefinition {
  speaker: string;
  text: string;
  durationMs: number;
  cooldownMs: number;
  tone: 'guide' | 'ally' | 'warning' | 'victory';
  /** 重要度。大きい台詞は低い台詞へ割り込み、割り込まれた台詞はキューへ戻る。 */
  priority: 1 | 2 | 3 | 4;
  /** 同意済み家族収録の配信用ファイルを追加した時だけ指定する。 */
  audioPath?: string;
}

export const DIALOGUE_CATALOG: Record<DialogueCueId, DialogueCueDefinition> = {
  'system.stage_start': {
    speaker: '冒険ガイド',
    text: 'まわりの音をよく聞いて。今日の冒険が始まるよ！',
    durationMs: 4200,
    cooldownMs: 30000,
    tone: 'guide',
    priority: 2,
  },
  'system.low_health': {
    speaker: '冒険ガイド',
    text: '体力が少ないよ。いったん離れて、立て直そう！',
    durationMs: 3900,
    cooldownMs: 45000,
    tone: 'warning',
    priority: 3,
  },
  'system.victory': {
    speaker: '冒険ガイド',
    text: 'やったね！ この世界に、また新しい物語ができたよ。',
    durationMs: 4200,
    cooldownMs: 30000,
    tone: 'victory',
    priority: 4,
  },
  'prototype.greeting': {
    speaker: 'プロトタイプ',
    text: 'ぼくも行くよ。危ないときは、すぐそばにいるからね。',
    durationMs: 4200,
    cooldownMs: 120000,
    tone: 'ally',
    priority: 1,
  },
  'prototype.support': {
    speaker: 'プロトタイプ',
    text: 'あせらなくて大丈夫。いっしょに少しずつ進もう！',
    durationMs: 4000,
    cooldownMs: 90000,
    tone: 'ally',
    priority: 1,
  },
  'golem.ready': {
    speaker: 'アイアンゴーレム',
    text: '守りはまかせて。ここから先は、いっしょに戦うぞ！',
    durationMs: 4100,
    cooldownMs: 120000,
    tone: 'ally',
    priority: 1,
  },
  'boss.challenge': {
    speaker: '巨大ボス',
    text: 'よくここまで来たな。おまえの勇気、見せてもらおう！',
    durationMs: 4300,
    cooldownMs: 120000,
    tone: 'warning',
    priority: 4,
  },
};
