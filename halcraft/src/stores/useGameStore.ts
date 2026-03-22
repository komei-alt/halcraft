// ゲーム全体の状態管理ストア
// ゲームフェーズ（メニュー・プレイ中・ポーズ）と昼夜サイクルを管理

import { create } from 'zustand';

type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

/** 昼夜サイクルの定数 */
// リアル10分 = ゲーム内1日 (600秒 = 1日サイクル)
const DAY_DURATION_SECONDS = 600;

interface GameState {
  /** 現在のゲームフェーズ */
  phase: GamePhase;

  /** ゲーム内時間 (0.0 ~ 1.0)
   *  0.0 = 朝6時, 0.25 = 正午, 0.5 = 夕方6時, 0.75 = 深夜 */
  gameTime: number;

  /** ゲーム内の日数カウンタ */
  dayCount: number;

  /** 昼か夜か */
  isNight: boolean;

  /** ゲーム開始 */
  startGame: () => void;

  /** ポーズトグル */
  togglePause: () => void;

  /** ゲームオーバー */
  gameOver: () => void;

  /** メニューに戻る */
  returnToMenu: () => void;

  /** 時間を進める (deltaSeconds: 実時間の経過秒数) */
  advanceTime: (deltaSeconds: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  gameTime: 0.0, // 朝スタート
  dayCount: 1,
  isNight: false,

  startGame: () => set({ phase: 'playing', gameTime: 0.0, dayCount: 1 }),

  togglePause: () => {
    const current = get().phase;
    if (current === 'playing') set({ phase: 'paused' });
    else if (current === 'paused') set({ phase: 'playing' });
  },

  gameOver: () => set({ phase: 'gameover' }),
  returnToMenu: () => set({ phase: 'menu' }),

  advanceTime: (deltaSeconds) => {
    if (get().phase !== 'playing') return;

    const timeIncrement = deltaSeconds / DAY_DURATION_SECONDS;
    let newTime = get().gameTime + timeIncrement;
    let newDayCount = get().dayCount;

    if (newTime >= 1.0) {
      newTime -= 1.0;
      newDayCount++;
    }

    // 夜判定: 0.5 ~ 1.0 が夜（夕方6時～朝6時）
    const isNight = newTime >= 0.5;

    set({
      gameTime: newTime,
      dayCount: newDayCount,
      isNight,
    });
  },
}));
