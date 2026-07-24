import { Suspense, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { Player } from './Player';
import { World } from './World';
import { VegetationRenderer } from './VegetationRenderer';
import { Environment } from './Environment';
import { BlockInteraction } from './BlockInteraction';
import { BuilderHeldItem } from './BuilderHeldItem';
import { BlockBreakEffect } from './BlockBreakEffect';
import { BlockUseEffect } from './BlockUseEffect';
import { DamagePopup } from './DamagePopup';
import { HitImpactEffect } from './HitImpactEffect';
import { AllyMeleeAttackFX } from './AllyMeleeAttackFX';
import { CombatExplosionFX } from './CombatExplosionFX';
import { MobDeathEffect } from './MobDeathEffect';
import { RocketLauncher } from './RocketLauncher';
import { GravityGlove } from './GravityGlove';
import { BombSlinger } from './BombSlinger';
import { DroppedItems } from './DroppedItems';
import { BlockLights } from './BlockLights';
import { TorchRenderer } from './TorchRenderer';
import { BedRenderer } from './BedRenderer';
import { TurretRenderer } from './TurretRenderer';
import {
  CampfireRenderer,
  CandleRenderer,
  DoorRenderer,
  LadderRenderer,
  LeverRenderer,
  WheatSeedsRenderer,
} from './DecorBlocks';
import { NetherPortalRenderer, StairsRenderer } from './SpecialBlockRenderer';
import { RailRenderer } from './RailRenderer';
import { CoasterCart } from './CoasterCart';
import { LavaRenderer, WaterRenderer } from './WaterRenderer';
import { LiquidSurfaceFX } from './LiquidSurfaceFX';
import { StageConditionFX } from './StageConditionFX';
import { StageEventFX } from './StageEventFX';
import { StageLandmarkBeaconFX } from './StageLandmarkBeaconFX';
import { StageModeFlowFX } from './StageModeFlowFX';
import { FunctionalBlockAuraFX } from './FunctionalBlockAuraFX';
import { ItemMasteryPulseFX } from './ItemMasteryPulseFX';
import { AdaptiveGraphicsGovernor, AdaptiveStageVisuals } from './AdaptiveGraphics';
import {
  CanvasResolutionPipeline,
  GraphicsPostFX,
  RendererColorPipeline,
  SceneReflectionPipeline,
} from './GraphicsQuality';
import { StageConditionSystem } from './StageConditionSystem';
import { StageEventSystem } from './StageEventSystem';
import { StagePressureSystem } from './StagePressureSystem';
import { MobManager } from './mobs/MobManager';
import { RemotePlayers } from './RemotePlayers';
import { PlayerNameOverlay } from './ui/PlayerNameOverlay';
import { SoundManager } from './SoundManager';
import { Helicopter } from './vehicles/Helicopter';
import { Tank } from './vehicles/Tank';
import { Airplane } from './vehicles/Airplane';
import { Car } from './vehicles/Car';
import { MachineGun } from './vehicles/MachineGun';
import { VehicleWeapons } from './vehicles/VehicleWeapons';
import { VehicleCombat } from './vehicles/VehicleCombat';
import { VehicleExplosionEffect } from './vehicles/VehicleExplosionEffect';
import { VehicleHealthBars } from './vehicles/VehicleHealthBars';
import { VehicleMotionTrailFX } from './vehicles/VehicleMotionTrailFX';
import { PlayerMachineGun } from './PlayerMachineGun';
import { Lightsaber } from './Lightsaber';
import { isTouchDevice } from '../utils/device';
import { getPerformanceProfile } from '../utils/performance';
import { useSettingsStore } from '../stores/useSettingsStore';

/** Three/R3Fとゲーム本体を、開始画面から遅延分割する描画境界。 */
export default function GameCanvas() {
  const isTouch = isTouchDevice();
  useSettingsStore((state) => state.graphicsPreset);
  useSettingsStore((state) => state.renderDistance);
  useSettingsStore((state) => state.shadowQuality);
  useSettingsStore((state) => state.resolutionScale);
  const performanceProfile = getPerformanceProfile();
  const premiumRendering = performanceProfile.tier === 'high' && !isTouch;
  const handleCanvasCreated = useCallback(({ gl, camera }: { gl: THREE.WebGLRenderer; camera: THREE.Camera }) => {
    if (typeof window === 'undefined') return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, performanceProfile.maxDpr));
    gl.setPixelRatio(dpr);
    gl.setSize(width, height, false);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }, [performanceProfile.maxDpr]);

  return (
    <div className="game-canvas-shell">
      <Canvas
        shadows={performanceProfile.shadowsEnabled
          ? { type: premiumRendering ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap }
          : false}
        camera={{ fov: isTouch ? 65 : 70, near: 0.1, far: performanceProfile.cameraFar }}
        dpr={[0.75, performanceProfile.maxDpr]}
        gl={{
          antialias: false,
          powerPreference: isTouch ? 'default' : 'high-performance',
          stencil: false,
          depth: true,
        }}
        onCreated={handleCanvasCreated}
        tabIndex={0}
        style={{ width: '100%', height: '100%', outline: 'none' }}
      >
        <AdaptiveGraphicsGovernor />
        <CanvasResolutionPipeline />
        <RendererColorPipeline />
        <SceneReflectionPipeline />
        <Suspense fallback={null}>
          <Environment />
          <AdaptiveStageVisuals />
          <StageConditionFX />
          <StageEventFX />
          <StageLandmarkBeaconFX />
          <StageModeFlowFX />
          <FunctionalBlockAuraFX />
          <ItemMasteryPulseFX />
          <World />
          <VegetationRenderer />
          <TorchRenderer />
          <BedRenderer />
          <DoorRenderer />
          <LadderRenderer />
          <CampfireRenderer />
          <CandleRenderer />
          <WheatSeedsRenderer />
          <LeverRenderer />
          <StairsRenderer />
          <NetherPortalRenderer />
          <TurretRenderer />
          <BlockLights />
          <Player />
          <BlockInteraction />
          <BuilderHeldItem />
          <BlockBreakEffect />
          <BlockUseEffect />
          <DamagePopup />
          <HitImpactEffect />
          <AllyMeleeAttackFX />
          <CombatExplosionFX />
          <MobDeathEffect />
          <RocketLauncher />
          <PlayerMachineGun />
          <Lightsaber />
          <GravityGlove />
          <BombSlinger />
          <DroppedItems />
          <MobManager />
          <Helicopter />
          <Tank />
          <Airplane />
          <Car />
          <MachineGun />
          <VehicleWeapons />
          <VehicleCombat />
          <VehicleMotionTrailFX />
          <VehicleExplosionEffect />
          <VehicleHealthBars />
          <RemotePlayers />
          <PlayerNameOverlay />
          <SoundManager />
          <RailRenderer />
          <CoasterCart />
          <WaterRenderer />
          <LavaRenderer />
          <LiquidSurfaceFX />
          <StageConditionSystem />
          <StageEventSystem />
          <StagePressureSystem />
          <GraphicsPostFX />
        </Suspense>
      </Canvas>
    </div>
  );
}
