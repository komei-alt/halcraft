// ゲーム全体の状態管理ストア
// ゲームフェーズ（メニュー・プレイ中・ポーズ）などを管理

import { create } from 'zustand';

type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

interface GameState {
  /** 現在のゲームフェーズ */
  phase: GamePhase;

  /** ゲーム開始 */
  startGame: () => void;

  /** ポーズトグル */
  togglePause: () => void;

  /** ゲームオーバー */
  gameOver: () => void;

  /** メニューに戻る */
  returnToMenu: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',

  startGame: () => set({ phase: 'playing' }),

  togglePause: () => {
    const current = get().phase;
    if (current === 'playing') set({ phase: 'paused' });
    else if (current === 'paused') set({ phase: 'playing' });
  },

  gameOver: () => set({ phase: 'gameover' }),
  returnToMenu: () => set({ phase: 'menu' }),
}));
