// ============================================
// スキン定義 — プレイヤーアバターの着せ替え用
// ハルのイラストを元にしたカラーパレット
// ============================================

/** スキンID */
export type SkinId = 'steve' | 'warden' | 'red_warden' | 'ironman' | 'hero' | 'creeper';

/** 各パーツのカラー定義 */
export interface SkinColors {
  /** 頭（肌 or ヘルメット） */
  head: string;
  /** 体 */
  body: string;
  /** 腕 */
  arms: string;
  /** 足 */
  legs: string;
  /** 靴（足の下部） */
  shoes: string;
}

/** スキン1つの定義 */
export interface SkinDef {
  /** 表示名 */
  name: string;
  /** 絵文字アイコン */
  icon: string;
  /** 説明文 */
  description: string;
  /** 各パーツの色 */
  colors: SkinColors;
  /** 頭に追加パーツ（ツノなど）があるか */
  hasHeadAccessory?: boolean;
  /** ヘッドアクセサリーの色 */
  accessoryColor?: string;
}

/** 全スキン定義 */
export const SKIN_DEFS: Record<SkinId, SkinDef> = {
  // デフォルト — マイクラのスティーブ風
  steve: {
    name: 'スティーブ',
    icon: '🧑',
    description: 'マイクラ風のデフォルトキャラ',
    colors: {
      head: '#ffcc99',
      body: '#4a9cdb',
      arms: '#4a9cdb',
      legs: '#3b3b8a',
      shoes: '#555555',
    },
  },

  // ハルが描いたウォーデン装備のキャラ
  warden: {
    name: 'ウォーデン装備',
    icon: '🔴',
    description: 'ハルが描いたウォーデン装備',
    colors: {
      head: '#ffcc99',
      body: '#cc3333',
      arms: '#aa2222',
      legs: '#882222',
      shoes: '#555555',
    },
  },

  // 赤いウォーデン（ツノ付き）
  red_warden: {
    name: '赤ウォーデン',
    icon: '🟠',
    description: 'ツノ付き赤ウォーデン',
    colors: {
      head: '#cc4400',
      body: '#cc3300',
      arms: '#bb2200',
      legs: '#222222',
      shoes: '#111111',
    },
    hasHeadAccessory: true,
    accessoryColor: '#881100',
  },

  // ハルが描いたアイアンマンスーツ
  ironman: {
    name: 'アイアンマン',
    icon: '🤖',
    description: 'ハルが描いたアイアンマンスーツ',
    colors: {
      head: '#cc2222',
      body: '#cc2222',
      arms: '#daa520',
      legs: '#daa520',
      shoes: '#cc2222',
    },
  },

  // 味方の勇者
  hero: {
    name: '勇者',
    icon: '⚔️',
    description: '騎士のような勇者キャラ',
    colors: {
      head: '#d4a574',
      body: '#888888',
      arms: '#777777',
      legs: '#666655',
      shoes: '#443322',
    },
  },

  // クリーパースキン（おもしろ枠）
  creeper: {
    name: 'クリーパー',
    icon: '💚',
    description: 'クリーパーに変身！',
    colors: {
      head: '#44aa44',
      body: '#339933',
      arms: '#339933',
      legs: '#228822',
      shoes: '#228822',
    },
  },
};

/** デフォルトスキン */
export const DEFAULT_SKIN_ID: SkinId = 'steve';

/** 全スキンIDの配列（UI表示順） */
export const ALL_SKIN_IDS: SkinId[] = ['steve', 'warden', 'red_warden', 'ironman', 'hero', 'creeper'];

/** スキンIDが有効か判定 */
export function isValidSkinId(id: string): id is SkinId {
  return id in SKIN_DEFS;
}
