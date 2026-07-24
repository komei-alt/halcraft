import { useCallback, useEffect, useRef, useState } from 'react';
import GameCanvas from './GameCanvas';
import { CockpitHUD } from './ui/CockpitHUD';
import { VehicleAimHUD } from './ui/VehicleAimHUD';
import { MinimapHUD } from './ui/MinimapHUD';
import { CoasterHUD } from './ui/CoasterHUD';
import { MultiplayerConnectionHUD } from './ui/MultiplayerConnectionHUD';
import { Crosshair } from './ui/Crosshair';
import { MachineGunScopeHUD } from './ui/MachineGunScopeHUD';
import { Hotbar } from './ui/Hotbar';
import { HealthBar } from './ui/HealthBar';
import { DamageOverlay } from './ui/DamageOverlay';
import { AttackIndicator } from './ui/AttackIndicator';
import { RocketCooldownIndicator } from './ui/RocketCooldownIndicator';
import { TimeDisplay } from './ui/TimeDisplay';
import { StageProgressHUD } from './ui/StageProgressHUD';
import { StageLandmarkMomentHUD } from './ui/StageLandmarkMomentHUD';
import { StageMasteryMomentHUD } from './ui/StageMasteryMomentHUD';
import { StageChallengeHUD } from './ui/StageChallengeHUD';
import { StageConditionHUD } from './ui/StageConditionHUD';
import { StageEventHUD } from './ui/StageEventHUD';
import { StagePressureHUD } from './ui/StagePressureHUD';
import { BossEncounterHUD } from './ui/BossEncounterHUD';
import { ModeFlowHUD } from './ui/ModeFlowHUD';
import { StageOpeningBriefing } from './ui/StageOpeningBriefing';
import { StageResultOverlay } from './ui/StageResultOverlay';
import { MasteryHUD } from './ui/MasteryHUD';
import { CombatFeedbackHUD } from './ui/CombatFeedbackHUD';
import { ProgressCelebration } from './ui/ProgressCelebration';
import { PauseScreen } from './ui/PauseScreen';
import { CraftingScreen } from './ui/CraftingScreen';
import { ToolHUD } from './ui/ToolHUD';
import { ArmorHUD } from './ui/ArmorHUD';
import { EffectIcons } from './ui/EffectIcons';
import { XPBar } from './ui/XPBar';
import { VoiceChatUI } from './ui/VoiceChatUI';
import { ControlsGuide } from './ui/ControlsGuide';
import { DesktopInputHint } from './ui/DesktopInputHint';
import { WeaponSwitchPopover } from './ui/WeaponSwitchPopover';
import { MobileControls } from './ui/mobile/MobileControls';
import { SkinSelector } from './ui/SkinSelector';
import { AirSupplyBar } from './ui/AirSupplyBar';
import { UnderwaterOverlay } from './ui/UnderwaterOverlay';
import { HungerBar } from './ui/HungerBar';
import { DialogueSubtitle } from './ui/DialogueSubtitle';
import { StageChallengeRewardSystem } from './StageChallengeRewardSystem';
import { DialogueDirector } from './DialogueDirector';
import { useVehicleStore, TANK_CONSTANTS, AIRPLANE_CONSTANTS, CAR_CONSTANTS } from '../stores/useVehicleStore';
import { useGameStore } from '../stores/useGameStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { AIRPLANE_SPAWN, CAR_SPAWN, HELIPORT_CENTER, TANK_SPAWN } from '../utils/terrain/constants';
import { getTerrainHeight } from '../utils/terrain/heightmap';
import { isTouchDevice } from '../utils/device';
import { activateDesktopGameplayInput } from '../utils/gameCanvas';
import { isNarrowGameplayHud } from '../utils/hudDensity';
import { getPerformanceProfile } from '../utils/performance';

interface GameExperienceProps {
  onOpenSettings: () => void;
}

const DEV_DIMENSION_OVERRIDE = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('dimension')
  : null;

