// ブロック操作コンポーネント
// レイマーチングで照準先のブロックを検出し、左クリック=破壊/攻撃、右クリック=設置を行う
// モブが目の前にいる場合は攻撃が優先される
// デスクトップ（マウス）とモバイル（タッチ）両対応

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { usePlayerStore, MELEE_HIT_AT, MELEE_SWING_DURATION, type EquippedItem } from '../stores/usePlayerStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useDroppedItemStore } from '../stores/useDroppedItemStore';
import { useMobStore } from '../stores/useMobStore';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { useGameStore } from '../stores/useGameStore';
import { useExperienceStore } from '../stores/useExperienceStore';
import { useMasteryStore } from '../stores/useMasteryStore';
import { useStageChallengeStore } from '../stores/useStageChallengeStore';
import { useStageConditionStore } from '../stores/useStageConditionStore';
import { useStageBuildScoreStore } from '../stores/useStageBuildScoreStore';
import { useMiningFocusStore } from '../stores/useMiningFocusStore';
import {
  getBuildFocusMiningSpeedMultiplier,
  getBuildFocusPlacementIntervalMultiplier,
  type ModeFlowBuildPlacementResult,
  useModeFlowStore,
} from '../stores/useModeFlowStore';
import { useItemFeedbackStore } from '../stores/useItemFeedbackStore';
import { useFunctionalBlockStore } from '../stores/useFunctionalBlockStore';
import { BLOCK_IDS, BLOCK_DEFS, type BlockId } from '../types/blocks';
import { getMasteryBonus } from '../types/masteryPerks';
import { getMasteryTechniqueBonus } from '../types/masteryTechniquePerks';
import {
  getStageChallengeProgress,
  getStageChallenges,
  type StageChallengeDefinition,
} from '../types/stageChallenges';
import { isEffectiveTool, TOOL_DEFS, type ToolType } from '../types/tools';
import { isTouchDevice } from '../utils/device';
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';
import { consumeBreakBlock, consumePlaceBlock } from '../utils/touchInput';
import { spawnBlockBreakEffect, spawnBlockUseEffect, spawnDamagePopup, spawnHitImpactEffect } from '../utils/effectTriggers';
import {
  playMeleeSwingSound,
  playMeleeHitSound,
  playBlockBreakSound,
  playBlockPlaceSound,
  playInventoryEmptySound,
  playBlockUseFeedbackSound,
  playMiningBlockedSound,
} from '../utils/sounds';
import { getMobHitbox, getMobHitboxMaxY, getMobHitboxMinY } from '../utils/mobHitboxes';
import { triggerTntExplosion } from '../utils/tntExplosion';
import {
  getBlockUseProfile,
  type BlockUseFeedbackContent,
  type BlockUseFeedbackContext,
} from '../utils/blockUseFeedback';

/** ブロック操作のリーチ距離 */
const REACH = 6;
/** レイマーチングのステップ数（多いほど精度が高い） */
const RAY_STEPS = 120;
/** レイマーチングのステップ間隔 */
const STEP_SIZE = REACH / RAY_STEPS;
/** モブへの攻撃リーチ */
const ATTACK_REACH = 3.5;
/** 攻撃ダメージ */
const ATTACK_DAMAGE = 3;
/** プレイヤーへの攻撃ダメージ */
const PVP_DAMAGE = 3;
/** 連続設置の間隔（秒） — Minecraft は約 4tick = 200ms。誤連射を避けるため少し長めに余裕を持たせる */
const PLACE_INTERVAL = 0.25;
/** 右クリック押下から連続設置が始まるまでの初動待機（秒）。単発クリックで複数置かないためのガード */
const PLACE_INITIAL_DELAY = 0.32;
/** 採掘HUD更新の最短間隔（毎フレームUI更新しないため） */
const MINING_FOCUS_PUBLISH_INTERVAL_MS = 120;
/** プレイヤーの当たり判定サイズ */
const PLAYER_HIT_RADIUS = 0.5;
const PLAYER_HIT_HEIGHT = 1.7;
/** プレイヤー体AABBの高さ（ブロック設置衝突チェック用） */
const PLACE_PLAYER_HEIGHT = 1.7;

interface TargetBlock {
  /** 照準先のブロック座標 */
  x: number;
  y: number;
  z: number;
  /** 設置先（照準ブロックの隣接面） */
  placeX: number;
  placeY: number;
  placeZ: number;
  /** 設置先が有効かどうか */
  hasPlaceTarget: boolean;
  /** カメラからヒットしたブロックまでの距離 */
  distance: number;
}

/** ブロック破壊の進行状態 */
interface BreakProgress {
  x: number;
  y: number;
  z: number;
  blockId: BlockId;
  /** 現在の破壊進行度（0〜1） */
  progress: number;
  /** そのブロックの硬さ（秒） */
  hardness: number;
}

interface BlockBreakBlocker {
  reason: 'unbreakable' | 'tool-tier';
  requiredTier: number;
  playerTier: number;
}

interface TargetPlayer {
  id: string;
  x: number;
  y: number;
  z: number;
  distance: number;
}

interface TargetMob {
  id: string;
  x: number;
  y: number;
  z: number;
  hitY: number;
  distance: number;
}

interface SpecialPlacementResult extends BlockUseFeedbackContext {
  detonatedCount?: number;
  spawnedIronGolem?: boolean;
}

interface ChestLootItem {
  blockId: BlockId;
  count: number;
}

interface SmeltResult {
  sourceBlockId: BlockId;
  resultBlockId: BlockId;
  count: number;
}

/** ブロック操作プレビュー用の共有ジオメトリ */
const highlightGeometry = new THREE.BoxGeometry(1.012, 1.012, 1.012);
const placementGhostGeometry = new THREE.BoxGeometry(0.86, 0.86, 0.86);
const highlightEdgeGeometry = new THREE.EdgesGeometry(highlightGeometry, 15);
const placementEdgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.98, 0.98), 15);
const placementRingGeometry = new THREE.RingGeometry(0.34, 0.5, 48);
const breakProgressEdgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.035, 1.035, 1.035), 15);
const breakProgressHaloGeometry = new THREE.BoxGeometry(1.018, 1.018, 1.018);
const breakProgressRingGeometry = new THREE.RingGeometry(0.42, 0.51, 64);
const PLACEMENT_INVALID_COLOR = '#ff5f6d';
const TARGET_OUTLINE_COLOR = '#ffffff';

const INTERACTIVE_PASS_THROUGH_BLOCKS = new Set<BlockId>([
  BLOCK_IDS.BED,
  BLOCK_IDS.DOOR,
  BLOCK_IDS.LEVER,
  BLOCK_IDS.NETHER_PORTAL,
]);

const TOOL_TIER_LABELS: Record<number, string> = {
  0: '素手',
  1: '木の道具',
  2: '石の道具',
  3: '鉄の道具',
  4: 'ダイヤの道具',
};

function getToolTierLabel(tier: number): string {
  const safeTier = Math.max(0, Math.min(4, Math.floor(tier)));
  return TOOL_TIER_LABELS[safeTier] ?? '上位の道具';
}

function getBlockShortName(blockId: BlockId): string {
  return (BLOCK_DEFS[blockId]?.name ?? 'このブロック').replace('ブロック', '');
}

function getBlockProgressColor(blockId: BlockId): THREE.Color {
  const def = BLOCK_DEFS[blockId];
  if (def?.emissiveColor) return def.emissiveColor.clone();
  if (def?.blockCategory === 'ore') return new THREE.Color('#ffe082');
  if (def?.blockCategory === 'wood') return new THREE.Color('#d79a55');
  if (def?.blockCategory === 'dirt') return new THREE.Color('#99dd66');
  if (blockId === BLOCK_IDS.SAND) return new THREE.Color('#ffd66e');
  if (blockId === BLOCK_IDS.SNOW || blockId === BLOCK_IDS.GLASS) return new THREE.Color('#c9f3ff');
  if (blockId === BLOCK_IDS.NETHERRACK || blockId === BLOCK_IDS.SOUL_SAND) return new THREE.Color('#d66a8f');
  return new THREE.Color('#f1f5ff');
}

