// プレイヤー状態の管理ストア
// HP、選択中のブロック（ホットバー）、ダメージ状態、攻撃クールダウンを管理

import { create } from 'zustand';
import { HOTBAR_BLOCKS, type BlockId } from '../types/blocks';
import { getSocket } from '../utils/socket';
import { useGameStore } from './useGameStore';
import { type SkinId, DEFAULT_SKIN_ID, isValidSkinId } from '../types/skins';

/** localStorage のキー（スキン保存用） */
const SKIN_STORAGE_KEY = 'halcraft-skin-id';

/** 保存されたスキンIDを読み込む */
function loadSkinId(): SkinId {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    if (saved && isValidSkinId(saved)) return saved;
  } catch { /* noop */ }
  return DEFAULT_SKIN_ID;
}

/** ホットバーのスロット数 */
const HOTBAR_SLOT_COUNT = HOTBAR_BLOCKS.length;

/** 徒歩時に装備できるアイテム */
export type EquippedItem = 'builder' | 'rocket_launcher' | 'machine_gun';

/** 落下ダメージの閾値（これ以上落ちるとダメージ） */
const FALL_DAMAGE_THRESHOLD = 3;
/** 落下1ブロックあたりのダメージ量 */
const FALL_DAMAGE_PER_BLOCK = 1;

/** 攻撃クールダウン時間（秒） */
const ATTACK_COOLDOWN = 0.4;
/** ロケットランチャーのクールダウン時間（秒） */
const ROCKET_COOLDOWN = 2.8;
/** HP自然回復の待機時間（最後にダメージを受けてから、秒） */
const REGEN_DELAY = 30;
/** HP自然回復量（毎秒） */
const REGEN_RATE = 0.5;
/** カメラシェイク減衰速度 */
const SHAKE_DECAY = 8;
/** プレイヤーノックバック速度 */
const KNOCKBACK_SPEED = 6;
/** 被ダメージ無敵時間（ミリ秒） */
const DAMAGE_INVINCIBLE_MS = 500;

interface PlayerState {
  /** 選択中のスキンID */
  skinId: SkinId;

  /** 体力 */
  hp: number;
  maxHp: number;

  /** ホットバーの選択インデックス (0-8) */
  selectedSlot: number;

  /** 動的ホットバースロット（ブロックIDの配列） */
  hotbarSlots: BlockId[];

  /** 現在装備中の徒歩用アイテム */
  equippedItem: EquippedItem;

  /** ダメージフラッシュ中か */
  isDamageFlash: boolean;

  /** 死亡状態か */
  isDead: boolean;

  /** 無敵終了時刻（Date.now()より小さいと無敵切れ） */
  invincibleUntil: number;

  /** モバイル用: ブロック設置モードか（false=破壊モード） */
  isPlaceMode: boolean;

  /** 攻撃クールダウン残り時間（秒、0=攻撃可能） */
  attackCooldown: number;

  /** 攻撃チャージ率（0-1、1=フルチャージ） */
  attackCharge: number;

  /** ロケットランチャーのクールダウン残り時間（秒） */
  rocketCooldown: number;

  /** ロケットランチャーのリチャージ率（0-1、1=発射可能） */
  rocketCharge: number;

  /** カメラシェイク強度（0-1） */
  cameraShake: number;

  /** 最後にダメージを受けた時刻（自然回復用） */
  lastDamageTime: number;

  /** ノックバック速度 XZ */
  knockbackVx: number;
  knockbackVz: number;

  /** ダメージを受けた方向（ラジアン、画面上の角度） */
  damageDirection: number | null;

  /** 選択中のブロックIDを取得 */
  getSelectedBlock: () => BlockId;

  /** ホットバーの指定スロットにブロックをセット */
  assignHotbarSlot: (slot: number, blockId: BlockId) => void;

  /** スロット選択（0-8） */
  selectSlot: (slot: number) => void;

  /** 徒歩装備を変更 */
  setEquippedItem: (item: EquippedItem) => void;

  /** 徒歩装備を順番に切り替え */
  cycleEquippedItem: () => void;

