// プレイヤー状態の管理ストア
// HP、選択中のブロック（ホットバー）、ダメージ状態を管理

import { create } from 'zustand';
import { HOTBAR_BLOCKS, type BlockId } from '../types/blocks';
import { getSocket } from '../utils/socket';

/** 落下ダメージの閾値（これ以上落ちるとダメージ） */
const FALL_DAMAGE_THRESHOLD = 3;
/** 落下1ブロックあたりのダメージ量 */
const FALL_DAMAGE_PER_BLOCK = 1;

interface PlayerState {
  /** 体力 */
  hp: number;
  maxHp: number;

  /** ホットバーの選択インデックス (0-8) */
  selectedSlot: number;

  /** ダメージフラッシュ中か */
  isDamageFlash: boolean;

  /** 死亡状態か */
  isDead: boolean;

  /** 無敵終了時刻（Date.now()より小さいと無敵切れ） */
  invincibleUntil: number;

  /** モバイル用: ブロック設置モードか（false=破壊モード） */
  isPlaceMode: boolean;

  /** 選択中のブロックIDを取得 */
  getSelectedBlock: () => BlockId;

  /** スロット選択（0-8） */
  selectSlot: (slot: number) => void;

  /** ダメージを受ける */
  takeDamage: (amount: number) => void;

  /** 落下ダメージを計算して適用 */
  applyFallDamage: (fallDistance: number) => void;

  /** 回復 */
  heal: (amount: number) => void;

  /** リスポーン */
  respawn: () => void;

  /** 設置/破壊モードを切り替え */
  togglePlaceMode: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  hp: 20,
  maxHp: 20,
  selectedSlot: 0,
  isDamageFlash: false,
  isDead: false,
  invincibleUntil: 0,
  isPlaceMode: false,

  getSelectedBlock: () => {
    return HOTBAR_BLOCKS[get().selectedSlot] ?? HOTBAR_BLOCKS[0];
  },

  selectSlot: (slot) => {
    if (slot >= 0 && slot < HOTBAR_BLOCKS.length) {
      set({ selectedSlot: slot });
    }
  },

  takeDamage: (amount) => {
    // 死亡中はダメージを受けない
    if (get().isDead) return;
    // 無敵時間中はダメージを受けない
    if (Date.now() < get().invincibleUntil) return;
    const newHp = Math.max(0, get().hp - amount);
    set({
      hp: newHp,
      isDamageFlash: true,
      isDead: newHp <= 0,
    });
    // 死亡時にサーバーへ通知
    if (newHp <= 0) {
      const socket = getSocket();
      socket?.emit('player:died');
    }
    // フラッシュを一定時間後にリセット
    setTimeout(() => set({ isDamageFlash: false }), 300);
  },

  applyFallDamage: (fallDistance) => {
    if (fallDistance > FALL_DAMAGE_THRESHOLD) {
      const damage = Math.floor((fallDistance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_BLOCK);
      if (damage > 0) {
        get().takeDamage(damage);
      }
    }
  },

  heal: (amount) => {
    set((state) => ({
      hp: Math.min(state.maxHp, state.hp + amount),
    }));
  },

  respawn: () => {
    set({
      hp: 20,
      isDead: false,
      isDamageFlash: false,
      invincibleUntil: Date.now() + 5000,
    });
    // サーバーへ復活通知
    const socket = getSocket();
    socket?.emit('player:respawned');
  },

  togglePlaceMode: () => {
    set((state) => ({ isPlaceMode: !state.isPlaceMode }));
  },
}));

