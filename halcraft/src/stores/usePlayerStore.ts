// プレイヤー状態の管理ストア
// HP、選択中のブロック（ホットバー）、ダメージ状態、攻撃クールダウンを管理

import { create } from 'zustand';
import { HOTBAR_BLOCKS, type BlockId } from '../types/blocks';
import {
  createHotbarSlotsWithWeapons,
  getFirstHotbarBlock,
  getHotbarItemBlockId,
  getHotbarItemEquippedItem,
  HOTBAR_SLOT_COUNT,
  isWeaponHotbarItem,
  type EquippedItem,
  type HotbarSlotItem,
} from '../types/hotbar';
import { getSocket } from '../utils/socket';
import { useGameStore } from './useGameStore';
import { type SkinId, DEFAULT_SKIN_ID, isValidSkinId } from '../types/skins';
import { type ToolId, TOOL_DEFS, HAND_TIER_LEVEL, HAND_MINING_SPEED, HAND_ATTACK_DAMAGE, isEffectiveTool } from '../types/tools';
import { type ArmorSlot, type ArmorId, ARMOR_DEFS, calculateTotalDefense, calculateDamageReduction } from '../types/armor';
import { getMasteryBonus } from '../types/masteryPerks';
import { getMasteryTechniqueBonus } from '../types/masteryTechniquePerks';
import type { StageWorldPosition } from '../types/stageLandmarks';
import { getStageCombatModifier, getStageCombatStyleForItem } from '../types/stageCombatStyles';
import { playItemSwitchSound, playRocketReadySound, playStageCombatCueSound, playToolBreakSound } from '../utils/sounds';
import { useMasteryStore } from './useMasteryStore';
import { getTerrainHeight } from '../utils/terrain/heightmap';
import { PLAYER_SPAWN } from '../utils/terrain/constants';

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

export type { EquippedItem, HotbarSlotItem, WeaponItem } from '../types/hotbar';

/** 落下ダメージの閾値（これ以上落ちるとダメージ） */
const FALL_DAMAGE_THRESHOLD = 3;
/** 落下1ブロックあたりのダメージ量 */
const FALL_DAMAGE_PER_BLOCK = 1;

/** 攻撃クールダウン時間（秒） — スイングより少し長くして余韻を出す */
const ATTACK_COOLDOWN = 0.45;
/** 近接スイング全体の長さ（秒） */
export const MELEE_SWING_DURATION = 0.38;
/** スイング開始からダメージ確定までの秒（ヒットフレーム） */
export const MELEE_HIT_AT = 0.14;
/** 三人称同期用の武器アクション種別 */
export type WeaponActionKind = 'melee' | 'saber' | 'gun' | 'rocket' | 'glove' | 'bomb';
/** 各武器アクションの三人称再生時間 */
export const WEAPON_ACTION_DURATION: Record<WeaponActionKind, number> = {
  melee: MELEE_SWING_DURATION,
  saber: 0.48,
  gun: 0.14,
  rocket: 0.52,
  glove: 0.42,
  bomb: 0.4,
};
/** ロケットランチャーのクールダウン時間（秒） */
const ROCKET_COOLDOWN = 2.8;
/** ロケット再装填完了を知らせるHUDパルス時間（ミリ秒） */
const ROCKET_READY_PULSE_MS = 820;
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

function getMasteryLevel(item: EquippedItem): number {
  return useMasteryStore.getState().items[item]?.level ?? 1;
}

function playEquippedItemSwitchFeedback(item: EquippedItem): void {
  playItemSwitchSound(item);
  if (getStageCombatStyleForItem(useGameStore.getState().currentStageId, item)) {
    playStageCombatCueSound();
  }
}

interface PlayerState {
  /** 選択中のスキンID */
  skinId: SkinId;

  /** 体力 */
  hp: number;
  maxHp: number;

  /** HUDやナビゲーションで使う現在位置 */
  worldPosition: StageWorldPosition | null;