/** ゲーム開始後にだけ読み込む3D本体＋HUD。 */
export default function GameExperience({ onOpenSettings }: GameExperienceProps) {
  const phase = useGameStore((state) => state.phase);
  const currentStageId = useGameStore((state) => state.currentStageId);
  const currentBiomeId = useGameStore((state) => state.currentBiome?.id ?? 'unknown');
  const dimension = useGameStore((state) => state.dimension);
  const isTouch = isTouchDevice();
  const hudDensity = useSettingsStore((state) => state.hudDensity);
  const graphicsPreset = useSettingsStore((state) => state.graphicsPreset);
  const showDetailedHud = hudDensity === 'detailed' && !isNarrowGameplayHud();
  const spawnHelicopter = useVehicleStore((state) => state.spawnHelicopter);
  const spawnTank = useVehicleStore((state) => state.spawnTank);
  const spawnAirplane = useVehicleStore((state) => state.spawnAirplane);
  const spawnCar = useVehicleStore((state) => state.spawnCar);
  const helicopterSpawned = useVehicleStore((state) => state.helicopter.spawned);
  const tankSpawned = useVehicleStore((state) => state.tank.spawned);
  const airplaneSpawned = useVehicleStore((state) => state.airplane.spawned);
  const carSpawned = useVehicleStore((state) => state.car.spawned);
  const togglePause = useGameStore((state) => state.togglePause);
  const [craftingOpen, setCraftingOpen] = useState(false);
  const [skinSelectorOpen, setSkinSelectorOpen] = useState(false);
  const autoPausedForSkin = useRef(false);

  useEffect(() => {
    const tier = getPerformanceProfile().tier;
    document.documentElement.setAttribute('data-hc-quality', tier);
    document.documentElement.setAttribute('data-hc-stage', currentStageId ?? 'sandbox');
    document.documentElement.setAttribute('data-hc-biome', currentBiomeId);
    document.documentElement.setAttribute('data-hc-dimension', dimension);
    return () => {
      document.documentElement.removeAttribute('data-hc-quality');
      document.documentElement.removeAttribute('data-hc-stage');
      document.documentElement.removeAttribute('data-hc-biome');
      document.documentElement.removeAttribute('data-hc-dimension');
    };
  }, [currentBiomeId, currentStageId, dimension, graphicsPreset]);

  // ポータル演出の画面検証だけを短縮する開発用入口。本番ビルドでは除去される。
  useEffect(() => {
    if (DEV_DIMENSION_OVERRIDE === 'nether') useGameStore.getState().travelToNether();
  }, []);

  useEffect(() => {
    if (phase === 'playing' && !helicopterSpawned) {
      const terrainY = getTerrainHeight(HELIPORT_CENTER.x, HELIPORT_CENTER.z);
      spawnHelicopter(HELIPORT_CENTER.x, terrainY + 2, HELIPORT_CENTER.z);
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
    airplaneSpawned,
    carSpawned,
    helicopterSpawned,
    phase,
    spawnAirplane,
    spawnCar,
    spawnHelicopter,
    spawnTank,
    tankSpawned,
  ]);

  const resumeSkinPause = useCallback(() => {
    if (autoPausedForSkin.current && useGameStore.getState().phase === 'paused') togglePause();
    autoPausedForSkin.current = false;
  }, [togglePause]);

  const toggleSkinSelector = useCallback(() => {
    setSkinSelectorOpen((open) => {
      const next = !open;
      if (next) {
        document.exitPointerLock?.();
        if (useGameStore.getState().phase === 'playing') {
          togglePause();
          autoPausedForSkin.current = true;
        }
      } else {
        resumeSkinPause();
        if (!isTouch) document.querySelector('canvas')?.requestPointerLock?.();
      }
      return next;
    });
  }, [isTouch, resumeSkinPause, togglePause]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      toggleSkinSelector();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSkinSelector]);

  const handleCloseSkinSelector = useCallback(() => {
    setSkinSelectorOpen(false);
    resumeSkinPause();
    if (!isTouch) activateDesktopGameplayInput();
  }, [isTouch, resumeSkinPause]);

  return (
    <>
      <GameCanvas />
      <Crosshair />
      <MachineGunScopeHUD />
      <Hotbar />
      <HealthBar />
      {showDetailedHud && <ToolHUD />}
      {showDetailedHud && <ArmorHUD />}
      <EffectIcons />
      <XPBar />
      <TimeDisplay />
      <StageProgressHUD />
      <StageLandmarkMomentHUD />
      <StageMasteryMomentHUD />
      {showDetailedHud && <StageChallengeHUD />}
      {showDetailedHud && <StageConditionHUD />}
      {showDetailedHud && <StageEventHUD />}
      {showDetailedHud && <StagePressureHUD />}
      <StageOpeningBriefing />
      <DialogueDirector />
      <DialogueSubtitle />
      <BossEncounterHUD />
      {showDetailedHud && <ModeFlowHUD />}
      <StageChallengeRewardSystem />
      <StageResultOverlay />
      {showDetailedHud && <MasteryHUD />}
      <CombatFeedbackHUD />
      <ProgressCelebration />
      <DamageOverlay />
      <AttackIndicator />
      <RocketCooldownIndicator />
      <WeaponSwitchPopover />
      <VehicleAimHUD />
      <CockpitHUD />
      <MinimapHUD />
      <CoasterHUD />
      <MultiplayerConnectionHUD />
      <AirSupplyBar />
      <HungerBar />
      <UnderwaterOverlay />
      <ControlsGuide />
      {!isTouch && <DesktopInputHint />}
      <VoiceChatUI />
      <CraftingScreen
        externalOpen={isTouch ? craftingOpen : undefined}
        onClose={() => setCraftingOpen(false)}
      />
      {isTouch && <MobileControls onOpenCrafting={() => setCraftingOpen(true)} />}
      <PauseScreen onOpenSettings={onOpenSettings} />
      {skinSelectorOpen && <SkinSelector overlay onClose={handleCloseSkinSelector} />}
    </>
  );
}
