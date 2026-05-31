// プレイヤー状態の管理ストア
// HP、選択中のブロック（ホットバー）、ダメージ状態、攻撃クールダウンを管理

import { create } from 'zustand';
import { HOTBAR_BLOCKS, type BlockId } from '../types/blocks';
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
export type EquippedItem = 'builder' | 'rocket_launcher' | 'machine_gun' | 'lightsaber';

/** 落下ダメージの閾値（これ以上落ちるとダメージ） */
const FALL_DAMAGE_THRESHOLD = 3;
/** 落下1ブロックあたりのダメージ量 */
const FALL_DAMAGE_PER_BLOCK = 1;

/** 攻撃クールダウン時間（秒） */
const ATTACK_COOLDOWN = 0.4;
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
  hotbarSlots: [...HOTBAR_BLOCKS] as BlockId[],
  equippedItem: 'builder',
  isDamageFlash: false,
  isDead: false,
  invincibleUntil: 0,
  isPlaceMode: false,
  attackCooldown: 0,
  attackCharge: 1,
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
  airSupply: 15,
  hunger: 20,
  hungerExhaustion: 0,
  equippedToolId: null,
  tools: {},
  equippedArmor: {},
  armorDurability: {},

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
    const current = get().equippedItem;
    if (current === item) return;
    set({ equippedItem: item });
    playEquippedItemSwitchFeedback(item);
  },

  cycleEquippedItem: () => {
    let switchedTo: EquippedItem = get().equippedItem;
    set((state) => {
      const next: Record<EquippedItem, EquippedItem> = {
        builder: 'rocket_launcher',
        rocket_launcher: 'machine_gun',
        machine_gun: 'lightsaber',
        lightsaber: 'builder',
      };
      switchedTo = next[state.equippedItem];
      return { equippedItem: switchedTo };
    });
    playEquippedItemSwitchFeedback(switchedTo);
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
      newRocketCooldown !== state.rocketCooldown ||
      newShake !== state.cameraShake ||
      rocketJustReady
    ) {
      set({
        attackCooldown: newCooldown,
        attackCharge: newCharge,
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
      rocketCooldownDuration: ROCKET_COOLDOWN,
      rocketCharge: 1,
      rocketReadyPulseUntil: 0,
      invincibleUntil: isBuild ? Number.POSITIVE_INFINITY : Date.now() + 5000,
      hunger: 20,
      hungerExhaustion: 0,
      airSupply: 15,
      isSubmerged: false,
      isInWater: false,
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