  /** ホットバーの選択インデックス (0-8) */
  selectedSlot: number;

  /** 動的ホットバースロット（ブロックと武器の配列） */
  hotbarSlots: HotbarSlotItem[];

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

  /**
   * 近接スイング残り時間（秒）。
   * 0=非スイング。1人称振り・ヒットフレームと同期する。
   */
  meleeSwingTimer: number;
  /** ライトセーバースイング残り（三人称同期） */
  saberSwingTimer: number;
  /** 機関銃リコイル残り（三人称同期） */
  gunRecoilTimer: number;
  /** ロケットリコイル残り（三人称同期） */
  rocketRecoilTimer: number;
  /**
   * 未送信の武器アクションパルス（sendPosition が消費）。
   * マルチの三人称演出トリガー。
   */
  pendingWeaponAction: WeaponActionKind | null;

  /** ロケットランチャーのクールダウン残り時間（秒） */
  rocketCooldown: number;

  /** 今回のロケット再発射に使う総クールダウン時間（秒） */
  rocketCooldownDuration: number;

  /** ロケットランチャーのリチャージ率（0-1、1=発射可能） */
  rocketCharge: number;

  /** ロケット再装填完了の短いHUD表示期限 */
  rocketReadyPulseUntil: number;

  /** カメラシェイク強度（0-1） */
  cameraShake: number;

  /** 最後にダメージを受けた時刻（自然回復用） */
  lastDamageTime: number;

  /** ノックバック速度 XZ */
  knockbackVx: number;
  knockbackVz: number;

  /** ダメージを受けた方向（ラジアン、画面上の角度） */
  damageDirection: number | null;

  /** 水中に沈んでいるか（目線が水中） */
  isSubmerged: boolean;

  /** 水に触れているか（足または目が水中） */
  isInWater: boolean;

  /**
   * スポーン地点へ戻す要求カウンタ。
   * Player が監視し、リスポーン／再スタート時にカメラ位置をリセットする。
   */
  spawnToken: number;

  /** 息ゲージ（秒） */
  airSupply: number;

  /** 空腹ゲージ（0-20） */
  hunger: number;

  /** 空腹減少用の蓄積カウンタ */
  hungerExhaustion: number;

  /** 現在装備中のツールID（null=素手） */
  equippedToolId: ToolId | null;

  /** ツールインベントリ { toolId: 残り耐久値 } */
  tools: Record<string, number>;

  /** 装備中の防具 { slot: armorId } */
  equippedArmor: Partial<Record<ArmorSlot, ArmorId>>;

  /** 防具耐久値 { armorId: 残り耐久値 } */
  armorDurability: Record<string, number>;

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

  /**
   * 近接スイングだけ開始（空振り・採掘用）。
   * クールダウン中は false。ダメージ判定は呼び出し側で行う。
   */
  startMeleeSwing: (options?: { noShake?: boolean; lightShake?: boolean }) => boolean;

  /** 三人称同期用の武器アクションを発火 */
  triggerWeaponAction: (kind: WeaponActionKind) => void;

  /** 攻撃クールダウンを毎フレーム更新 */
  updateAttackCooldown: (dt: number) => void;

  /** ロケットランチャーを発射し、成功時 true を返す */
  fireRocket: () => boolean;

  /** 報酬やイベントでロケットを即応状態にする */
  grantRocketReady: (options?: { pulseMs?: number; sound?: boolean; shake?: number }) => void;

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

  /** ツールを装備 */
  equipTool: (toolId: ToolId | null) => void;

  /** ツールをインベントリに追加 */
  addTool: (toolId: ToolId) => void;

  /** 装備中ツールの耐久値を1減らす（0で破壊） */
  damageTool: () => void;

  /** 現在の採掘速度倍率を取得 */
  getMiningSpeed: (blockCategory?: string) => number;

  /** 現在の攻撃力を取得 */
  getAttackDamage: () => number;

