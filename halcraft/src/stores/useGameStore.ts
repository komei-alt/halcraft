// ゲーム全体の状態管理ストア
// ゲームフェーズ（メニュー・プレイ中・ポーズ）と昼夜サイクルを管理

import { create } from 'zustand';
import { usePlayerStore } from './usePlayerStore';
import { STAGES, type StageDefinition } from '../types/stages';

type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';
export type GameMode = 'survival' | 'creative';

/** 昼夜サイクルの定数 */
// リアル10分 = ゲーム内1日 (600秒 = 1日サイクル)
const DAY_DURATION_SECONDS = 600;

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

  /** 新バージョンが利用可能か */
  updateAvailable: boolean;

  /** アップデート通知を表示 */
  showUpdateNotice: () => void;

  /** アップデート通知を閉じる */
  dismissUpdate: () => void;
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
  isMultiplayer: false,
  updateAvailable: false,

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

  showUpdateNotice: () => set({ updateAvailable: true }),
  dismissUpdate: () => set({ updateAvailable: false }),

  advanceTime: (deltaSeconds) => {
    if (get().phase !== 'playing') return;
    // マルチプレイ中はサーバーからの同期に任せる
    if (get().isMultiplayer) return;

    const timeIncrement = deltaSeconds / DAY_DURATION_SECONDS;
    let newTime = get().gameTime + timeIncrement;
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
