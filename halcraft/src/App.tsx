// ハルクラ — メインアプリケーション
// Canvas + カスタム物理（Rapier不使用で軽量動作）
// デスクトップ＆モバイル両対応

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Suspense, useState, useCallback, useEffect } from 'react';
import { Player } from './components/Player';
import { World } from './components/World';
import { Environment } from './components/Environment';
import { BlockInteraction } from './components/BlockInteraction';
import { BlockBreakEffect } from './components/BlockBreakEffect';
import { DamagePopup } from './components/DamagePopup';
import { MobDeathEffect } from './components/MobDeathEffect';
import { RocketLauncher } from './components/RocketLauncher';
import { DroppedItems } from './components/DroppedItems';
import { BlockLights } from './components/BlockLights';
import { TorchRenderer } from './components/TorchRenderer';
import { BedRenderer } from './components/BedRenderer';
import { TurretRenderer } from './components/TurretRenderer';
import { CampfireRenderer, CandleRenderer, DoorRenderer, LadderRenderer } from './components/DecorBlocks';
import { MobManager } from './components/mobs/MobManager';
import { RemotePlayers } from './components/RemotePlayers';
import { PlayerNameOverlay } from './components/ui/PlayerNameOverlay';
import { SoundManager } from './components/SoundManager';
import { Helicopter } from './components/vehicles/Helicopter';
// CockpitView は無効化済み — ヘリ胴体自体がガラス化するため不要
import { MachineGun } from './components/vehicles/MachineGun';
import { CockpitHUD } from './components/ui/CockpitHUD';
import { MinimapHUD } from './components/ui/MinimapHUD';
import { useVehicleStore } from './stores/useVehicleStore';
import { useWorldStore } from './stores/useWorldStore';
import { useGameStore } from './stores/useGameStore';
import { useMobStore } from './stores/useMobStore';
import { BLOCK_IDS } from './types/blocks';
import { getTerrainHeight } from './utils/terrain';
import { HELIPORT_CENTER } from './utils/terrain';
import { Crosshair } from './components/ui/Crosshair';
import { Hotbar } from './components/ui/Hotbar';
import { HealthBar } from './components/ui/HealthBar';
import { DamageOverlay } from './components/ui/DamageOverlay';
import { AttackIndicator } from './components/ui/AttackIndicator';
import { RocketCooldownIndicator } from './components/ui/RocketCooldownIndicator';
import { TimeDisplay } from './components/ui/TimeDisplay';
import { StartScreen } from './components/ui/StartScreen';
import { CraftingScreen } from './components/ui/CraftingScreen';
import { VoiceChatUI } from './components/ui/VoiceChatUI';
import { MissionOverlay } from './components/ui/MissionOverlay';
import { CoreHealthBar } from './components/ui/CoreHealthBar';
import { BossHealthBar } from './components/ui/BossHealthBar';
import { MaintenanceOverlay } from './components/ui/MaintenanceOverlay';
import { UpdateToast } from './components/ui/UpdateToast';
import { ControlsGuide } from './components/ui/ControlsGuide';
import { DesktopInputHint } from './components/ui/DesktopInputHint';
import { WeaponSwitchPopover } from './components/ui/WeaponSwitchPopover';
import { MobileControls } from './components/ui/mobile/MobileControls';
import { SkinSelector } from './components/ui/SkinSelector';
import { isTouchDevice } from './utils/device';
import { activateDesktopGameplayInput } from './utils/gameCanvas';
import './App.css';