  /** 現在のツールティアレベルを取得 */
  getToolTierLevel: () => number;

  /** 防具を装備 */
  equipArmor: (armorId: ArmorId) => void;

  /** 防具を外す */
  unequipArmor: (slot: ArmorSlot) => void;

  /** 防具の総防御力を取得 */
  getTotalDefense: () => number;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  skinId: loadSkinId(),
  hp: 20,
  maxHp: 20,
  worldPosition: null,
  selectedSlot: 0,
  hotbarSlots: createHotbarSlotsWithWeapons([...HOTBAR_BLOCKS]),
  equippedItem: 'builder',
  isDamageFlash: false,
  isDead: false,
  invincibleUntil: 0,
  isPlaceMode: false,
  attackCooldown: 0,
  attackCharge: 1,
  meleeSwingTimer: 0,
  saberSwingTimer: 0,
  gunRecoilTimer: 0,
  rocketRecoilTimer: 0,
  pendingWeaponAction: null,
  rocketCooldown: 0,
  rocketCooldownDuration: ROCKET_COOLDOWN,
  rocketCharge: 1,
  rocketReadyPulseUntil: 0,
  cameraShake: 0,
  lastDamageTime: 0,
  knockbackVx: 0,
  knockbackVz: 0,
  damageDirection: null,
  isSubmerged: false,
  isInWater: false,
  spawnToken: 0,
  airSupply: 15,
  hunger: 20,
  hungerExhaustion: 0,
  equippedToolId: null,
  tools: {},
  equippedArmor: {},
  armorDurability: {},

  getSelectedBlock: () => {
    const state = get();
    const fallback = getFirstHotbarBlock(state.hotbarSlots, HOTBAR_BLOCKS[0]);
    return getHotbarItemBlockId(state.hotbarSlots[state.selectedSlot], fallback);
  },

  selectSlot: (slot) => {
    const state = get();
    if (slot < 0 || slot >= state.hotbarSlots.length) return;

    const nextEquippedItem = getHotbarItemEquippedItem(state.hotbarSlots[slot]);
    set({
      selectedSlot: slot,
      equippedItem: nextEquippedItem,
    });

    if (state.equippedItem !== nextEquippedItem) {
      playEquippedItemSwitchFeedback(nextEquippedItem);
    }
  },

  setEquippedItem: (item) => {
    const current = get().equippedItem;
    if (current === item) return;
    set({ equippedItem: item });
    playEquippedItemSwitchFeedback(item);
  },

  cycleEquippedItem: () => {
    const state = get();
    const weaponSlots = state.hotbarSlots
      .map((item, slot) => ({ item, slot }))
      .filter((entry) => isWeaponHotbarItem(entry.item));
    if (weaponSlots.length === 0) return;

    const currentWeaponIndex = weaponSlots.findIndex((entry) => entry.item === state.equippedItem);
    const nextWeaponSlot = weaponSlots[
      currentWeaponIndex >= 0
        ? (currentWeaponIndex + 1) % weaponSlots.length
        : 0
    ];
    if (nextWeaponSlot) {
      get().selectSlot(nextWeaponSlot.slot);
    }
  },

  assignHotbarSlot: (slot, blockId) => {
    if (slot < 0 || slot >= HOTBAR_SLOT_COUNT) return;
    const current = get();
    set((state) => {
      const newSlots = [...state.hotbarSlots];
      newSlots[slot] = blockId;
      return {
        hotbarSlots: newSlots,
        ...(slot === state.selectedSlot ? { equippedItem: 'builder' as EquippedItem } : {}),
      };
    });
    if (slot === current.selectedSlot && current.equippedItem !== 'builder') {
      playEquippedItemSwitchFeedback('builder');
    }
  },

