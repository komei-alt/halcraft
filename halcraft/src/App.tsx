// ハルクラ — メインアプリケーション
// Canvas + カスタム物理（Rapier不使用で軽量動作）
// デスクトップ＆モバイル両対応

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect } from 'react';
import { Suspense, useState, useCallback } from 'react';
import { Player } from './components/Player';
import { World } from './components/World';
import { Environment } from './components/Environment';
import { BlockInteraction } from './components/BlockInteraction';
import { BlockBreakEffect } from './components/BlockBreakEffect';
import { DamagePopup } from './components/DamagePopup';
import { MobDeathEffect } from './components/MobDeathEffect';
import { DroppedItems } from './components/DroppedItems';
import { BlockLights } from './components/BlockLights';
import { TorchRenderer } from './components/TorchRenderer';
import { BedRenderer } from './components/BedRenderer';
import { MobManager } from './components/mobs/MobManager';
import { RemotePlayers } from './components/RemotePlayers';
import { PlayerNameOverlay } from './components/ui/PlayerNameOverlay';
import { SoundManager } from './components/SoundManager';
import { Airplane } from './components/vehicles/Airplane';
import { VehicleHUD } from './components/ui/VehicleHUD';
import { useVehicleStore } from './stores/useVehicleStore';
import { Crosshair } from './components/ui/Crosshair';
import { Hotbar } from './components/ui/Hotbar';
import { HealthBar } from './components/ui/HealthBar';
import { DamageOverlay } from './components/ui/DamageOverlay';
import { AttackIndicator } from './components/ui/AttackIndicator';
import { TimeDisplay } from './components/ui/TimeDisplay';
import { StartScreen } from './components/ui/StartScreen';
import { CraftingScreen } from './components/ui/CraftingScreen';
import { VoiceChatUI } from './components/ui/VoiceChatUI';
import { MaintenanceOverlay } from './components/ui/MaintenanceOverlay';
import { MobileControls } from './components/ui/mobile/MobileControls';
import { useGameStore } from './stores/useGameStore';
import { isTouchDevice } from './utils/device';
import './App.css';

function GameCanvas() {
  const isTouch = isTouchDevice();

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{
        fov: isTouch ? 65 : 70,
        near: 0.1,
        far: isTouch ? 120 : 200,
      }}
      dpr={isTouch ? [1, 1.5] : [1, 2]}
      gl={{
        antialias: false,
        powerPreference: isTouch ? 'default' : 'high-performance',
        stencil: false,
        depth: true,
      }}
      style={{ position: 'fixed', inset: 0 }}
    >
      <Suspense fallback={null}>
        <Environment />
        <World />
        <TorchRenderer />
        <BedRenderer />
        <BlockLights />
        <Player />
        <BlockInteraction />
        <BlockBreakEffect />
        <DamagePopup />
        <MobDeathEffect />
        <DroppedItems />
        <MobManager />
        <Airplane />
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
  const spawnAirplane = useVehicleStore((s) => s.spawnAirplane);
  const airplaneSpawned = useVehicleStore((s) => s.airplane.spawned);

  // ゲーム開始時に飛行機をスポーン（プレイヤーの初期位置近く）
  useEffect(() => {
    if (phase === 'playing' && !airplaneSpawned) {
      // プレイヤー初期位置(8, 40, 8)の近くにスポーン
      spawnAirplane(15, 42, 15);
    }
  }, [phase, airplaneSpawned, spawnAirplane]);

  // クラフト画面の開閉状態（モバイル用：外部から制御）
  const [craftingOpen, setCraftingOpen] = useState(false);

  const handleOpenCrafting = useCallback(() => {
    setCraftingOpen(true);
  }, []);

  const handleCloseCrafting = useCallback(() => {
    setCraftingOpen(false);
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
          <VehicleHUD />
          <VoiceChatUI />
          <CraftingScreen
            externalOpen={isTouch ? craftingOpen : undefined}
            onClose={handleCloseCrafting}
          />
          {/* モバイルコントロール（タッチデバイスのみ） */}
          {isTouch && (
            <MobileControls onOpenCrafting={handleOpenCrafting} />
          )}
        </>
      )}
    </>
  );
}