function GameCanvas() {
  const isTouch = isTouchDevice();

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{
        fov: isTouch ? 65 : 70,
        near: 0.1,
        far: isTouch ? 150 : 300,
      }}
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      gl={{
        antialias: false,
        powerPreference: isTouch ? 'default' : 'high-performance',
        stencil: false,
        depth: true,
      }}
      tabIndex={0}
      style={{ position: 'fixed', inset: 0, outline: 'none' }}
    >
      <Suspense fallback={null}>
        <Environment />
        <World />
        <TorchRenderer />
        <BedRenderer />
        <DoorRenderer />
        <LadderRenderer />
        <CampfireRenderer />
        <CandleRenderer />
        <TurretRenderer />
        <BlockLights />
        <Player />
        <BlockInteraction />
        <BlockBreakEffect />
        <DamagePopup />
        <MobDeathEffect />
        <RocketLauncher />
        <DroppedItems />
        <MobManager />
        <Helicopter />
        <MachineGun />
        {/* CockpitView は無効化 — ヘリ胴体自体がガラス化するため不要 */}
        {/* <CockpitView /> */}
        <RemotePlayers />
        <PlayerNameOverlay />
        <SoundManager />
      </Suspense>
    </Canvas>
  );
}

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const isTouch = isTouchDevice();
  const spawnHelicopter = useVehicleStore((s) => s.spawnHelicopter);
  const helicopterSpawned = useVehicleStore((s) => s.helicopter.spawned);

  // ゲーム開始時にヘリコプターをヘリポートにスポーン
  useEffect(() => {
    if (phase === 'playing' && !helicopterSpawned) {
      const spawnX = HELIPORT_CENTER.x;
      const spawnZ = HELIPORT_CENTER.z;
      const terrainY = getTerrainHeight(spawnX, spawnZ);
      spawnHelicopter(spawnX, terrainY + 2.0, spawnZ);
    }
  }, [phase, helicopterSpawned, spawnHelicopter]);

  const currentStage = useGameStore((s) => s.currentStage);
  const setCorePosition = useGameStore((s) => s.setCorePosition);
  const trySpawnBoss = useMobStore((s) => s.trySpawnBoss);

  // 防衛ミッション開始時にコアを自動配置 / ボスミッション時にボスを配置
  useEffect(() => {
    if (phase === 'playing') {
      if (currentStage?.mission.type === 'defend_core') {
        const coreX = 0;
        const coreZ = -10;
        const terrainY = getTerrainHeight(coreX, coreZ) + 1;
        const setBlock = useWorldStore.getState().setBlock;
        setBlock(coreX, terrainY, coreZ, BLOCK_IDS.CORE);
        setCorePosition(coreX, terrainY, coreZ);
      } else if (currentStage?.mission.type === 'defeat_boss') {
        // スタート直後にプレイヤーの少し離れた場所にボスをスポーン
        const playerX = 0;
        const playerZ = 0;
        trySpawnBoss(playerX, playerZ, getTerrainHeight);
      }
    }
  }, [phase, currentStage, setCorePosition, trySpawnBoss]);

  // クラフト画面の開閉状態（モバイル用：外部から制御）
  const [craftingOpen, setCraftingOpen] = useState(false);

  const handleOpenCrafting = useCallback(() => {
    setCraftingOpen(true);
  }, []);

  const handleCloseCrafting = useCallback(() => {
    setCraftingOpen(false);
  }, []);

  // スキン変更UI の開閉状態
  const [skinSelectorOpen, setSkinSelectorOpen] = useState(false);

  const toggleSkinSelector = useCallback(() => {
    setSkinSelectorOpen((prev) => {
      const next = !prev;
      if (next) {
        document.exitPointerLock?.();
      } else {
        document.querySelector('canvas')?.requestPointerLock?.();
      }
      return next;
    });
  }, []);

  // Tab キーでスキンセレクターを開閉
  useEffect(() => {
    if (phase === 'menu') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        toggleSkinSelector();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, toggleSkinSelector]);

  const handleCloseSkinSelector = useCallback(() => {
    setSkinSelectorOpen(false);
    activateDesktopGameplayInput();
  }, []);

  return (
    <>
      <StartScreen />
      <MaintenanceOverlay />
      <UpdateToast />
      {phase !== 'menu' && (
        <>
          <GameCanvas />
          <Crosshair />
          <Hotbar />
          <HealthBar />
          <TimeDisplay />
          <DamageOverlay />
          <AttackIndicator />
          <RocketCooldownIndicator />
          <WeaponSwitchPopover />
          <MissionOverlay />
          <CoreHealthBar />
          <BossHealthBar />
          <CockpitHUD />
          <MinimapHUD />
          <ControlsGuide />
          {!isTouch && <DesktopInputHint />}
          <VoiceChatUI />
          <CraftingScreen
            externalOpen={isTouch ? craftingOpen : undefined}
            onClose={handleCloseCrafting}
          />
          {/* モバイルコントロール（タッチデバイスのみ） */}
          {isTouch && (
            <MobileControls onOpenCrafting={handleOpenCrafting} />
          )}
          {/* スキン変更オーバーレイ */}
          {skinSelectorOpen && (
            <SkinSelector overlay onClose={handleCloseSkinSelector} />
          )}
        </>
      )}
    </>
  );
}