  performAttack: (options) => {
    const state = get();
    if (state.isDead || state.attackCooldown > 0) return 0;

    // チャージ率をダメージ倍率として返す（最低0.2倍）
    const charge = state.attackCharge;
    const multiplier = 0.2 + charge * 0.8;

    // クールダウン＋スイング開始（ダメージはヒットフレーム側で確定）
    set({
      attackCooldown: ATTACK_COOLDOWN,
      attackCharge: 0,
      meleeSwingTimer: MELEE_SWING_DURATION,
      pendingWeaponAction: 'melee',
      ...(options?.noShake ? {} : { cameraShake: Math.max(state.cameraShake, 0.22 + charge * 0.28) }),
    });

    return multiplier;
  },

  startMeleeSwing: (options) => {
    const state = get();
    if (state.isDead || state.attackCooldown > 0) return false;
    const charge = state.attackCharge;
    set({
      attackCooldown: ATTACK_COOLDOWN,
      attackCharge: 0,
      meleeSwingTimer: MELEE_SWING_DURATION,
      pendingWeaponAction: 'melee',
      ...(options?.noShake
        ? {}
        : {
            cameraShake: Math.max(
              state.cameraShake,
              options?.lightShake ? 0.1 + charge * 0.08 : 0.18 + charge * 0.2,
            ),
          }),
    });
    return true;
  },

  triggerWeaponAction: (kind) => {
    const duration = WEAPON_ACTION_DURATION[kind];
    set((state) => ({
      pendingWeaponAction: kind,
      meleeSwingTimer: kind === 'melee' ? duration : state.meleeSwingTimer,
      saberSwingTimer: kind === 'saber' ? duration : state.saberSwingTimer,
      gunRecoilTimer: kind === 'gun' ? duration : state.gunRecoilTimer,
      rocketRecoilTimer: kind === 'rocket' ? duration : state.rocketRecoilTimer,
    }));
  },

  updateAttackCooldown: (dt) => {
    const state = get();
    const newCooldown = Math.max(0, state.attackCooldown - dt);
    const newCharge = newCooldown <= 0 ? 1 : Math.min(1, 1 - newCooldown / ATTACK_COOLDOWN);
    const newSwing = Math.max(0, (state.meleeSwingTimer ?? 0) - dt);
    const newSaber = Math.max(0, (state.saberSwingTimer ?? 0) - dt);
    const newGun = Math.max(0, (state.gunRecoilTimer ?? 0) - dt);
    const newRocketRecoil = Math.max(0, (state.rocketRecoilTimer ?? 0) - dt);
    const newRocketCooldown = Math.max(0, state.rocketCooldown - dt);
    const rocketDuration = Math.max(0.1, state.rocketCooldownDuration || ROCKET_COOLDOWN);
    const newRocketCharge = newRocketCooldown <= 0 ? 1 : Math.min(1, 1 - newRocketCooldown / rocketDuration);
    const newShake = Math.max(0, state.cameraShake - SHAKE_DECAY * dt);
    const rocketJustReady = state.equippedItem === 'rocket_launcher'
      && state.rocketCooldown > 0
      && newRocketCooldown <= 0;
    const rocketReadyPulseUntil = rocketJustReady
      ? performance.now() + ROCKET_READY_PULSE_MS
      : state.rocketReadyPulseUntil;
    // 変更がある場合のみ更新
    if (
      newCooldown !== state.attackCooldown ||
      newSwing !== state.meleeSwingTimer ||
      newSaber !== state.saberSwingTimer ||
      newGun !== state.gunRecoilTimer ||
      newRocketRecoil !== state.rocketRecoilTimer ||
      newRocketCooldown !== state.rocketCooldown ||
      newShake !== state.cameraShake ||
      rocketJustReady
    ) {
      set({
        attackCooldown: newCooldown,
        attackCharge: newCharge,
        meleeSwingTimer: newSwing,
        saberSwingTimer: newSaber,
        gunRecoilTimer: newGun,
        rocketRecoilTimer: newRocketRecoil,
        rocketCooldown: newRocketCooldown,
        rocketCharge: newRocketCharge,
        rocketReadyPulseUntil,
        cameraShake: newShake,
      });

      if (rocketJustReady) {
        playRocketReadySound();
        window.setTimeout(() => {
          if (get().rocketReadyPulseUntil === rocketReadyPulseUntil) {
            set({ rocketReadyPulseUntil: 0 });
          }
        }, ROCKET_READY_PULSE_MS);
      }
    }
  },

