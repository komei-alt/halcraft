// ゲーム全体の状態管理ストア
// ゲームフェーズ（メニュー・プレイ中・ポーズ）と昼夜サイクルを管理
// カテゴリ（建築/戦争）でゲームモードを自動導出

import { create } from 'zustand';
import { usePlayerStore } from './usePlayerStore';
import { useWorldStore } from './useWorldStore';
import { useInventoryStore } from './useInventoryStore';
import { useMobStore } from './useMobStore';
import { useExperienceStore } from './useExperienceStore';
import { STAGES, type StageDefinition, type StageCategory } from '../types/stages';
import { TOOL_DEFS } from '../types/tools';
import { BIOME_CONFIGS, type BiomeConfig } from '../types/biomes';
import { setCurrentBiome } from '../utils/terrain/biomeConfig';
import { setCurrentTerrainStage } from '../utils/terrain/stageConfig';
import { resetNoiseForBiome } from '../utils/terrain/noise';
import { clearHeightCache } from '../utils/terrain/heightmap';

type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

/** 昼夜サイクルの定数 */
// 基本サイクル: リアル20分 = ゲーム内1日 (1200秒)
const BASE_DAY_DURATION_SECONDS = 1200;

/**
 * 時間帯別の速度係数
 * 値が大きいほどその時間帯を速く通過する（体感で短く感じる）
 * 値が小さいほどゆっくり進む（その時間帯を長く味わえる）
 *
 * gameTime の区間:
 *   0.00 ~ 0.10  朝 (6:00-8:24)   → ゆっくり: 朝焼けの雰囲気を楽しむ
 *   0.10 ~ 0.40  昼 (8:24-15:36)  → やや速い: 素材集めなどのテンポを上げる
 *   0.40 ~ 0.55  夕方 (15:36-19:12) → ゆっくり: 夕暮れの美しさを味わう
 *   0.55 ~ 1.00  夜 (19:12-6:00)  → 速い: 夜の緊張感を保ちつつテンポよく
 */
interface TimeZoneSpeed {
  start: number;
  end: number;
  speed: number;
}

const TIME_ZONE_SPEEDS: TimeZoneSpeed[] = [
  { start: 0.00, end: 0.10, speed: 0.6 },  // 朝: ゆっくり（朝焼けを楽しむ）
  { start: 0.10, end: 0.40, speed: 1.2 },  // 昼: やや速い（テンポアップ）
  { start: 0.40, end: 0.55, speed: 0.5 },  // 夕方: ゆっくり（夕焼けを味わう）
  { start: 0.55, end: 1.00, speed: 1.6 },  // 夜: 速い（緊張感を保ちつつ短く）
];

/** 現在の gameTime に対する速度係数を返す */
function getTimeSpeedMultiplier(gameTime: number): number {
  for (const zone of TIME_ZONE_SPEEDS) {
    if (gameTime >= zone.start && gameTime < zone.end) {
      return zone.speed;
    }
  }
  // フォールバック（通常到達しない）
  return 1.0;
}

interface GameState {
  /** 現在のゲームフェーズ */
  phase: GamePhase;

  /** 建築カテゴリの飛行中か */
  creativeFlying: boolean;

  /** 選択中のステージID */
  currentStageId: string | null;

  /** 現在のステージ情報 (computed) */
  currentStage: StageDefinition | null;

  /** 現在のバイオーム設定 */
  currentBiome: BiomeConfig | null;

  /** 現在のカテゴリ（buildなら平和モード、warなら戦闘モード） */
  currentCategory: StageCategory | null;

  /** 建築カテゴリか（平和モード = クリエイティブ的） */
  isBuildMode: boolean;

  /** ステージ開始からの経過秒数 */
  stageElapsedSeconds: number;

  /** このステージで倒した敵の数 */
  enemiesDefeated: number;

  /** ステージボスを出現させたか */
  bossSpawned: boolean;

  /** ゲーム内時間 (0.0 ~ 1.0)
   *  0.0 = 朝6時, 0.25 = 正午, 0.5 = 夕方6時, 0.75 = 深夜 */
  gameTime: number;

  /** ゲーム内の日数カウンタ */
  dayCount: number;

  /** 昼か夜か */
  isNight: boolean;

  /** 現在のディメンション */
  dimension: 'overworld' | 'nether';

  /** ネザーへ移動 */
  travelToNether: () => void;
  /** オーバーワールドへ戻る */
  travelToOverworld: () => void;

  /** 更新通知を表示するか */
  updateAvailable: boolean;

  /** 更新通知を閉じる */
  dismissUpdate: () => void;

  /** プレイするステージを設定 */
  setStage: (stageId: string) => void;

  /** ゲーム開始 */
  startGame: () => void;

  /** 敵撃破数を進める */
  registerEnemyDefeat: () => void;

  /** ボス出現済みにする */
  setBossSpawned: (value: boolean) => void;

  /** クリエイティブ飛行状態を変更 */
  setCreativeFlying: (flying: boolean) => void;

  /** ポーズトグル */
  togglePause: () => void;

  /** ゲームオーバー */
  gameOver: () => void;

  /** メニューに戻る */
  returnToMenu: () => void;

  /** 時間を進める (deltaSeconds: 実時間の経過秒数) */
  advanceTime: (deltaSeconds: number) => void;

  /** サーバーからの時間同期 */
  syncTime: (gameTime: number, dayCount: number, isNight: boolean) => void;