  /** 攻撃を実行しダメージ倍率を返す（0=クールダウン中で攻撃不可） */
  performAttack: (options?: { noShake?: boolean }) => number;

  /** 攻撃クールダウンを毎フレーム更新 */
  updateAttackCooldown: (dt: number) => void;

  /** ロケットランチャーを発射し、成功時 true を返す */
  fireRocket: () => boolean;

  /** ダメージを受ける（knockbackDir: ダメージ源からプレイヤーへの方向XZ）。実際に通った場合 true */
  takeDamage: (amount: number, knockbackDirX?: number, knockbackDirZ?: number) => boolean;

  /** 落下ダメージを計算して適用 */
  applyFallDamage: (fallDistance: number) => void;

  /** 回復 */
  heal: (amount: number) => void;

  /** リスポーン */
  respawn: () => void;

  /** 設置/破壊モードを切り替え */
  togglePlaceMode: () => void;

  /** HP自然回復の更新（毎フレーム呼び出す） */
  updateRegen: (dt: number) => void;

  /** ノックバック速度を消費してリセット */
  consumeKnockback: () => { vx: number; vz: number };

  /** スキンを変更 */
  setSkin: (skinId: SkinId) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  skinId: loadSkinId(),
  hp: 20,
  maxHp: 20,
  selectedSlot: 0,
  hotbarSlots: [...HOTBAR_BLOCKS] as BlockId[],
  equippedItem: 'builder',
  isDamageFlash: false,
  isDead: false,
  invincibleUntil: 0,
  isPlaceMode: false,
  attackCooldown: 0,
  attackCharge: 1,
  rocketCooldown: 0,
  rocketCharge: 1,
  cameraShake: 0,
  lastDamageTime: 0,
  knockbackVx: 0,
  knockbackVz: 0,
  damageDirection: null,

  getSelectedBlock: () => {
    const state = get();
    return state.hotbarSlots[state.selectedSlot] ?? HOTBAR_BLOCKS[0];
  },

  selectSlot: (slot) => {
    if (slot >= 0 && slot < HOTBAR_SLOT_COUNT) {
      set({ selectedSlot: slot });
    }
  },

  setEquippedItem: (item) => {
    set({ equippedItem: item });
  },

  cycleEquippedItem: () => {
    set((state) => {
      const next: Record<EquippedItem, EquippedItem> = {
        builder: 'rocket_launcher',
        rocket_launcher: 'machine_gun',
        machine_gun: 'builder',
      };
      return { equippedItem: next[state.equippedItem] };
    });
  },

  assignHotbarSlot: (slot, blockId) => {
    if (slot < 0 || slot >= HOTBAR_SLOT_COUNT) return;
    set((state) => {
      const newSlots = [...state.hotbarSlots];
      newSlots[slot] = blockId;
      return { hotbarSlots: newSlots };
    });
  },

  performAttack: (options) => {
    const state = get();
    if (state.isDead || state.attackCooldown > 0) return 0;

    // チャージ率をダメージ倍率として返す（最低0.2倍）
    const charge = state.attackCharge;
    const multiplier = 0.2 + charge * 0.8;

    // クールダウン開始（モブ/プレイヤー攻撃時はシェイク不要）
    set({
      attackCooldown: ATTACK_COOLDOWN,
      attackCharge: 0,
      ...(options?.noShake ? {} : { cameraShake: Math.max(state.cameraShake, 0.3 + charge * 0.4) }),
    });

    return multiplier;
  },

  updateAttackCooldown: (dt) => {
    const state = get();
    const newCooldown = Math.max(0, state.attackCooldown - dt);
    const newCharge = newCooldown <= 0 ? 1 : Math.min(1, 1 - newCooldown / ATTACK_COOLDOWN);
    const newRocketCooldown = Math.max(0, state.rocketCooldown - dt);
    const newRocketCharge = newRocketCooldown <= 0 ? 1 : Math.min(1, 1 - newRocketCooldown / ROCKET_COOLDOWN);
    const newShake = Math.max(0, state.cameraShake - SHAKE_DECAY * dt);
    // 変更がある場合のみ更新
    if (
      newCooldown !== state.attackCooldown ||
      newRocketCooldown !== state.rocketCooldown ||
      newShake !== state.cameraShake
    ) {
      set({
        attackCooldown: newCooldown,
        attackCharge: newCharge,
        rocketCooldown: newRocketCooldown,
        rocketCharge: newRocketCharge,
        cameraShake: newShake,
      });
    }
  },