  grantRocketReady: (options) => {
    const pulseMs = Math.max(1, options?.pulseMs ?? ROCKET_READY_PULSE_MS);
    const rocketReadyPulseUntil = performance.now() + pulseMs;
    const shake = Math.max(0, options?.shake ?? 0);
    set((state) => ({
      rocketCooldown: 0,
      rocketCharge: 1,
      rocketReadyPulseUntil,
      cameraShake: shake > 0 ? Math.max(state.cameraShake, shake) : state.cameraShake,
    }));

    if (options?.sound !== false) {
      playRocketReadySound();
    }

    window.setTimeout(() => {
      if (get().rocketReadyPulseUntil === rocketReadyPulseUntil) {
        set({ rocketReadyPulseUntil: 0 });
      }
    }, pulseMs);
  },

  fireRocket: () => {
    const state = get();
    if (state.rocketCooldown > 0 || state.isDead) return false;
    const bonus = getMasteryBonus('rocket_launcher', getMasteryLevel('rocket_launcher'));
    const techniqueBonus = getMasteryTechniqueBonus('rocket_launcher', useMasteryStore.getState().items.rocket_launcher);
    const style = getStageCombatModifier(useGameStore.getState().currentStageId, 'rocket_launcher');
    const cooldownDuration = ROCKET_COOLDOWN
      * bonus.rocketCooldownMultiplier
      * techniqueBonus.rocketCooldownMultiplier
      * style.rocketCooldownMultiplier;

    set({
      rocketCooldown: cooldownDuration,
      rocketCooldownDuration: cooldownDuration,
      rocketCharge: 0,
      rocketReadyPulseUntil: 0,
      cameraShake: Math.max(state.cameraShake, 0.45),
    });
    return true;
  },

