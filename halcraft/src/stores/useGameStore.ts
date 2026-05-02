// ゲーム全体の状態管理ストア
// ゲームフェーズ（メニュー・プレイ中・ポーズ）と昼夜サイクルを管理

import { create } from 'zustand';
import { usePlayerStore } from './usePlayerStore';
import { STAGES, type StageDefinition } from '../types/stages';

type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';
export type GameMode = 'survival' | 'creative';

/** 昼夜サイクルの定数 */
// 基本サイクル: リアル5分 = ゲーム内1日 (300秒)
// 旧設定は600秒だったが、体感2倍速にするため300秒に変更
const BASE_DAY_DURATION_SECONDS = 300;

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

  /** プレイモード */
  gameMode: GameMode;

  /** クリエイティブ飛行中か */
  creativeFlying: boolean;

  /** 選択中のステージID */
  currentStageId: string | null;

  /** 現在のステージ情報 (computed) */
  currentStage: StageDefinition | null;

  /** ミッション進捗 */
  missionProgress: number;

  /** ミッションクリア状態 */
  missionCleared: boolean;

  /** 防衛用コアのHP */
  coreHp: number;
  coreMaxHp: number;
  corePosition: { x: number; y: number; z: number } | null;
  damageCore: (amount: number) => void;
  setCorePosition: (x: number, y: number, z: number) => void;

  /** ゲーム内時間 (0.0 ~ 1.0)
   *  0.0 = 朝6時, 0.25 = 正午, 0.5 = 夕方6時, 0.75 = 深夜 */
  gameTime: number;

  /** ゲーム内の日数カウンタ */
  dayCount: number;

  /** 昼か夜か */
  isNight: boolean;

  /** 更新通知を表示するか */
  updateAvailable: boolean;

  /** 更新通知を閉じる */
  dismissUpdate: () => void;

  /** プレイするステージを設定 */
  setStage: (stageId: string) => void;

  /** ゲーム開始 */
  startGame: () => void;

  /** プレイモードを変更 */
  setGameMode: (mode: GameMode) => void;

  /** クリエイティブ飛行状態を変更 */
  setCreativeFlying: (flying: boolean) => void;

  /** ミッション進捗を加算 */
  addMissionProgress: (amount: number) => void;

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
  gameMode: 'survival',
  creativeFlying: false,
  currentStageId: null,
  currentStage: null,
  missionProgress: 0,
  missionCleared: false,
  coreHp: 100,
  coreMaxHp: 100,
  corePosition: null,
  gameTime: 0.0, // 朝スタート
  dayCount: 1,
  isNight: false,
  updateAvailable: false,
  isMultiplayer: false,

  dismissUpdate: () => set({ updateAvailable: false }),

  setStage: (stageId) => {
    const stage = STAGES.find(s => s.id === stageId) || null;
    set({ currentStageId: stageId, currentStage: stage, missionProgress: 0, missionCleared: false, corePosition: null });
  },

  startGame: () => {
    const { gameMode } = get();
    set({
      phase: 'playing',
      creativeFlying: false,
      gameTime: 0.0,
      dayCount: 1,
      missionProgress: 0,
      missionCleared: false,
      coreHp: 100,
      coreMaxHp: 100,
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
      invincibleUntil: gameMode === 'creative' ? Number.POSITIVE_INFINITY : Date.now() + 5000,
    });
  },

  setGameMode: (gameMode) => {
    set({ gameMode, creativeFlying: false });

    const player = usePlayerStore.getState();
    usePlayerStore.setState({
      hp: gameMode === 'creative' ? player.maxHp : player.hp,
      isDead: false,
      isDamageFlash: false,
      damageDirection: null,
      knockbackVx: 0,
      knockbackVz: 0,
      cameraShake: 0,
      invincibleUntil: gameMode === 'creative' ? Number.POSITIVE_INFINITY : Date.now() + 5000,
    });
  },

  setCreativeFlying: (creativeFlying) => set({ creativeFlying }),

  damageCore: (amount: number) => {
    const { coreHp, phase, gameOver } = get();
    if (phase !== 'playing' || coreHp <= 0) return;
    const newHp = Math.max(0, coreHp - amount);
    set({ coreHp: newHp });
    if (newHp <= 0) {
      gameOver();
    }
  },

  setCorePosition: (x, y, z) => set({ corePosition: { x, y, z } }),

  addMissionProgress: (amount) => {
    const stage = get().currentStage;
    if (!stage || get().missionCleared) return;

    const newProgress = get().missionProgress + amount;
    const cleared = newProgress >= stage.mission.target;
    set({ missionProgress: newProgress, missionCleared: cleared });
    
    if (cleared) {
      console.log(`[Mission] ${stage.mission.title} をクリアしました！`);
      // TODO: 必要ならクリア効果音などを再生
    }
  },

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
    // マルチプレイ中はサーバーからの同期に任せる
    if (get().isMultiplayer) return;

    const currentTime = get().gameTime;

    // 時間帯に応じた速度係数を取得
    const speedMultiplier = getTimeSpeedMultiplier(currentTime);

    // 基本の時間増分 × 時間帯別速度係数
    const timeIncrement = (deltaSeconds / BASE_DAY_DURATION_SECONDS) * speedMultiplier;
    let newTime = currentTime + timeIncrement;
    let newDayCount = get().dayCount;

    if (newTime >= 1.0) {
      newTime -= 1.0;
      newDayCount++;
      
      // Survive Mission判定 / Defend Core ミッション判定
      const stage = get().currentStage;
      if (stage && !get().missionCleared) {
        if (stage.mission.type === 'survive_night' || stage.mission.type === 'defend_core') {
          get().addMissionProgress(1);
        }
      }
    }

    // 夜判定: 0.5 ~ 1.0 が夜（夕方6時～朝6時）
    const isNight = newTime >= 0.5;

    set({
      gameTime: newTime,
      dayCount: newDayCount,
      isNight,
    });
  },

  syncTime: (gameTime, dayCount, isNight) => {
    const wasNight = get().isNight;
    const prevDayCount = get().dayCount;
    set({ gameTime, dayCount, isNight });

    // Survive Mission判定 / Defend Core ミッション判定 (マルチプレイ時)
    if (dayCount > prevDayCount || (wasNight && !isNight)) {
      const stage = get().currentStage;
      if (stage && !get().missionCleared) {
        if (stage.mission.type === 'survive_night' || stage.mission.type === 'defend_core') {
          get().addMissionProgress(1);
        }
      }
    }
  },
}));