  fireRocket: () => {
    const state = get();
    if (state.rocketCooldown > 0 || state.isDead) return false;

    set({
      rocketCooldown: ROCKET_COOLDOWN,
      rocketCharge: 0,
      cameraShake: Math.max(state.cameraShake, 0.45),
    });
    return true;
  },

  takeDamage: (amount, knockbackDirX, knockbackDirZ) => {
    // クリエイティブモードではダメージを受けない
    if (useGameStore.getState().gameMode === 'creative') return false;
    // 死亡中はダメージを受けない
    if (get().isDead) return false;
    // 無敵時間中はダメージを受けない
    if (Date.now() < get().invincibleUntil) return false;
    const newHp = Math.max(0, get().hp - amount);

    // ノックバック計算
    let kbVx = 0;
    let kbVz = 0;
    let dmgDir: number | null = null;
    if (knockbackDirX !== undefined && knockbackDirZ !== undefined) {
      const len = Math.sqrt(knockbackDirX * knockbackDirX + knockbackDirZ * knockbackDirZ);
      if (len > 0.01) {
        kbVx = (knockbackDirX / len) * KNOCKBACK_SPEED;
        kbVz = (knockbackDirZ / len) * KNOCKBACK_SPEED;
        // ダメージ方向（攻撃元の方向、ラジアン）
        dmgDir = Math.atan2(-knockbackDirX, -knockbackDirZ);
      }
    }

    set({
      hp: newHp,
      isDamageFlash: true,
      isDead: newHp <= 0,
      lastDamageTime: performance.now() / 1000,
      cameraShake: Math.min(1, 0.5 + amount * 0.1),
      knockbackVx: kbVx,
      knockbackVz: kbVz,
      damageDirection: dmgDir,
      invincibleUntil: Date.now() + DAMAGE_INVINCIBLE_MS,
    });
    // 死亡時にサーバーへ通知
    if (newHp <= 0) {
      const socket = getSocket();
      socket?.emit('player:died');
    }
    // フラッシュを一定時間後にリセット
    setTimeout(() => set({ isDamageFlash: false, damageDirection: null }), 400);
    return true;
  },

  applyFallDamage: (fallDistance) => {
    // クリエイティブモードでは落下ダメージなし
    if (useGameStore.getState().gameMode === 'creative') return;
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
    const isCreative = useGameStore.getState().gameMode === 'creative';
    set({
      hp: 20,
      isDead: false,
      isDamageFlash: false,
      damageDirection: null,
      knockbackVx: 0,
      knockbackVz: 0,
      cameraShake: 0,
      attackCooldown: 0,
      attackCharge: 1,
      equippedItem: 'builder',
      rocketCooldown: 0,
      rocketCharge: 1,
      invincibleUntil: isCreative ? Number.POSITIVE_INFINITY : Date.now() + 5000,
    });
    // サーバーへ復活通知
    const socket = getSocket();
    socket?.emit('player:respawned');
  },

  togglePlaceMode: () => {
    set((state) => ({ isPlaceMode: !state.isPlaceMode }));
  },

  updateRegen: (dt) => {
    const state = get();
    if (state.isDead) return;
    if (state.hp >= state.maxHp) return;
    const now = performance.now() / 1000;
    if (now - state.lastDamageTime < REGEN_DELAY) return;
    const newHp = Math.min(state.maxHp, state.hp + REGEN_RATE * dt);
    set({ hp: newHp });
  },

  consumeKnockback: () => {
    const state = get();
    const vx = state.knockbackVx;
    const vz = state.knockbackVz;
    if (vx !== 0 || vz !== 0) {
      set({ knockbackVx: 0, knockbackVz: 0 });
    }
    return { vx, vz };
  },

  setSkin: (skinId) => {
    set({ skinId });
    try { localStorage.setItem(SKIN_STORAGE_KEY, skinId); } catch { /* noop */ }
  },
}));