  takeDamage: (amount, knockbackDirX, knockbackDirZ) => {
    // 建築カテゴリではダメージを受けない
    if (useGameStore.getState().isBuildMode) return false;
    // 死亡中はダメージを受けない
    if (get().isDead) return false;
    // 無敵時間中はダメージを受けない
    if (Date.now() < get().invincibleUntil) return false;

    // 防具によるダメージ軽減
    const totalDef = get().getTotalDefense();
    const reduction = calculateDamageReduction(totalDef);
    const reducedAmount = amount * (1 - reduction);
    const newHp = Math.max(0, get().hp - reducedAmount);

    // 防具耐久値消費
    if (totalDef > 0) {
      const { equippedArmor, armorDurability } = get();
      const newDurability = { ...armorDurability };
      const newEquipped = { ...equippedArmor };
      for (const [slot, armorId] of Object.entries(equippedArmor)) {
        if (!armorId) continue;
        const dur = (newDurability[armorId] ?? 0) - 1;
        if (dur <= 0) {
          delete newDurability[armorId];
          delete newEquipped[slot as ArmorSlot];
          playToolBreakSound(); // 防具破壊音
        } else {
          newDurability[armorId] = dur;
        }
      }
      set({ armorDurability: newDurability, equippedArmor: newEquipped });
    }

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
    // 建築カテゴリでは落下ダメージなし
    if (useGameStore.getState().isBuildMode) return;
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
    const isBuild = useGameStore.getState().isBuildMode;
    const spawnY = getTerrainHeight(PLAYER_SPAWN.x, PLAYER_SPAWN.z) + 1.1;
    set((state) => ({
      hp: 20,
      isDead: false,
      isDamageFlash: false,
      damageDirection: null,
      knockbackVx: 0,
      knockbackVz: 0,
      cameraShake: 0,
      attackCooldown: 0,
      attackCharge: 1,
      meleeSwingTimer: 0,
      saberSwingTimer: 0,
      gunRecoilTimer: 0,
      rocketRecoilTimer: 0,
      pendingWeaponAction: null,
      equippedItem: 'builder',
      rocketCooldown: 0,
      rocketCooldownDuration: ROCKET_COOLDOWN,
      rocketCharge: 1,
      rocketReadyPulseUntil: 0,
      invincibleUntil: isBuild ? Number.POSITIVE_INFINITY : Date.now() + 5000,
      hunger: 20,
      hungerExhaustion: 0,
      airSupply: 15,
      isSubmerged: false,
      isInWater: false,
      // Player がこのカウンタ変化を見てスポーン地点へテレポートする
      spawnToken: state.spawnToken + 1,
      worldPosition: { x: PLAYER_SPAWN.x, y: spawnY, z: PLAYER_SPAWN.z },
    }));
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

  equipTool: (toolId) => {
    if (toolId && !get().tools[toolId]) return; // 持っていないツールは装備不可
    set({ equippedToolId: toolId });
  },

  addTool: (toolId) => {
    const def = TOOL_DEFS[toolId];
    if (!def) return;
    set((state) => ({
      tools: { ...state.tools, [toolId]: def.maxDurability },
    }));
  },

  damageTool: () => {
    const { equippedToolId, tools } = get();
    if (!equippedToolId) return;
    const current = tools[equippedToolId];
    if (current === undefined) return;
    const newDurability = current - 1;
    if (newDurability <= 0) {
      // ツール破壊
      const newTools = { ...tools };
      delete newTools[equippedToolId];
      set({ tools: newTools, equippedToolId: null });
      playToolBreakSound();
    } else {
      set({ tools: { ...tools, [equippedToolId]: newDurability } });
    }
  },

  getMiningSpeed: (blockCategory?: string) => {
    const { equippedToolId } = get();
    if (!equippedToolId) return HAND_MINING_SPEED;
    const def = TOOL_DEFS[equippedToolId];
    if (!def) return HAND_MINING_SPEED;
    // 適切なツール種別なら速度倍率適用、そうでなければ素手と同じ
    if (isEffectiveTool(def.type, blockCategory)) {
      return def.miningSpeed;
    }
    // ピッケルは鉱石にも有効
    if (def.type === 'pickaxe' && blockCategory === 'ore') {
      return def.miningSpeed;
    }
    return HAND_MINING_SPEED;
  },

  getAttackDamage: () => {
    const { equippedToolId } = get();
    if (!equippedToolId) return HAND_ATTACK_DAMAGE;
    const def = TOOL_DEFS[equippedToolId];
    return def?.attackDamage ?? HAND_ATTACK_DAMAGE;
  },

  getToolTierLevel: () => {
    const { equippedToolId } = get();
    if (!equippedToolId) return HAND_TIER_LEVEL;
    const def = TOOL_DEFS[equippedToolId];
    return def?.tierLevel ?? HAND_TIER_LEVEL;
  },

  equipArmor: (armorId) => {
    const def = ARMOR_DEFS[armorId];
    if (!def) return;
    set((state) => ({
      equippedArmor: { ...state.equippedArmor, [def.slot]: armorId },
      armorDurability: {
        ...state.armorDurability,
        [armorId]: def.maxDurability,
      },
    }));
  },

  unequipArmor: (slot) => {
    set((state) => {
      const newArmor = { ...state.equippedArmor };
      const armorId = newArmor[slot];
      delete newArmor[slot];
      const newDurability = { ...state.armorDurability };
      if (armorId) delete newDurability[armorId];
      return { equippedArmor: newArmor, armorDurability: newDurability };
    });
  },

  getTotalDefense: () => {
    const { equippedArmor } = get();
    return calculateTotalDefense(equippedArmor);
  },
}));
