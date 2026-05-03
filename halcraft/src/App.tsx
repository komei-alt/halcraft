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
import { HitImpactEffect } from './components/HitImpactEffect';
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
import { Tank } from './components/vehicles/Tank';
import { Airplane } from './components/vehicles/Airplane';
import { Car } from './components/vehicles/Car';
// CockpitView は無効化済み — ヘリ胴体自体がガラス化するため不要
import { MachineGun } from './components/vehicles/MachineGun';
import { VehicleWeapons } from './components/vehicles/VehicleWeapons';
import { VehicleCombat } from './components/vehicles/VehicleCombat';
import { VehicleExplosionEffect } from './components/vehicles/VehicleExplosionEffect';
import { VehicleHealthBars } from './components/vehicles/VehicleHealthBars';
import { PlayerMachineGun } from './components/PlayerMachineGun';
import { CockpitHUD } from './components/ui/CockpitHUD';
import { VehicleAimHUD } from './components/ui/VehicleAimHUD';
import { MinimapHUD } from './components/ui/MinimapHUD';
import { useVehicleStore, TANK_CONSTANTS, AIRPLANE_CONSTANTS, CAR_CONSTANTS } from './stores/useVehicleStore';
import { useGameStore } from './stores/useGameStore';
import { AIRPLANE_SPAWN, CAR_SPAWN, HELIPORT_CENTER, TANK_SPAWN } from './utils/terrain/constants';
import { getTerrainHeight } from './utils/terrain/heightmap';
import { Crosshair } from './components/ui/Crosshair';
import { Hotbar } from './components/ui/Hotbar';
import { HealthBar } from './components/ui/HealthBar';
import { DamageOverlay } from './components/ui/DamageOverlay';
import { AttackIndicator } from './components/ui/AttackIndicator';
import { RocketCooldownIndicator } from './components/ui/RocketCooldownIndicator';
import { TimeDisplay } from './components/ui/TimeDisplay';
import { StartScreen } from './components/ui/StartScreen';
import { PauseScreen } from './components/ui/PauseScreen';
import { CraftingScreen } from './components/ui/CraftingScreen';
import { VoiceChatUI } from './components/ui/VoiceChatUI';
import { MaintenanceOverlay } from './components/ui/MaintenanceOverlay';
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
        far: isTouch ? 250 : 500,
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
        <HitImpactEffect />
        <MobDeathEffect />
        <RocketLauncher />
        <PlayerMachineGun />
        <DroppedItems />
        <MobManager />
        <Helicopter />
        <Tank />
        <Airplane />
        <Car />
        <MachineGun />
        <VehicleWeapons />
        <VehicleCombat />
        <VehicleExplosionEffect />
        <VehicleHealthBars />
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
  const spawnTank = useVehicleStore((s) => s.spawnTank);
  const spawnAirplane = useVehicleStore((s) => s.spawnAirplane);
  const spawnCar = useVehicleStore((s) => s.spawnCar);
  const helicopterSpawned = useVehicleStore((s) => s.helicopter.spawned);
  const tankSpawned = useVehicleStore((s) => s.tank.spawned);
  const airplaneSpawned = useVehicleStore((s) => s.airplane.spawned);
  const carSpawned = useVehicleStore((s) => s.car.spawned);

  // ゲーム開始時に乗り物を各専用エリアにスポーン
  useEffect(() => {
    if (phase === 'playing' && !helicopterSpawned) {
      const spawnX = HELIPORT_CENTER.x;
      const spawnZ = HELIPORT_CENTER.z;
      const terrainY = getTerrainHeight(spawnX, spawnZ);
      spawnHelicopter(spawnX, terrainY + 2.0, spawnZ);
    }
    if (phase === 'playing' && !tankSpawned) {
      const terrainY = getTerrainHeight(TANK_SPAWN.x, TANK_SPAWN.z);
      spawnTank(TANK_SPAWN.x, terrainY + TANK_CONSTANTS.BODY_HEIGHT, TANK_SPAWN.z);
    }
    if (phase === 'playing' && !airplaneSpawned) {
      const terrainY = getTerrainHeight(AIRPLANE_SPAWN.x, AIRPLANE_SPAWN.z);
      spawnAirplane(AIRPLANE_SPAWN.x, terrainY + AIRPLANE_CONSTANTS.BODY_HEIGHT, AIRPLANE_SPAWN.z);
    }
    if (phase === 'playing' && !carSpawned) {
      const terrainY = getTerrainHeight(CAR_SPAWN.x, CAR_SPAWN.z);
      spawnCar(CAR_SPAWN.x, terrainY + CAR_CONSTANTS.BODY_HEIGHT, CAR_SPAWN.z);
    }
  }, [
    phase,
    helicopterSpawned,
    tankSpawned,
    airplaneSpawned,
    carSpawned,
    spawnHelicopter,
    spawnTank,
    spawnAirplane,
    spawnCar,
  ]);

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
          <VehicleAimHUD />
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
          {/* ポーズ画面 */}
          <PauseScreen />
          {/* スキン変更オーバーレイ */}
          {skinSelectorOpen && (
            <SkinSelector overlay onClose={handleCloseSkinSelector} />
          )}
        </>
      )}
    </>
  );
}