  /** マルチプレイ接続中か（時間同期にサーバーを使う） */
  isMultiplayer: boolean;

  /** マルチプレイ状態を設定 */
  setMultiplayer: (value: boolean) => void;

}

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  creativeFlying: false,
  currentStageId: null,
  currentStage: null,
  currentBiome: null,
  currentCategory: null,
  isBuildMode: false,
  stageElapsedSeconds: 0,
  enemiesDefeated: 0,
  bossSpawned: false,
  gameTime: 0.0, // 朝スタート
  dayCount: 1,
  isNight: false,
  dimension: 'overworld',
  updateAvailable: false,
  isMultiplayer: false,

  travelToNether: () => set({ dimension: 'nether' }),
  travelToOverworld: () => set({ dimension: 'overworld' }),

  dismissUpdate: () => set({ updateAvailable: false }),

  setStage: (stageId) => {
    const stage = STAGES.find(s => s.id === stageId) || null;
    const biome = stage ? BIOME_CONFIGS[stage.biome] : null;
    const category = stage?.category ?? null;

    // バイオーム設定を地形生成モジュールに適用
    if (biome) {
      setCurrentBiome(biome);
      resetNoiseForBiome();
      clearHeightCache();
    }
    setCurrentTerrainStage(stage);

    // 既存のチャンクデータをクリア（バイオーム切替時に旧地形が残るのを防止）
    // World コンポーネントの ensureChunksAround() が次フレームでチャンク再生成をトリガーする
    const { clearChunks } = useWorldStore.getState();
    clearChunks();

    set({
      currentStageId: stageId,
      currentStage: stage,
      currentBiome: biome,
      currentCategory: category,
      isBuildMode: category === 'build',
      stageElapsedSeconds: 0,
      enemiesDefeated: 0,
      bossSpawned: false,
    });
  },

  startGame: () => {
    const { isBuildMode, currentStage } = get();
    const rules = currentStage?.rules;
    const starterKit = rules?.starterKit;

    const starterItems: Record<number, number> = {};
    for (const [blockId, count] of Object.entries(starterKit?.blocks ?? {})) {
      if (count && count > 0) starterItems[Number(blockId)] = count;
    }
    useInventoryStore.setState({ items: starterItems });
    useMobStore.getState().clearAllMobs();
    useExperienceStore.getState().resetXp();

    const startingTools: Record<string, number> = {};
    for (const toolId of starterKit?.tools ?? []) {
      const def = TOOL_DEFS[toolId];
      if (def) startingTools[toolId] = def.maxDurability;
    }

    set({
      phase: 'playing',
      creativeFlying: false,
      gameTime: rules?.startTime ?? 0.0,
      dayCount: 1,
      isNight: (rules?.startTime ?? 0.0) >= 0.5,
      stageElapsedSeconds: 0,
      enemiesDefeated: 0,
      bossSpawned: false,
      dimension: 'overworld',
    });

    const player = usePlayerStore.getState();
    usePlayerStore.setState({
      hp: player.maxHp,
      isDead: false,
      isDamageFlash: false,
      damageDirection: null,
      knockbackVx: 0,
      knockbackVz: 0,
      cameraShake: 0,
      equippedItem: 'builder',
      equippedToolId: starterKit?.equippedToolId ?? null,
      tools: startingTools,
      hunger: starterKit?.hunger ?? 20,
      hungerExhaustion: 0,
      airSupply: 15,
      isSubmerged: false,
      isInWater: false,
      // 建築カテゴリは無敵（クリエイティブ的）
      invincibleUntil: isBuildMode ? Number.POSITIVE_INFINITY : Date.now() + 5000,
    });
  },

  registerEnemyDefeat: () => {
    set((state) => ({ enemiesDefeated: state.enemiesDefeated + 1 }));
  },

  setBossSpawned: (value) => set({ bossSpawned: value }),

  setCreativeFlying: (creativeFlying) => set({ creativeFlying }),

  togglePause: () => {
    const current = get().phase;
    if (current === 'playing') set({ phase: 'paused' });
    else if (current === 'paused') set({ phase: 'playing' });
  },

  gameOver: () => set({ phase: 'gameover' }),
  returnToMenu: () => set({ phase: 'menu', creativeFlying: false }),

  setMultiplayer: (value) => set({ isMultiplayer: value }),


  advanceTime: (deltaSeconds) => {
    if (get().phase !== 'playing') return;
    const elapsedSeconds = get().stageElapsedSeconds + deltaSeconds;
    // マルチプレイ中はサーバーからの同期に任せる
    if (get().isMultiplayer) {
      set({ stageElapsedSeconds: elapsedSeconds });
      return;
    }

    const currentTime = get().gameTime;
    const dayDurationSeconds = get().currentStage?.rules.dayDurationSeconds ?? BASE_DAY_DURATION_SECONDS;

    // 時間帯に応じた速度係数を取得
    const speedMultiplier = getTimeSpeedMultiplier(currentTime);

    // 基本の時間増分 × 時間帯別速度係数
    const timeIncrement = (deltaSeconds / dayDurationSeconds) * speedMultiplier;
    let newTime = currentTime + timeIncrement;
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
      stageElapsedSeconds: elapsedSeconds,
    });
  },

  syncTime: (gameTime, dayCount, isNight) => {
    set({ gameTime, dayCount, isNight });
  },
}));