function createBreakCrackGeometry(): THREE.BufferGeometry {
  const segments: number[] = [];
  const add = (a: [number, number, number], b: [number, number, number]) => {
    segments.push(...a, ...b);
  };

  const surface = 0.522;
  const faceCracks: Array<Array<[[number, number], [number, number]]>> = [
    [
      [[-0.42, -0.16], [-0.18, 0.02]],
      [[-0.18, 0.02], [0.02, -0.08]],
      [[0.02, -0.08], [0.28, 0.17]],
      [[-0.08, 0.0], [-0.18, 0.28]],
      [[0.1, -0.02], [0.36, -0.22]],
    ],
    [
      [[-0.34, 0.24], [-0.1, 0.04]],
      [[-0.1, 0.04], [0.18, 0.14]],
      [[0.18, 0.14], [0.38, -0.12]],
      [[0.02, 0.08], [-0.14, -0.24]],
    ],
  ];

  for (const [faceIndex, cracks] of faceCracks.entries()) {
    const z = faceIndex === 0 ? surface : -surface;
    for (const [a, b] of cracks) add([a[0], a[1], z], [b[0], b[1], z]);
  }

  for (const cracks of faceCracks) {
    for (const [a, b] of cracks) {
      add([surface, a[0], a[1]], [surface, b[0], b[1]]);
      add([-surface, a[0], -a[1]], [-surface, b[0], -b[1]]);
      add([a[0], surface, a[1]], [b[0], surface, b[1]]);
      add([a[0], -surface, -a[1]], [b[0], -surface, -b[1]]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  return geometry;
}

const breakCrackGeometry = createBreakCrackGeometry();

function getBlockBreakBlocker(blockId: BlockId, isBuildMode: boolean, playerTier: number): BlockBreakBlocker | null {
  const def = BLOCK_DEFS[blockId];
  if (def?.unbreakable) {
    return { reason: 'unbreakable', requiredTier: 0, playerTier };
  }

  const requiredTier = def?.minToolTier ?? 0;
  if (!isBuildMode && requiredTier > 0 && playerTier < requiredTier) {
    return { reason: 'tool-tier', requiredTier, playerTier };
  }

  return null;
}

function isEffectiveMiningTool(toolType: ToolType | null, blockCategory?: string): boolean {
  if (!toolType || !blockCategory) return false;
  return isEffectiveTool(toolType, blockCategory) || (toolType === 'pickaxe' && blockCategory === 'ore');
}

function getChestLoot(stageId: string | null, isBuildModeStage: boolean): ChestLootItem[] {
  if (stageId === 'build-forest') {
    return [
      { blockId: BLOCK_IDS.WOOD, count: 14 },
      { blockId: BLOCK_IDS.LEAVES, count: 10 },
      { blockId: BLOCK_IDS.TORCH, count: 4 },
    ];
  }
  if (stageId === 'build-tropical') {
    return [
      { blockId: BLOCK_IDS.GLASS, count: 10 },
      { blockId: BLOCK_IDS.WATER, count: 4 },
      { blockId: BLOCK_IDS.ELECTRIC, count: 2 },
    ];
  }
  if (stageId === 'build-snow') {
    return [
      { blockId: BLOCK_IDS.SNOW, count: 14 },
      { blockId: BLOCK_IDS.GLASS, count: 8 },
      { blockId: BLOCK_IDS.GLOWSTONE, count: 2 },
    ];
  }
  if (stageId === 'build-desert') {
    return [
      { blockId: BLOCK_IDS.SAND, count: 18 },
      { blockId: BLOCK_IDS.STONE, count: 8 },
      { blockId: BLOCK_IDS.WATER, count: 3 },
    ];
  }
  if (isBuildModeStage) {
    return [
      { blockId: BLOCK_IDS.WOOD, count: 10 },
      { blockId: BLOCK_IDS.GLASS, count: 6 },
      { blockId: BLOCK_IDS.TORCH, count: 4 },
    ];
  }
  return [
    { blockId: BLOCK_IDS.TNT, count: 2 },
    { blockId: BLOCK_IDS.IRON_INGOT, count: 4 },
    { blockId: BLOCK_IDS.TORCH, count: 5 },
  ];
}

function formatBlockList(items: ChestLootItem[] | SmeltResult[]): string {
  return items
    .map((item) => {
      const blockId = 'blockId' in item ? item.blockId : item.resultBlockId;
      return `${BLOCK_DEFS[blockId]?.name ?? '素材'} x${item.count}`;
    })
    .join(' / ');
}

function getBuilderMasteryBonus() {
  const level = useMasteryStore.getState().items.builder?.level ?? 1;
  return getMasteryBonus('builder', level);
}

function getBuilderTechniqueBonus() {
  return getMasteryTechniqueBonus('builder', useMasteryStore.getState().items.builder);
}

function isPlacementChallengeMatch(challenge: StageChallengeDefinition, blockId: BlockId): boolean {
  if (challenge.metric === 'block_group_placed') return Boolean(challenge.blockIds?.includes(blockId));
  return challenge.metric === 'blocks_placed';
}

function pickPlacementChallenge(
  challenges: StageChallengeDefinition[],
  blockId: BlockId,
  completedIds: string[],
): StageChallengeDefinition | null {
  const directGroup = challenges.find((challenge) => (
    challenge.metric === 'block_group_placed'
    && challenge.blockIds?.includes(blockId)
    && !completedIds.includes(challenge.id)
  ));
  if (directGroup) return directGroup;

  const anyGroup = challenges.find((challenge) => (
    challenge.metric === 'block_group_placed'
    && challenge.blockIds?.includes(blockId)
  ));
  if (anyGroup) return anyGroup;

  const genericPlacement = challenges.find((challenge) => (
    isPlacementChallengeMatch(challenge, blockId)
    && !completedIds.includes(challenge.id)
  ));
  return genericPlacement ?? challenges.find((challenge) => isPlacementChallengeMatch(challenge, blockId)) ?? null;
}

interface BlockHighlightProps {
  target: TargetBlock | null;
  selectedBlock: BlockId;
  selectedCount: number;
  currentStageId: string | null;
  equippedItem: EquippedItem;
  canPlace: boolean;
}

/** ブロック選択・設置プレビューの表示 */
function BlockHighlight({
  target,
  selectedBlock,
  selectedCount,
  currentStageId,
  equippedItem,
  canPlace,
}: BlockHighlightProps) {
  const outlineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const ghostMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const placementEdgeMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const pulseTimeRef = useRef(0);
  const blockProfile = useMemo(
    () => getBlockUseProfile(selectedBlock, currentStageId),
    [currentStageId, selectedBlock],
  );
  const hasStock = selectedCount > 0;
  const isPlacementReady = canPlace && hasStock;
  const previewColor = useMemo(
    () => new THREE.Color(isPlacementReady || !target?.hasPlaceTarget ? blockProfile.accent : PLACEMENT_INVALID_COLOR),
    [blockProfile.accent, isPlacementReady, target?.hasPlaceTarget],
  );
  const targetOutlineColor = useMemo(
    () => new THREE.Color(equippedItem === 'builder' ? previewColor : TARGET_OUTLINE_COLOR),
    [equippedItem, previewColor],
  );
  const showPlacementPreview = equippedItem === 'builder' && Boolean(target?.hasPlaceTarget);

  useFrame((_, delta) => {
    pulseTimeRef.current += delta;
    const wave = (Math.sin(pulseTimeRef.current * 5.2) + 1) * 0.5;
    if (outlineMaterialRef.current) {
      outlineMaterialRef.current.opacity = equippedItem === 'builder' ? 0.42 + wave * 0.14 : 0.3 + wave * 0.08;
    }
    if (ghostMaterialRef.current) {
      ghostMaterialRef.current.opacity = isPlacementReady ? 0.16 + wave * 0.07 : 0.06 + wave * 0.03;
    }
    if (placementEdgeMaterialRef.current) {
      placementEdgeMaterialRef.current.opacity = isPlacementReady ? 0.7 + wave * 0.18 : 0.32 + wave * 0.12;
    }
    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = isPlacementReady ? 0.48 + wave * 0.22 : 0.24 + wave * 0.12;
    }
  });

  if (!target) return null;

  return (
    <group>
      <lineSegments
        position={[target.x + 0.5, target.y + 0.5, target.z + 0.5]}
        geometry={highlightEdgeGeometry}
        renderOrder={210}
      >
        <lineBasicMaterial
          ref={outlineMaterialRef}
          color={targetOutlineColor}
          transparent
          opacity={equippedItem === 'builder' ? 0.58 : 0.42}
          depthTest
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </lineSegments>
      {showPlacementPreview && (
        <group position={[target.placeX + 0.5, target.placeY + 0.5, target.placeZ + 0.5]}>
          <mesh
            geometry={placementGhostGeometry}
            renderOrder={208}
            scale={isPlacementReady ? 1 : 0.9}
          >
            <meshBasicMaterial
              ref={ghostMaterialRef}
              color={previewColor}
              transparent
              opacity={isPlacementReady ? 0.2 : 0.08}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
          <lineSegments
            geometry={placementEdgeGeometry}
            renderOrder={211}
            scale={isPlacementReady ? 1.02 : 0.92}
          >
            <lineBasicMaterial
              ref={placementEdgeMaterialRef}
              color={previewColor}
              transparent
              opacity={isPlacementReady ? 0.72 : 0.32}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </lineSegments>
          <mesh
            position={[0, -0.48, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            geometry={placementRingGeometry}
            renderOrder={212}
            scale={isPlacementReady ? 1.04 : 0.86}
          >
            <meshBasicMaterial
              ref={ringMaterialRef}
              color={previewColor}
              transparent
              opacity={isPlacementReady ? 0.58 : 0.28}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

/** ブロック破壊の進行度表示（ひび割れオーバーレイ） */
function BlockBreakProgressOverlay({ breakProgress }: { breakProgress: BreakProgress | null }) {
  const crackMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const edgeMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const ringGroupRef = useRef<THREE.Group | null>(null);
  const timeRef = useRef(0);

  const progress = Math.max(0, Math.min(1, breakProgress?.progress ?? 0));
  const progressColor = useMemo(
    () => getBlockProgressColor(breakProgress?.blockId ?? BLOCK_IDS.STONE),
    [breakProgress?.blockId],
  );

  useFrame((_, delta) => {
    timeRef.current += delta;
    const wave = (Math.sin(timeRef.current * 9.2) + 1) * 0.5;
    const intensity = Math.max(0.08, progress);
    if (crackMaterialRef.current) {
      crackMaterialRef.current.opacity = 0.22 + intensity * 0.7 + wave * 0.1;
    }
    if (edgeMaterialRef.current) {
      edgeMaterialRef.current.opacity = 0.26 + intensity * 0.58 + wave * 0.12;
    }
    if (haloMaterialRef.current) {
      haloMaterialRef.current.opacity = 0.08 + intensity * 0.24 + wave * 0.05;
    }
    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = 0.24 + intensity * 0.52 + wave * 0.12;
    }
    if (ringGroupRef.current) {
      ringGroupRef.current.rotation.y = timeRef.current * 0.42;
      ringGroupRef.current.rotation.z = Math.sin(timeRef.current * 1.6) * 0.08;
    }
  });

  if (!breakProgress || progress <= 0) return null;

  const scale = 0.72 + progress * 0.36;
  const ringScale = 0.8 + progress * 0.62;
  return (
    <group
      position={[
        breakProgress.x + 0.5,
        breakProgress.y + 0.5,
        breakProgress.z + 0.5,
      ]}
    >
      <mesh geometry={breakProgressHaloGeometry} renderOrder={215}>
        <meshBasicMaterial
          ref={haloMaterialRef}
          color={progressColor}
          transparent
          opacity={0.12 + progress * 0.16}
          depthTest
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <lineSegments geometry={breakProgressEdgeGeometry} renderOrder={218}>
        <lineBasicMaterial
          ref={edgeMaterialRef}
          color={progressColor}
          transparent
          opacity={0.3 + progress * 0.44}
          depthTest
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </lineSegments>
      <lineSegments geometry={breakCrackGeometry} scale={scale} renderOrder={219}>
        <lineBasicMaterial
          ref={crackMaterialRef}
          color={progressColor}
          transparent
          opacity={0.28 + progress * 0.54}
          depthTest
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </lineSegments>
      <group ref={ringGroupRef} scale={ringScale}>
        {[
          { key: 'front', rotation: [0, 0, 0] as [number, number, number] },
          { key: 'side', rotation: [0, Math.PI / 2, 0] as [number, number, number] },
          { key: 'top', rotation: [Math.PI / 2, 0, 0] as [number, number, number] },
        ].map((ring) => (
          <mesh
            key={ring.key}
            geometry={breakProgressRingGeometry}
            rotation={ring.rotation}
            renderOrder={217}
          >
            <meshBasicMaterial
              ref={ring.key === 'front' ? ringMaterialRef : undefined}
              color={progressColor}
              transparent
              opacity={0.24 + progress * 0.32}
              depthTest
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function BlockInteraction() {
  const { camera } = useThree();
  const getBlock = useWorldStore((s) => s.getBlock);
  const breakBlock = useWorldStore((s) => s.breakBlock);
  const setBlock = useWorldStore((s) => s.setBlock);
  const getSelectedBlock = usePlayerStore((s) => s.getSelectedBlock);
  const inventoryItems = useInventoryStore((s) => s.items);
  const dropItem = useDroppedItemStore((s) => s.dropItem);
  const damageMob = useMobStore((s) => s.damageMob);
  const spawnMob = useMobStore((s) => s.spawnMob);
  const performAttack = usePlayerStore((s) => s.performAttack);
  const sendBlockBreak = useMultiplayerStore((s) => s.sendBlockBreak);
  const sendBlockPlace = useMultiplayerStore((s) => s.sendBlockPlace);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isBuildMode = useGameStore((s) => s.isBuildMode);
  const currentStageId = useGameStore((s) => s.currentStageId);
  const recordBuilderAction = useMasteryStore((s) => s.recordBuilderAction);
  const recordItemHit = useMasteryStore((s) => s.recordItemHit);
  const recordStageBlockPlace = useStageChallengeStore((s) => s.recordBlockPlace);
  const recordStageBlockBreak = useStageChallengeStore((s) => s.recordBlockBreak);
  const recordConditionBlockPlace = useStageConditionStore((s) => s.recordBlockPlace);
  const recordConditionDetonation = useStageConditionStore((s) => s.recordDetonation);

  // 設置先ブロックがプレイヤーの体と重なるかチェック
  // マージン0.1を追加して浮動小数点の境界ケースを確実にガード
  const wouldBlockOverlapPlayer = useCallback((bx: number, by: number, bz: number): boolean => {
    const px = camera.position.x;
    // camera.position.y = pos.y + 1.6 なので、足元は camera.y - 1.6
    const footY = camera.position.y - 1.6;
    const pz = camera.position.z;

    // マージン付きプレイヤーAABB（実際のPLAYER_RADIUSに近い値に設定）
    const margin = 0.05;
    const radius = 0.3; // PLAYER_RADIUS(0.25)に近い値
    const pMinX = px - radius - margin;
    const pMaxX = px + radius + margin;
    const pMinY = footY - margin;
    const pMaxY = footY + PLACE_PLAYER_HEIGHT + margin;
    const pMinZ = pz - radius - margin;
    const pMaxZ = pz + radius + margin;

    // ブロックAABB
    const bMinX = bx;
    const bMaxX = bx + 1;
    const bMinY = by;
    const bMaxY = by + 1;
    const bMinZ = bz;
    const bMaxZ = bz + 1;

    // AABB重なり判定
    return (
      pMaxX > bMinX && pMinX < bMaxX &&
      pMaxY > bMinY && pMinY < bMaxY &&
      pMaxZ > bMinZ && pMinZ < bMaxZ
    );
  }, [camera]);

  const [target, setTarget] = useState<TargetBlock | null>(null);
  const targetRef = useRef<TargetBlock | null>(null);
  const selectedBlock = usePlayerStore((s) => s.getSelectedBlock());
  const selectedCount = inventoryItems[selectedBlock] ?? 0;
  const canPlaceAtTarget = Boolean(
    target?.hasPlaceTarget
    && equippedItem === 'builder'
    && selectedCount > 0
    && getBlock(target.placeX, target.placeY, target.placeZ) === BLOCK_IDS.AIR
    && !wouldBlockOverlapPlayer(target.placeX, target.placeY, target.placeZ),
  );

  // タッチデバイス判定（初回のみ）
  const isTouch = useRef(isTouchDevice());

  // 再利用用ベクトル（GCプレッシャー削減）
  const rayDir = useRef(new THREE.Vector3());
  const rayOrigin = useRef(new THREE.Vector3());
  const attackDir = useRef(new THREE.Vector3());
  const tempOrigin = useRef(new THREE.Vector3());
  const tempToTarget = useRef(new THREE.Vector3());
  const tempClosest = useRef(new THREE.Vector3());

  // ブロック破壊の進行状態
  const breakProgressRef = useRef<BreakProgress | null>(null);
  const [breakProgressState, setBreakProgressState] = useState<BreakProgress | null>(null);
  // 左クリック押しっぱなし状態
  const isBreakingRef = useRef(false);
  // 右クリック押しっぱなし状態（連続設置用）
  const isPlacingRef = useRef(false);
  // 連続設置のクールダウンタイマー
  const placeTimerRef = useRef(0);
  // 連続設置がリピート段階に入ったか（初動待機の判定用）
  const placeRepeatStartedRef = useRef(false);
  // 直前に設置した座標（同じ座標に二重設置しない）
  const lastPlacedRef = useRef<string>('');
  const miningFocusKeyRef = useRef('');
  const lastMiningFocusPublishAt = useRef(0);

  const publishMiningFocus = useCallback((found: TargetBlock | null): void => {
    const playerState = usePlayerStore.getState();
    const shouldShow = !isBuildMode
      && !playerState.isDead
      && !useVehicleStore.getState().isInVehicle()
      && found !== null;

    if (!shouldShow || !found) {
      if (miningFocusKeyRef.current) {
        miningFocusKeyRef.current = '';
        useMiningFocusStore.getState().clearTarget();
      }
      return;
    }

    const blockId = getBlock(found.x, found.y, found.z);
    const def = BLOCK_DEFS[blockId];
    if (!def || def.isLiquid || def.noCollision) {
      if (miningFocusKeyRef.current) {
        miningFocusKeyRef.current = '';
        useMiningFocusStore.getState().clearTarget();
      }
      return;
    }

    const equippedToolId = playerState.equippedToolId;
    const equippedTool = equippedToolId ? TOOL_DEFS[equippedToolId] : undefined;
    const blockCategory = def.blockCategory ?? null;
    const playerTier = playerState.getToolTierLevel();
    const blocker = getBlockBreakBlocker(blockId, isBuildMode, playerTier);
    const miningSpeed = playerState.getMiningSpeed(def.blockCategory)
      * getBuilderMasteryBonus().miningSpeedMultiplier
      * getBuilderTechniqueBonus().builderMiningSpeedMultiplier
      * getBuildFocusMiningSpeedMultiplier();
    const bp = breakProgressRef.current;
    const progress = bp && bp.x === found.x && bp.y === found.y && bp.z === found.z
      ? Math.max(0, Math.min(1, bp.progress))
      : 0;
    const progressBucket = Math.round(progress * 100);
    const speedBucket = Math.round(miningSpeed * 10);
    const key = [
      blockId,
      found.x,
      found.y,
      found.z,
      progressBucket,
      equippedToolId ?? 'hand',
      playerTier,
      blocker?.reason ?? 'ok',
      speedBucket,
    ].join(':');
    const now = performance.now();
    if (
      key === miningFocusKeyRef.current &&
      now - lastMiningFocusPublishAt.current < MINING_FOCUS_PUBLISH_INTERVAL_MS
    ) {
      return;
    }

    miningFocusKeyRef.current = key;
    lastMiningFocusPublishAt.current = now;
    useMiningFocusStore.getState().setTarget({
      blockId,
      blockName: getBlockShortName(blockId),
      x: found.x,
      y: found.y,
      z: found.z,
      progress,
      hardness: isBuildMode ? 0 : (def.hardness ?? 0.5),
      canBreak: blocker === null,
      blockerReason: blocker?.reason ?? null,
      requiredTier: blocker?.requiredTier ?? (def.minToolTier ?? 0),
      playerTier,
      miningSpeed,
      effective: isEffectiveMiningTool(equippedTool?.type ?? null, blockCategory ?? undefined),
      blockCategory,
      equippedToolId,
      equippedToolName: equippedTool?.name ?? '素手',
      equippedToolType: equippedTool?.type ?? null,
      updatedAt: now,
    });
  }, [getBlock, isBuildMode]);

  useEffect(() => () => {
    useMiningFocusStore.getState().clearTarget();
  }, []);

  // 照準先のリモートプレイヤーを検索
  const getAttackDistanceLimit = useCallback((): number => {
    const blockTarget = targetRef.current;
    if (!blockTarget) return ATTACK_REACH;
    return Math.min(ATTACK_REACH, Math.max(0, blockTarget.distance - 0.05));
  }, []);

  const findTargetPlayer = useCallback((maxDistance = ATTACK_REACH): TargetPlayer | null => {
    const multiState = useMultiplayerStore.getState();
    if (!multiState.connected) return null;

    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dir = attackDir.current;
    tempOrigin.current.copy(camera.position);
    const origin = tempOrigin.current;
    const remotePlayers = multiState.remotePlayers;

    let closestPlayer: TargetPlayer | null = null;
    let closestDist = Math.min(ATTACK_REACH, maxDistance);

    for (const [, player] of remotePlayers) {
      tempToTarget.current.set(
        player.position[0] - origin.x,
        player.position[1] + PLAYER_HIT_HEIGHT * 0.5 - origin.y,
        player.position[2] - origin.z,
      );

      const projection = tempToTarget.current.dot(dir);
      if (projection < 0 || projection > ATTACK_REACH) continue;

      tempClosest.current.copy(origin).addScaledVector(dir, projection);
      const targetX = origin.x + tempToTarget.current.x;
      const targetY = origin.y + tempToTarget.current.y;
      const targetZ = origin.z + tempToTarget.current.z;
      const dx = tempClosest.current.x - targetX;
      const dy = tempClosest.current.y - targetY;
      const dz = tempClosest.current.z - targetZ;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < PLAYER_HIT_RADIUS + 0.3 && projection < closestDist) {
        closestDist = projection;
        closestPlayer = {
          id: player.id,
          x: targetX,
          y: targetY,
          z: targetZ,
          distance: projection,
        };
      }
    }

    return closestPlayer;
  }, [camera]);

  // 照準先のモブを検索（データごと返す版）
  const findTargetMobData = useCallback((maxDistance = ATTACK_REACH): TargetMob | null => {
    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const dir = attackDir.current;
    tempOrigin.current.copy(camera.position);
    const origin = tempOrigin.current;
    const mobs = useMobStore.getState().mobs;

    let closestMob: TargetMob | null = null;
    let closestDist = Math.min(ATTACK_REACH, maxDistance);

    for (const mob of mobs) {
      // ニワトリは攻撃対象外（中立パッシブ）。味方モブはフレンドリーファイヤー可能
      if (mob.type === 'chicken') continue;

      const hitbox = getMobHitbox(mob.type);
      const minY = getMobHitboxMinY(mob.y, hitbox);
      const maxY = getMobHitboxMaxY(mob.y, hitbox);
      const centerY = mob.y + hitbox.height * 0.5;

      tempToTarget.current.set(mob.x - origin.x, centerY - origin.y, mob.z - origin.z);
      const projection = tempToTarget.current.dot(dir);
      if (projection < 0 || projection > closestDist) continue;

      tempClosest.current.copy(origin).addScaledVector(dir, projection);
      const dx = tempClosest.current.x - mob.x;
      const hitY = Math.max(minY, Math.min(maxY, tempClosest.current.y));
      const dy = tempClosest.current.y - hitY;
      const dz = tempClosest.current.z - mob.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < hitbox.radius && projection < closestDist) {
        closestDist = projection;
        closestMob = { id: mob.id, x: mob.x, y: mob.y, z: mob.z, hitY, distance: projection };
      }
    }

    return closestMob;
  }, [camera]);

  const emitBlockUseFeedback = useCallback((
    blockId: BlockId,
    x: number,
    y: number,
    z: number,
    context: BlockUseFeedbackContext = {},
  ) => {
    const feedback = useItemFeedbackStore.getState().emitBlockUseFeedback(
      blockId,
      useGameStore.getState().currentStageId,
      context,
    );
    if (!feedback) return;
    spawnBlockUseEffect(feedback.kind, x, y, z, feedback.accent);
    playBlockUseFeedbackSound(feedback.soundKind);
  }, []);

  const emitFunctionalFeedback = useCallback((
    blockId: BlockId,
    x: number,
    y: number,
    z: number,
    feedback: BlockUseFeedbackContent,
    rateLimitMs = 500,
  ) => {
    const emitted = useItemFeedbackStore.getState().emitFeedback(blockId, feedback, {
      rateLimitKey: `functional:${x},${y},${z}:${feedback.kind}:${feedback.title}`,
      rateLimitMs,
    });
    if (!emitted) return;
    spawnBlockUseEffect(emitted.kind, x, y, z, emitted.accent);
    playBlockUseFeedbackSound(emitted.soundKind);
  }, []);

  const emitMiningBlockedFeedback = useCallback((
    blockId: BlockId,
    x: number,
    y: number,
    z: number,
    blocker: BlockBreakBlocker,
  ) => {
    const blockName = getBlockShortName(blockId);
    const feedback: BlockUseFeedbackContent = blocker.reason === 'unbreakable'
      ? {
          icon: '🛡️',
          eyebrow: '破壊できない',
          title: `${blockName}は守られている`,
          detail: 'このブロックは壊せない。道や拠点は別の素材で広げよう。',
          accent: '#cfd8dc',
          glow: 'rgba(190, 210, 220, 0.28)',
          kind: 'defense',
          soundKind: 'defense',
        }
      : {
          icon: '⛏️',
          eyebrow: '道具が足りない',
          title: `${getToolTierLabel(blocker.requiredTier)}以上が必要`,
          detail: `${blockName}は${getToolTierLabel(blocker.requiredTier)}で掘れる。いまは${getToolTierLabel(blocker.playerTier)}。`,
          accent: '#ffd166',
          glow: 'rgba(255, 190, 90, 0.32)',
          kind: 'utility',
          soundKind: 'utility',
        };

    const emitted = useItemFeedbackStore.getState().emitFeedback(blockId, feedback, {
      rateLimitKey: `mining-blocked:${blocker.reason}:${x},${y},${z}:${blocker.requiredTier}:${blocker.playerTier}`,
      rateLimitMs: blocker.reason === 'unbreakable' ? 1200 : 900,
    });
    if (!emitted) return;

    spawnBlockUseEffect(emitted.kind, x, y, z, emitted.accent);
    playMiningBlockedSound();
  }, []);

  const recordBlockBreakMastery = useCallback((blockId: BlockId) => {
    const def = BLOCK_DEFS[blockId];
    recordBuilderAction(def?.blockCategory === 'ore' ? 'mine_ore' : 'block_break');
    if (def?.explosive) {
      recordBuilderAction('detonate');
      recordConditionDetonation();
    }
    recordStageBlockBreak(blockId, {
      isOre: def?.blockCategory === 'ore',
      isExplosive: Boolean(def?.explosive),
    });
  }, [recordBuilderAction, recordConditionDetonation, recordStageBlockBreak]);

  const recordBlockPlaceMastery = useCallback((blockId: BlockId): ModeFlowBuildPlacementResult | null => {
    recordBuilderAction(blockId === BLOCK_IDS.SPAWNER ? 'summon' : 'block_place');
    recordStageBlockPlace(blockId);
    recordConditionBlockPlace(blockId);
    const buildFocusResult = useModeFlowStore.getState().recordBuildBlockPlace(blockId);
    useStageBuildScoreStore.getState().recordBlockPlace(blockId, buildFocusResult);
    return buildFocusResult;
  }, [recordBuilderAction, recordConditionBlockPlace, recordStageBlockPlace]);

  const getPlacementChallengeProgressContext = useCallback((blockId: BlockId): BlockUseFeedbackContext['stageChallengeProgress'] => {
    const challengeState = useStageChallengeStore.getState();
    const challenge = pickPlacementChallenge(
      getStageChallenges(challengeState.currentStageId),
      blockId,
      challengeState.completedIds,
    );
    if (!challenge) return undefined;

    const progress = getStageChallengeProgress(challenge, challengeState.stats);
    return {
      icon: challenge.icon,
      title: challenge.title,
      current: progress.current,
      target: progress.target,
      completed: progress.completed || challengeState.completedIds.includes(challenge.id),
    };
  }, []);

  const emitInventoryEmptyFeedback = useCallback((
    blockId: BlockId,
    x: number,
    y: number,
    z: number,
  ) => {
    const game = useGameStore.getState();
    const stageProgress = getPlacementChallengeProgressContext(blockId);
    const blockName = getBlockShortName(blockId);
    const modeHint = game.currentStage?.category === 'war'
      ? '補給箱・戦意発動・敵撃破報酬で立て直そう'
      : '補給箱・マップイベント・ひらめき発動で素材を増やそう';
    const progressHint = stageProgress
      ? `${stageProgress.icon} ${stageProgress.title}: ${stageProgress.completed ? 'CLEAR' : `${Math.min(stageProgress.current, stageProgress.target)}/${stageProgress.target}`}`
      : '別の素材に切り替えるか補給を探そう';

    const emitted = useItemFeedbackStore.getState().emitFeedback(blockId, {
      icon: '🎒',
      eyebrow: '素材切れ',
      title: `${blockName}が足りない`,
      detail: `${progressHint} / ${modeHint}`,
      accent: '#ffd166',
      glow: 'rgba(255, 190, 90, 0.32)',
      kind: 'utility',
      soundKind: 'utility',
    }, {
      rateLimitKey: `inventory-empty:${game.currentStageId ?? 'none'}:${blockId}`,
      rateLimitMs: 950,
    });
    if (!emitted) return;
    spawnBlockUseEffect(emitted.kind, x, y, z, emitted.accent);
  }, [getPlacementChallengeProgressContext]);

  const detonateExplosiveBlock = useCallback((x: number, y: number, z: number): boolean => {
    const blockId = getBlock(x, y, z);
    if (!BLOCK_DEFS[blockId]?.explosive) return false;
    if (!breakBlock(x, y, z)) return false;

    spawnBlockBreakEffect(blockId, x, y, z);
    sendBlockBreak(x, y, z);
    recordBlockBreakMastery(blockId);
    const cp = camera.position;
    triggerTntExplosion(x, y, z, [cp.x, cp.y - 1.6, cp.z]);
    emitBlockUseFeedback(blockId, x, y, z, { detonatedCount: 1 });
    return true;
  }, [breakBlock, camera, emitBlockUseFeedback, getBlock, recordBlockBreakMastery, sendBlockBreak]);

  const detonateAdjacentExplosives = useCallback((x: number, y: number, z: number): number => {
    const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;
    let detonatedCount = 0;
    for (const [dx, dy, dz] of dirs) {
      if (detonateExplosiveBlock(x + dx, y + dy, z + dz)) {
        detonatedCount++;
      }
    }
    return detonatedCount;
  }, [detonateExplosiveBlock]);

  const applySpecialPlacement = useCallback((blockId: BlockId, x: number, y: number, z: number): SpecialPlacementResult => {
    const result: SpecialPlacementResult = {};
    if (blockId === BLOCK_IDS.SPAWNER) {
      spawnMob('iron_golem', x + 0.5, y + 2, z + 0.5);
      result.spawnedIronGolem = true;
    }
    if (blockId === BLOCK_IDS.LEVER) {
      result.detonatedCount = detonateAdjacentExplosives(x, y, z);
    }
    return result;
  }, [detonateAdjacentExplosives, spawnMob]);

  const openChestBlock = useCallback((x: number, y: number, z: number): boolean => {
    const game = useGameStore.getState();
    const loot = getChestLoot(game.currentStageId, game.isBuildMode);
    const inventory = useInventoryStore.getState();
    for (const item of loot) {
      inventory.addItem(item.blockId, item.count);
    }

    setBlock(x, y, z, BLOCK_IDS.AIR);
    sendBlockBreak(x, y, z);
    spawnBlockBreakEffect(BLOCK_IDS.CHEST, x, y, z);
    emitFunctionalFeedback(BLOCK_IDS.CHEST, x, y, z, {
      icon: '📦',
      eyebrow: '補給箱オープン',
      title: 'マップ補給を入手',
      detail: formatBlockList(loot),
      accent: '#ffd166',
      glow: 'rgba(255, 209, 102, 0.36)',
      kind: 'condition',
      soundKind: 'condition',
    });
    return true;
  }, [emitFunctionalFeedback, sendBlockBreak, setBlock]);

  const smeltWithFurnace = useCallback((x: number, y: number, z: number): boolean => {
    const inventory = useInventoryStore.getState();
    const recipes: Array<{ sourceBlockId: BlockId; resultBlockId: BlockId }> = [
      { sourceBlockId: BLOCK_IDS.IRON_ORE, resultBlockId: BLOCK_IDS.IRON_INGOT },
      { sourceBlockId: BLOCK_IDS.GOLD_ORE, resultBlockId: BLOCK_IDS.GOLD_INGOT },
      { sourceBlockId: BLOCK_IDS.DIAMOND_ORE, resultBlockId: BLOCK_IDS.DIAMOND_GEM },
    ];
    const results: SmeltResult[] = [];

    for (const recipe of recipes) {
      const count = inventory.getItemCount(recipe.sourceBlockId);
      if (count <= 0) continue;
      if (inventory.removeItem(recipe.sourceBlockId, count)) {
        inventory.addItem(recipe.resultBlockId, count);
        results.push({ ...recipe, count });
      }
    }

    if (results.length === 0) {
      emitFunctionalFeedback(BLOCK_IDS.FURNACE, x, y, z, {
        icon: '🔥',
        eyebrow: '精錬待ち',
        title: '鉱石がない',
        detail: '鉄・金・ダイヤ鉱石を持ってくると一括精錬できる',
        accent: '#ffad66',
        glow: 'rgba(255, 150, 80, 0.3)',
        kind: 'utility',
        soundKind: 'switch',
      }, 900);
      return true;
    }

    emitFunctionalFeedback(BLOCK_IDS.FURNACE, x, y, z, {
      icon: '🔥',
      eyebrow: '一括精錬',
      title: 'かまど稼働',
      detail: formatBlockList(results),
      accent: '#ffad66',
      glow: 'rgba(255, 150, 80, 0.34)',
      kind: 'light',
      soundKind: 'light',
    });
    return true;
  }, [emitFunctionalFeedback]);

  const restAtBed = useCallback((x: number, y: number, z: number): boolean => {
    const game = useGameStore.getState();
    const player = usePlayerStore.getState();
    const beforeHp = player.hp;
    if (!game.isBuildMode) {
      player.heal(8);
      usePlayerStore.setState((state) => ({
        invincibleUntil: Math.max(state.invincibleUntil, Date.now() + 3000),
      }));
    }
    if (game.isNight) {
      useGameStore.setState({
        gameTime: 0.08,
        dayCount: game.dayCount + 1,
        isNight: false,
      });
    }
    const healed = Math.max(0, Math.round(usePlayerStore.getState().hp - beforeHp));
    const detail = [
      healed > 0 ? `HP +${healed}` : '体勢を立て直した',
      game.isNight ? '朝になった' : '少し安全時間を確保',
    ].join(' / ');

    emitFunctionalFeedback(BLOCK_IDS.BED, x, y, z, {
      icon: '🛏️',
      eyebrow: '休憩完了',
      title: 'ベッドで休んだ',
      detail,
      accent: '#ff9fb3',
      glow: 'rgba(255, 130, 160, 0.32)',
      kind: 'utility',
      soundKind: 'condition',
    }, 900);
    return true;
  }, [emitFunctionalFeedback]);

  const toggleDoorBlock = useCallback((x: number, y: number, z: number): boolean => {
    const open = useFunctionalBlockStore.getState().toggleDoor(x, y, z);
    emitFunctionalFeedback(BLOCK_IDS.DOOR, x, y, z, {
      icon: open ? '🚪' : '🔒',
      eyebrow: open ? 'ドア開放' : 'ドア閉鎖',
      title: open ? '入口を開いた' : '入口を閉じた',
      detail: open ? 'ドアが横に開いて通路が見える' : '拠点の入口を閉じた',
      accent: '#d49a59',
      glow: 'rgba(200, 130, 70, 0.3)',
      kind: 'switch',
      soundKind: 'switch',
    }, 240);
    return true;
  }, [emitFunctionalFeedback]);

  const travelWithPortal = useCallback((x: number, y: number, z: number): boolean => {
    const game = useGameStore.getState();
    const goingToNether = game.dimension === 'overworld';
    if (goingToNether) {
      game.travelToNether();
    } else {
      game.travelToOverworld();
    }
    emitFunctionalFeedback(BLOCK_IDS.NETHER_PORTAL, x, y, z, {
      icon: '🌀',
      eyebrow: '次元移動',
      title: goingToNether ? 'ネザーへ移動' : '地上へ帰還',
      detail: goingToNether ? '空と霧がネザーの色に変わる' : 'いつもの世界へ戻った',
      accent: '#9c6bff',
      glow: 'rgba(130, 80, 255, 0.38)',
      kind: 'condition',
      soundKind: 'condition',
    }, 900);
    return true;
  }, [emitFunctionalFeedback]);

  const interactWithTargetBlock = useCallback((t: TargetBlock): boolean => {
    const targetBlockId = getBlock(t.x, t.y, t.z);
    if (BLOCK_DEFS[targetBlockId]?.explosive) {
      return detonateExplosiveBlock(t.x, t.y, t.z);
    }
    if (targetBlockId === BLOCK_IDS.LEVER) {
      const detonatedCount = detonateAdjacentExplosives(t.x, t.y, t.z);
      emitBlockUseFeedback(BLOCK_IDS.LEVER, t.x, t.y, t.z, { detonatedCount });
      return true;
    }
    if (targetBlockId === BLOCK_IDS.CHEST) {
      return openChestBlock(t.x, t.y, t.z);
    }
    if (targetBlockId === BLOCK_IDS.FURNACE) {
      return smeltWithFurnace(t.x, t.y, t.z);
    }
    if (targetBlockId === BLOCK_IDS.BED) {
      return restAtBed(t.x, t.y, t.z);
    }
    if (targetBlockId === BLOCK_IDS.DOOR) {
      return toggleDoorBlock(t.x, t.y, t.z);
    }
    if (targetBlockId === BLOCK_IDS.NETHER_PORTAL) {
      return travelWithPortal(t.x, t.y, t.z);
    }
    return false;
  }, [
    detonateAdjacentExplosives,
    detonateExplosiveBlock,
    emitBlockUseFeedback,
    getBlock,
    openChestBlock,
    restAtBed,
    smeltWithFurnace,
    toggleDoorBlock,
    travelWithPortal,
  ]);

  const tryPlaceSelectedBlock = useCallback((t: TargetBlock): boolean => {
    if (!t.hasPlaceTarget) return false;
    if (getBlock(t.placeX, t.placeY, t.placeZ) !== BLOCK_IDS.AIR) return false;
    if (wouldBlockOverlapPlayer(t.placeX, t.placeY, t.placeZ)) return false;

    const selectedBlock = getSelectedBlock();
    const inventory = useInventoryStore.getState();
    if (!inventory.removeItem(selectedBlock, 1)) {
      emitInventoryEmptyFeedback(selectedBlock, t.placeX, t.placeY, t.placeZ);
      playInventoryEmptySound();
      return false;
    }

    setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
    sendBlockPlace(t.placeX, t.placeY, t.placeZ, selectedBlock);
    playBlockPlaceSound();
    usePlayerStore.setState((s) => ({
      cameraShake: Math.min(1, Math.max(s.cameraShake, 0.08)),
    }));
    const modeFlowPlacement = recordBlockPlaceMastery(selectedBlock);
    const specialPlacement = applySpecialPlacement(selectedBlock, t.placeX, t.placeY, t.placeZ);
    emitBlockUseFeedback(selectedBlock, t.placeX, t.placeY, t.placeZ, {
      ...specialPlacement,
      stageChallengeProgress: getPlacementChallengeProgressContext(selectedBlock),
    });
    if (modeFlowPlacement?.focused && !modeFlowPlacement.activated) {
      spawnBlockUseEffect('light', t.placeX, t.placeY, t.placeZ, modeFlowPlacement.accent);
    }
    return true;
  }, [
    applySpecialPlacement,
    emitInventoryEmptyFeedback,
    emitBlockUseFeedback,
    getBlock,
    getSelectedBlock,
    getPlacementChallengeProgressContext,
    recordBlockPlaceMastery,
    sendBlockPlace,
    setBlock,
    wouldBlockOverlapPlayer,
  ]);

  const grantBrokenBlock = useCallback((blockId: BlockId, x: number, y: number, z: number): void => {
    if (BLOCK_DEFS[blockId]?.explosive) return;
    if (isBuildMode) {
      useInventoryStore.getState().addItem(blockId, 1);
      return;
    }
    dropItem(blockId, x, y, z);
  }, [dropItem, isBuildMode]);

  /** 近接: スイング開始時に保留し、ヒットフレームでダメージ確定 */
  const pendingMeleeRef = useRef<{
    kind: 'mob' | 'player';
    targetId: string;
    multiplier: number;
  } | null>(null);
  const meleeHitAppliedRef = useRef(false);
  const meleeSwingSoundPlayedRef = useRef(false);

  const resolvePendingMeleeHit = useCallback(() => {
    const pending = pendingMeleeRef.current;
    if (!pending || meleeHitAppliedRef.current) return;
    meleeHitAppliedRef.current = true;

    attackDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const multiplier = pending.multiplier;
    const isCritical = multiplier >= 0.9;

    if (pending.kind === 'player') {
      const remote = useMultiplayerStore.getState().remotePlayers.get(pending.targetId);
      if (!remote || remote.isDead) {
        pendingMeleeRef.current = null;
        return;
      }
      const actualDamage = Math.max(1, Math.round(PVP_DAMAGE * multiplier));
      useMultiplayerStore.getState().sendPlayerAttack(
        pending.targetId,
        actualDamage,
        attackDir.current.x,
        attackDir.current.z,
      );
      spawnHitImpactEffect(
        remote.position[0],
        remote.position[1] + 1.0,
        remote.position[2],
        attackDir.current.x,
        attackDir.current.y,
        attackDir.current.z,
        false,
      );
      playMeleeHitSound(false);
      usePlayerStore.setState((s) => ({
        cameraShake: Math.min(1, Math.max(s.cameraShake, 0.22)),
      }));
      recordItemHit('builder', { label: '近接ヒット', amount: 7 });
      pendingMeleeRef.current = null;
      return;
    }

    const mob = useMobStore.getState().mobs.find((m) => m.id === pending.targetId);
    if (!mob) {
      pendingMeleeRef.current = null;
      return;
    }
    const hitY = getMobHitboxMaxY(mob.y, getMobHitbox(mob.type)) - 0.2;
    const actualDamage = Math.max(1, Math.round(ATTACK_DAMAGE * multiplier));
    damageMob(mob.id, actualDamage, attackDir.current.x * 0.35, attackDir.current.z * 0.35);
    spawnDamagePopup(actualDamage, mob.x, hitY - 1.0, mob.z, isCritical);
    spawnHitImpactEffect(
      mob.x,
      hitY,
      mob.z,
      attackDir.current.x,
      attackDir.current.y,
      attackDir.current.z,
      isCritical,
    );
    playMeleeHitSound(isCritical);
    usePlayerStore.setState((s) => ({
      cameraShake: Math.min(1, Math.max(s.cameraShake, isCritical ? 0.36 : 0.24)),
    }));
    recordItemHit('builder', { critical: isCritical, label: isCritical ? '会心ヒット' : '近接ヒット' });
    pendingMeleeRef.current = null;
  }, [camera, damageMob, recordItemHit]);

  const tryMeleeAttack = useCallback((): boolean => {
    const maxAttackDistance = getAttackDistanceLimit();
    if (maxAttackDistance <= 0) return false;

    const targetPlayer = findTargetPlayer(maxAttackDistance);
    if (targetPlayer) {
      const multiplier = performAttack({ noShake: true });
      if (multiplier <= 0) return true;
      pendingMeleeRef.current = {
        kind: 'player',
        targetId: targetPlayer.id,
        multiplier,
      };
      meleeHitAppliedRef.current = false;
      meleeSwingSoundPlayedRef.current = false;
      return true;
    }

    const targetMob = findTargetMobData(maxAttackDistance);
    if (targetMob) {
      const multiplier = performAttack({ noShake: true });
      if (multiplier <= 0) return true;
      pendingMeleeRef.current = {
        kind: 'mob',
        targetId: targetMob.id,
        multiplier,
      };
      meleeHitAppliedRef.current = false;
      meleeSwingSoundPlayedRef.current = false;
      return true;
    }

    return false;
  }, [findTargetMobData, findTargetPlayer, getAttackDistanceLimit, performAttack]);

  // レイマーチングで照準先のブロックを検出
  useFrame((_, frameDelta) => {
    // ポーズ・メニュー中は破壊/設置/攻撃を進行させない
    if (useGameStore.getState().phase !== 'playing') {
      isBreakingRef.current = false;
      isPlacingRef.current = false;
      breakProgressRef.current = null;
      placeTimerRef.current = 0;
      placeRepeatStartedRef.current = false;
      if (miningFocusKeyRef.current) {
        miningFocusKeyRef.current = '';
        useMiningFocusStore.getState().clearTarget();
      }
      return;
    }

    const dt = Math.min(frameDelta, 0.1);

    // --- 近接ヒットフレーム解決（スイング進行と同期） ---
    const meleeTimer = usePlayerStore.getState().meleeSwingTimer ?? 0;
    if (meleeTimer > 0 || pendingMeleeRef.current) {
      const elapsed = Math.max(0, MELEE_SWING_DURATION - meleeTimer);
      if (!meleeSwingSoundPlayedRef.current && elapsed >= 0.08) {
        meleeSwingSoundPlayedRef.current = true;
        playMeleeSwingSound();
      }
      if (pendingMeleeRef.current && !meleeHitAppliedRef.current && elapsed >= MELEE_HIT_AT) {
        resolvePendingMeleeHit();
      }
      if (meleeTimer <= 0 && pendingMeleeRef.current) {
        // タイマー切れでも未ヒットなら保険で確定
        resolvePendingMeleeHit();
      }
    }

    rayDir.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    rayOrigin.current.copy(camera.position);
    const dir = rayDir.current;
    const origin = rayOrigin.current;

    let found: TargetBlock | null = null;

    // 前回の空気ブロック座標を追跡
    let lastAirX = -1;
    let lastAirY = -1;
    let lastAirZ = -1;
    let hasLastAir = false;
    let lastBx = -999;
    let lastBy = -999;
    let lastBz = -999;

    for (let i = 1; i <= RAY_STEPS; i++) {
      const t = i * STEP_SIZE;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;

      const bx = Math.floor(px);
      const by = Math.floor(py);
      const bz = Math.floor(pz);

      // 同じブロック座標ならスキップ
      if (bx === lastBx && by === lastBy && bz === lastBz) continue;
      lastBx = bx;
      lastBy = by;
      lastBz = bz;

      const block = getBlock(bx, by, bz);
      if (block !== BLOCK_IDS.AIR) {
        // 液体ブロックは破壊対象外（通過）
        const def = BLOCK_DEFS[block];
        if (def?.isLiquid || def?.noCollision) {
          if (INTERACTIVE_PASS_THROUGH_BLOCKS.has(block)) {
            found = {
              x: bx, y: by, z: bz,
              placeX: lastAirX,
              placeY: lastAirY,
              placeZ: lastAirZ,
              hasPlaceTarget: false,
              distance: t,
            };
            break;
          }
          // 液体・非実体ブロックは空気と同じ扱い
          lastAirX = bx;
          lastAirY = by;
          lastAirZ = bz;
          hasLastAir = true;
          continue;
        }
        // 固体ブロックにヒット！
        found = {
          x: bx, y: by, z: bz,
          placeX: lastAirX,
          placeY: lastAirY,
          placeZ: lastAirZ,
          hasPlaceTarget: hasLastAir,
          distance: t,
        };
        break;
      } else {
        // 空気ブロック → 設置先候補として記録
        lastAirX = bx;
        lastAirY = by;
        lastAirZ = bz;
        hasLastAir = true;
      }
    }

    targetRef.current = found;
    // ターゲット変更時のみstate更新（パフォーマンスのため）
    setTarget((prev) => {
      if (!found && !prev) return prev;
      if (!found || !prev) return found;
      if (
        found.x === prev.x
        && found.y === prev.y
        && found.z === prev.z
        && found.placeX === prev.placeX
        && found.placeY === prev.placeY
        && found.placeZ === prev.placeZ
        && found.hasPlaceTarget === prev.hasPlaceTarget
      ) {
        return prev;
      }
      return found;
    });
    publishMiningFocus(found);

    // --- 段階的ブロック破壊の進行（デスクトップ 左クリック押しっぱなし） ---
    if (isBreakingRef.current && found && !isTouch.current) {
      if (usePlayerStore.getState().isDead) { isBreakingRef.current = false; return; }
      if (useVehicleStore.getState().isInVehicle()) { isBreakingRef.current = false; return; }
      if (equippedItem !== 'builder') { isBreakingRef.current = false; return; }

      const bp = breakProgressRef.current;
      const blockId = getBlock(found.x, found.y, found.z);
      const def = BLOCK_DEFS[blockId];
      const hardness = isBuildMode ? 0 : (def?.hardness ?? 0.5);
      const playerTier = usePlayerStore.getState().getToolTierLevel();
      const blocker = getBlockBreakBlocker(blockId, isBuildMode, playerTier);

      // 破壊不可・ティア不足でブロックが掘れない
      if (blocker) {
        // 進行度をリセット（掘れないことを示す）
        if (bp) {
          breakProgressRef.current = null;
          setBreakProgressState(null);
        }
        emitMiningBlockedFeedback(blockId, found.x, found.y, found.z, blocker);
      } else if (hardness <= 0) {
        // hardness <= 0 のブロック（TNT等）は即破壊
        if (breakBlock(found.x, found.y, found.z)) {
          spawnBlockBreakEffect(blockId, found.x, found.y, found.z);
          grantBrokenBlock(blockId, found.x, found.y, found.z);
          sendBlockBreak(found.x, found.y, found.z);
          recordBlockBreakMastery(blockId);
          if (BLOCK_DEFS[blockId]?.explosive) {
            const cp = camera.position;
            triggerTntExplosion(found.x, found.y, found.z, [cp.x, cp.y - 1.6, cp.z]);
          }
        }
        breakProgressRef.current = null;
        setBreakProgressState(null);
        isBreakingRef.current = false;
      } else if (!bp || bp.x !== found.x || bp.y !== found.y || bp.z !== found.z) {
        // ターゲットが変わったらリセット
        breakProgressRef.current = { x: found.x, y: found.y, z: found.z, blockId, progress: 0, hardness };
      } else {
        // 進行度を加算（ツール速度倍率適用）
        const miningSpeed = usePlayerStore.getState().getMiningSpeed(def?.blockCategory)
          * getBuilderMasteryBonus().miningSpeedMultiplier
          * getBuilderTechniqueBonus().builderMiningSpeedMultiplier
          * getBuildFocusMiningSpeedMultiplier();
        bp.progress += (dt * miningSpeed) / hardness;

        if (bp.progress >= 1) {
          // 破壊完了！
          if (breakBlock(found.x, found.y, found.z)) {
            spawnBlockBreakEffect(blockId, found.x, found.y, found.z);
            grantBrokenBlock(blockId, found.x, found.y, found.z);
            sendBlockBreak(found.x, found.y, found.z);
            playBlockBreakSound();
            usePlayerStore.setState((s) => ({
              cameraShake: Math.min(1, Math.max(s.cameraShake, 0.14)),
            }));
            recordBlockBreakMastery(blockId);
            // ツール耐久値消費
            if (!isBuildMode) {
              usePlayerStore.getState().damageTool();
              // 鉱石採掘時にXP獲得
              const cat = def?.blockCategory;
              if (cat === 'ore') {
                useExperienceStore.getState().addXp(3 + Math.floor(Math.random() * 5));
              }
            }
            // TNT爆発チェック
            if (BLOCK_DEFS[blockId]?.explosive) {
              const cp = camera.position;
              triggerTntExplosion(found.x, found.y, found.z, [cp.x, cp.y - 1.6, cp.z]);
            }
          }
          breakProgressRef.current = null;
        }
      }

      setBreakProgressState(breakProgressRef.current ? { ...breakProgressRef.current } : null);
    } else if (!isBreakingRef.current) {
      // 押していない場合はリセット
      if (breakProgressRef.current) {
        breakProgressRef.current = null;
        setBreakProgressState(null);
      }
    }

    // --- デスクトップ: 右クリック長押しによる連続ブロック設置 ---
    // 左クリック破壊中は設置を禁止（破壊と設置が競合して壊せないバグ防止）
    if (!isTouch.current && isPlacingRef.current && !isBreakingRef.current) {
      if (!usePlayerStore.getState().isDead
        && !useVehicleStore.getState().isInVehicle()
        && equippedItem === 'builder'
        && isDesktopGameplayInputActive()
      ) {
        placeTimerRef.current += dt;
        const t = targetRef.current;
        if (t && t.hasPlaceTarget) {
          const coordKey = `${t.placeX},${t.placeY},${t.placeZ}`;
          // 設置先が空気ブロックでない場合はスキップ（既にブロックがある場所に重複設置しない）
          const placeTarget = getBlock(t.placeX, t.placeY, t.placeZ);
          if (placeTarget !== BLOCK_IDS.AIR) {
            // 既にブロックがある→座標を記録してスキップ
            lastPlacedRef.current = coordKey;
          } else {
            // 初動待機: 押し始めの単発クリックでは連続設置を始めない。
            // 一度リピートに入った後は通常間隔で連続設置する。
            // 設置直後はレイマーチングで照準先が自分側へずれるため、
            // 照準変化による即時連射はせず常に間隔ベースで判定する（自分方向への暴発防止）。
            const placeInterval = PLACE_INTERVAL
              * getBuilderMasteryBonus().placementIntervalMultiplier
              * getBuilderTechniqueBonus().builderPlacementIntervalMultiplier
              * getBuildFocusPlacementIntervalMultiplier();
            const requiredDelay = placeRepeatStartedRef.current
              ? placeInterval
              : PLACE_INITIAL_DELAY * getBuildFocusPlacementIntervalMultiplier();
            if (placeTimerRef.current >= requiredDelay) {
              // TNT右クリック起爆チェック
              const targetBlockId = getBlock(t.x, t.y, t.z);
              if (BLOCK_DEFS[targetBlockId]?.explosive) {
                detonateExplosiveBlock(t.x, t.y, t.z);
              } else if (tryPlaceSelectedBlock(t)) {
                lastPlacedRef.current = coordKey;
              }
              placeTimerRef.current = 0;
              placeRepeatStartedRef.current = true;
            }
          } // 空気ブロックチェックのelse終了
        }
      }
    }

    // --- モバイル: タッチによるブロック操作の処理 ---
    if (isTouch.current) {
      if (usePlayerStore.getState().isDead) return;
      // ヘリコプター搭乗中はブロック操作を無効化
      if (useVehicleStore.getState().isInVehicle()) return;
      // 建築以外は破壊トリガーを消費しない（ライトセイバー側で消費）。
      // ただし武器切替後にトリガーが残留しないよう、非ライトセイバー時は破棄する。
      if (equippedItem !== 'builder') {
        if (equippedItem !== 'lightsaber') {
          consumeBreakBlock();
        }
        return;
      }

      // 破壊
      if (consumeBreakBlock()) {
        // まずプレイヤー攻撃 → モブ攻撃 → ブロック破壊
        if (!tryMeleeAttack()) {
          const t = targetRef.current;
          if (t) {
            const blockId = getBlock(t.x, t.y, t.z);
            const blocker = getBlockBreakBlocker(
              blockId,
              isBuildMode,
              usePlayerStore.getState().getToolTierLevel(),
            );
            if (blocker) {
              emitMiningBlockedFeedback(blockId, t.x, t.y, t.z, blocker);
            } else if (breakBlock(t.x, t.y, t.z)) {
              // パーティクルエフェクト + ドロップアイテム
              spawnBlockBreakEffect(blockId, t.x, t.y, t.z);
              grantBrokenBlock(blockId, t.x, t.y, t.z);
              sendBlockBreak(t.x, t.y, t.z);
              playBlockBreakSound();
              usePlayerStore.setState((s) => ({
                cameraShake: Math.min(1, Math.max(s.cameraShake, 0.13)),
              }));
              recordBlockBreakMastery(blockId);
              if (BLOCK_DEFS[blockId]?.explosive) {
                const cp = camera.position;
                triggerTntExplosion(t.x, t.y, t.z, [cp.x, cp.y - 1.6, cp.z]);
              }
            }
          }
        }
      }

      // 設置
      if (consumePlaceBlock()) {
        const t = targetRef.current;
        if (t) {
          if (!interactWithTargetBlock(t)) {
            tryPlaceSelectedBlock(t);
          }
        }
      }
    }
  });

  // クリック処理（デスクトップのみ）
  const handleMouseDown = useCallback((e: MouseEvent) => {
    // タッチデバイスではマウスクリックは使わない
    if (isTouch.current) return;
    // ポーズ中は操作不可
    if (useGameStore.getState().phase !== 'playing') return;
    // PointerLockが取れない環境でも、canvasがアクティブなら操作を受ける
    if (!isDesktopGameplayInputActive()) return;
    // 死亡中は操作不可
    if (usePlayerStore.getState().isDead) return;
    // ヘリコプター搭乗中はブロック操作を無効化
    if (useVehicleStore.getState().isInVehicle()) return;
    if (equippedItem !== 'builder') return;

    if (e.button === 0) {
      // 左クリック: プレイヤー攻撃 → モブ攻撃 → ブロック段階破壊開始
      if (!tryMeleeAttack()) {
        // ビルドモードは即破壊
        if (isBuildMode) {
          const t = targetRef.current;
          if (t) {
            const blockId = getBlock(t.x, t.y, t.z);
            const blocker = getBlockBreakBlocker(
              blockId,
              isBuildMode,
              usePlayerStore.getState().getToolTierLevel(),
            );
            if (blocker) {
              emitMiningBlockedFeedback(blockId, t.x, t.y, t.z, blocker);
            } else if (breakBlock(t.x, t.y, t.z)) {
              spawnBlockBreakEffect(blockId, t.x, t.y, t.z);
              grantBrokenBlock(blockId, t.x, t.y, t.z);
              sendBlockBreak(t.x, t.y, t.z);
              playBlockBreakSound();
              usePlayerStore.setState((s) => ({
                cameraShake: Math.min(1, Math.max(s.cameraShake, 0.13)),
              }));
              recordBlockBreakMastery(blockId);
              if (BLOCK_DEFS[blockId]?.explosive) {
                const cp = camera.position;
                triggerTntExplosion(t.x, t.y, t.z, [cp.x, cp.y - 1.6, cp.z]);
              }
            }
          }
        } else {
          // サバイバルモード: 押しっぱなしで段階的破壊
          isBreakingRef.current = true;
        }
      }
    } else if (e.button === 2) {
      // 右クリック押下: 連続設置モード開始 + 初回即設置
      isPlacingRef.current = true;
      placeTimerRef.current = 0;
      placeRepeatStartedRef.current = false;
      lastPlacedRef.current = '';

      const t = targetRef.current;
      if (!t) return;

      // 機能ブロックは設置より先に使う
      if (interactWithTargetBlock(t)) {
        isPlacingRef.current = false;
        return;
      }

      if (tryPlaceSelectedBlock(t)) {
        lastPlacedRef.current = `${t.placeX},${t.placeY},${t.placeZ}`;
      }
    }
  }, [breakBlock, camera, emitMiningBlockedFeedback, equippedItem, getBlock, grantBrokenBlock, interactWithTargetBlock, isBuildMode, recordBlockBreakMastery, sendBlockBreak, tryMeleeAttack, tryPlaceSelectedBlock]);

  // 左クリック離し → 破壊中止
  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.button === 0) {
      isBreakingRef.current = false;
    }
    if (e.button === 2) {
      isPlacingRef.current = false;
      placeRepeatStartedRef.current = false;
      lastPlacedRef.current = '';
    }
  }, []);

  useEffect(() => {
    // デスクトップのみ: マウスイベントを登録
    if (isTouch.current) return;

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    // 右クリックのコンテキストメニューを無効化
    const preventContext = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventContext);

    // PointerLock解除時に全refをリセット（右クリック押しっぱなしが残るバグ防止）
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
        isBreakingRef.current = false;
        isPlacingRef.current = false;
        placeRepeatStartedRef.current = false;
        lastPlacedRef.current = '';
        breakProgressRef.current = null;
        setBreakProgressState(null);
      }
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);

    // ウィンドウフォーカス失消時もリセット
    const handleBlur = () => {
      isBreakingRef.current = false;
      isPlacingRef.current = false;
      placeRepeatStartedRef.current = false;
      lastPlacedRef.current = '';
    };
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('contextmenu', preventContext);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [handleMouseDown, handleMouseUp]);

  return (
    <>
      <BlockHighlight
        target={target}
        selectedBlock={selectedBlock}
        selectedCount={selectedCount}
        currentStageId={currentStageId}
        equippedItem={equippedItem}
        canPlace={canPlaceAtTarget}
      />
      <BlockBreakProgressOverlay breakProgress={breakProgressState} />
    </>
  );
}
