// 建築・採掘用の一人称手持ちモデル
// 選択中ブロックと装備ツールを手元に出し、基本操作の手ごたえを上げる

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../stores/useGameStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId, type BlockInfo } from '../types/blocks';
import { TOOL_DEFS, type ToolDef, type ToolType } from '../types/tools';
import { isDesktopGameplayInputActive } from '../utils/gameCanvas';

const FIRST_PERSON_SKIN_COLOR = '#f0b686';
const FIRST_PERSON_SLEEVE_COLOR = '#3f78d4';
const TOOL_DANGER_COLOR = new THREE.Color('#ff6b6b');
const TOOL_CHIP_DANGER_COLOR = new THREE.Color('#ff7a68');
const BLOCK_MODEL_OFFSET = new THREE.Vector3(-0.24, -0.66, -1.24);
const TOOL_MODEL_OFFSET = new THREE.Vector3(0.46, -0.66, -1.12);
const ROOT_ROTATION = new THREE.Euler(-0.08, 0.03, -0.04, 'YXZ');
const BLOCK_ROTATION = new THREE.Euler(0.42, -0.62, 0.24, 'YXZ');
const TOOL_ROTATION = new THREE.Euler(-0.35, Math.PI - 0.24, -0.26, 'YXZ');
const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();
const blockMaterialCache = new Map<string, THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[]>();
const TOOL_TYPE_ACCENTS: Record<ToolType, string> = {
  pickaxe: '#88d8ff',
  axe: '#9dff8a',
  shovel: '#ffd36f',
  sword: '#cba4ff',
};
const TOOL_TIER_GLOW: Record<ToolDef['tier'], number> = {
  wood: 0.12,
  stone: 0.18,
  iron: 0.32,
  diamond: 0.54,
};

function getTexture(textureName: string): THREE.Texture {
  const cached = textureCache.get(textureName);
  if (cached) return cached;

  const texture = textureLoader.load(`/textures/blocks/${textureName}`);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 2;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(textureName, texture);
  return texture;
}

function getViewMaterialProps(blockDef: BlockInfo): THREE.MeshStandardMaterialParameters {
  const params: THREE.MeshStandardMaterialParameters = {
    transparent: blockDef.transparent,
    opacity: blockDef.transparent ? 0.72 : 1,
    roughness: 0.76,
    metalness: blockDef.blockCategory === 'ore' ? 0.16 : 0.04,
    depthTest: false,
    depthWrite: false,
  };
  if (blockDef.emissiveColor) {
    params.emissive = blockDef.emissiveColor;
    params.emissiveIntensity = Math.max(0.24, blockDef.emissiveIntensity ?? 0.5);
  } else if (blockDef.emissive) {
    params.emissive = new THREE.Color(0x333333);
    params.emissiveIntensity = blockDef.emissiveIntensity ?? 0.5;
  }
  return params;
}

function getBlockViewMaterial(blockId: BlockId): THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] {
  const blockDef = BLOCK_DEFS[blockId] ?? BLOCK_DEFS[BLOCK_IDS.GRASS];
  const key = blockDef.faceTextures
    ? `${blockDef.faceTextures.top}_${blockDef.faceTextures.side}_${blockDef.faceTextures.bottom}`
    : blockDef.texture;
  const cached = blockMaterialCache.get(key);
  if (cached) return cached;

  const props = getViewMaterialProps(blockDef);
  if (blockDef.faceTextures) {
    const { top, side, bottom } = blockDef.faceTextures;
    const sideTexture = getTexture(side);
    const materials = [
      new THREE.MeshStandardMaterial({ map: sideTexture, ...props }),
      new THREE.MeshStandardMaterial({ map: sideTexture, ...props }),
      new THREE.MeshStandardMaterial({ map: getTexture(top), ...props }),
      new THREE.MeshStandardMaterial({ map: getTexture(bottom), ...props }),
      new THREE.MeshStandardMaterial({ map: sideTexture, ...props }),
      new THREE.MeshStandardMaterial({ map: sideTexture, ...props }),
    ];
    blockMaterialCache.set(key, materials);
    return materials;
  }

  const material = new THREE.MeshStandardMaterial({
    map: getTexture(blockDef.texture),
    ...props,
  });
  blockMaterialCache.set(key, material);
  return material;
}

function getBlockAccentColor(blockDef: BlockInfo): THREE.Color {
  if (blockDef.lightColor) return blockDef.lightColor.clone();
  if (blockDef.emissiveColor) return blockDef.emissiveColor.clone();
  if (blockDef.isLiquid) return new THREE.Color(blockDef.id === BLOCK_IDS.LAVA ? '#ff6b22' : '#5bd3ff');
  if (blockDef.blockCategory === 'wood') return new THREE.Color('#d19a55');
  if (blockDef.blockCategory === 'stone' || blockDef.blockCategory === 'ore') return new THREE.Color('#c8cfd8');
  if (blockDef.blockCategory === 'dirt') return new THREE.Color('#8ed058');
  return new THREE.Color('#ffe2a3');
}

function getToolAccentColor(toolDef: ToolDef | null): THREE.Color {
  if (!toolDef) return new THREE.Color(FIRST_PERSON_SKIN_COLOR);
  return new THREE.Color(toolDef.color).lerp(new THREE.Color(TOOL_TYPE_ACCENTS[toolDef.type]), 0.42);
}

function ToolHead({ toolDef }: { toolDef: ToolDef }) {
  const toolColor = toolDef.color;
  const accentColor = getToolAccentColor(toolDef);
  const type = toolDef.type;
  const metalness = toolDef.tier === 'wood' ? 0.04 : toolDef.tier === 'stone' ? 0.12 : 0.58;
  const glowStrength = TOOL_TIER_GLOW[toolDef.tier];

  if (type === 'sword') {
    return (
      <>
        <mesh position={[0, 0.25, 0]} renderOrder={34}>
          <boxGeometry args={[0.055, 0.56, 0.035]} />
          <meshStandardMaterial color={toolColor} roughness={0.34} metalness={metalness} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, -0.05, 0]} renderOrder={34}>
          <boxGeometry args={[0.24, 0.035, 0.04]} />
          <meshStandardMaterial color="#d4c093" roughness={0.36} metalness={0.22} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.28, 0.003]} renderOrder={35}>
          <boxGeometry args={[0.024, 0.5, 0.012]} />
          <meshBasicMaterial color={accentColor} transparent opacity={glowStrength} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </>
    );
  }

  if (type === 'axe') {
    return (
      <>
        <mesh position={[0.05, 0.28, 0]} rotation={[0, 0, -0.2]} renderOrder={34}>
          <boxGeometry args={[0.2, 0.22, 0.045]} />
          <meshStandardMaterial color={toolColor} roughness={0.42} metalness={metalness} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0.16, 0.2, 0]} rotation={[0, 0, -0.54]} renderOrder={34}>
          <boxGeometry args={[0.08, 0.2, 0.045]} />
          <meshStandardMaterial color={toolColor} roughness={0.38} metalness={metalness} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0.08, 0.29, 0.004]} rotation={[0, 0, -0.25]} renderOrder={35}>
          <boxGeometry args={[0.24, 0.035, 0.012]} />
          <meshBasicMaterial color={accentColor} transparent opacity={glowStrength} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </>
    );
  }

  if (type === 'shovel') {
    return (
      <>
        <mesh position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 4]} renderOrder={34}>
          <boxGeometry args={[0.18, 0.18, 0.045]} />
          <meshStandardMaterial color={toolColor} roughness={0.44} metalness={metalness} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.31, 0.004]} rotation={[0, 0, Math.PI / 4]} renderOrder={35}>
          <boxGeometry args={[0.15, 0.026, 0.012]} />
          <meshBasicMaterial color={accentColor} transparent opacity={glowStrength} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </>
    );
  }

  return (
    <>
      <mesh position={[0, 0.26, 0]} renderOrder={34}>
        <boxGeometry args={[0.36, 0.055, 0.05]} />
        <meshStandardMaterial color={toolColor} roughness={0.42} metalness={metalness} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[-0.16, 0.18, 0]} rotation={[0, 0, 0.35]} renderOrder={34}>
        <boxGeometry args={[0.06, 0.18, 0.05]} />
        <meshStandardMaterial color={toolColor} roughness={0.38} metalness={metalness} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0.16, 0.18, 0]} rotation={[0, 0, -0.35]} renderOrder={34}>
        <boxGeometry args={[0.06, 0.18, 0.05]} />
        <meshStandardMaterial color={toolColor} roughness={0.38} metalness={metalness} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.27, 0.004]} renderOrder={35}>
        <boxGeometry args={[0.32, 0.026, 0.012]} />
        <meshBasicMaterial color={accentColor} transparent opacity={glowStrength} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </>
  );
}

function ToolModel({ toolDef }: { toolDef: ToolDef | null }) {
  if (!toolDef) {
    return (
      <group>
        <mesh position={[0, -0.04, 0]} renderOrder={34}>
          <boxGeometry args={[0.16, 0.14, 0.18]} />
          <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0.03, -0.11, 0.01]} renderOrder={34}>
          <boxGeometry args={[0.2, 0.13, 0.16]} />
          <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, -0.18, 0]} renderOrder={34}>
        <boxGeometry args={[0.06, 0.46, 0.06]} />
        <meshStandardMaterial color="#7c5124" roughness={0.82} metalness={0.02} depthTest={false} depthWrite={false} />
      </mesh>
      <ToolHead toolDef={toolDef} />
    </group>
  );
}

function getToolTypeSwing(type: ToolType | null): number {
  if (type === 'sword') return 0.54;
  if (type === 'axe') return 0.46;
  if (type === 'shovel') return 0.36;
  return 0.42;
}

export function BuilderHeldItem() {
  const { camera } = useThree();
  const phase = useGameStore((s) => s.phase);
  const equippedItem = usePlayerStore((s) => s.equippedItem);
  const isDead = usePlayerStore((s) => s.isDead);
  const selectedSlot = usePlayerStore((s) => s.selectedSlot);
  const hotbarSlots = usePlayerStore((s) => s.hotbarSlots);
  const equippedToolId = usePlayerStore((s) => s.equippedToolId);
  const tools = usePlayerStore((s) => s.tools);
  const selectedBlock = hotbarSlots[selectedSlot] ?? hotbarSlots[0] ?? BLOCK_IDS.GRASS;
  const blockDef = BLOCK_DEFS[selectedBlock] ?? BLOCK_DEFS[BLOCK_IDS.GRASS];
  const blockMaterial = useMemo(() => getBlockViewMaterial(selectedBlock), [selectedBlock]);
  const toolDef = equippedToolId ? TOOL_DEFS[equippedToolId] : null;
  const toolDurability = equippedToolId && toolDef ? (tools[equippedToolId] ?? 0) : 0;
  const toolDurabilityRatio = toolDef ? Math.max(0, Math.min(1, toolDurability / toolDef.maxDurability)) : 1;
  const accentColor = useMemo(() => getBlockAccentColor(blockDef), [blockDef]);
  const toolAccentColor = useMemo(() => getToolAccentColor(toolDef), [toolDef]);
  const rootRef = useRef<THREE.Group>(null);
  const blockRef = useRef<THREE.Group>(null);
  const toolRef = useRef<THREE.Group>(null);
  const blockGlowRef = useRef<THREE.Mesh>(null);
  const blockRingRef = useRef<THREE.Mesh>(null);
  const toolTrailRef = useRef<THREE.Mesh>(null);
  const toolStatusGlowRef = useRef<THREE.Mesh>(null);
  const toolChipRef = useRef<THREE.Mesh>(null);
  const idleTimer = useRef(0);
  const switchPulse = useRef(1);
  const swingKick = useRef(0);
  const placeKick = useRef(0);
  const offsetWorld = useRef(new THREE.Vector3());
  const toolOffsetWorld = useRef(new THREE.Vector3());
  const blockOffsetWorld = useRef(new THREE.Vector3());
  const localQuat = useMemo(() => new THREE.Quaternion().setFromEuler(ROOT_ROTATION), []);
  const blockQuat = useMemo(() => new THREE.Quaternion().setFromEuler(BLOCK_ROTATION), []);
  const toolQuat = useMemo(() => new THREE.Quaternion().setFromEuler(TOOL_ROTATION), []);

  useEffect(() => {
    switchPulse.current = 1;
  }, [selectedBlock, equippedToolId]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (usePlayerStore.getState().equippedItem !== 'builder') return;
      if (!isDesktopGameplayInputActive()) return;
      if (event.button === 0) swingKick.current = 1;
      if (event.button === 2) placeKick.current = 1;
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  useFrame((_, delta) => {
    idleTimer.current += delta;
    switchPulse.current = Math.max(0, switchPulse.current - delta * 4.2);
    swingKick.current = Math.max(0, swingKick.current - delta * 6.5);
    placeKick.current = Math.max(0, placeKick.current - delta * 7.5);

    const visible = phase === 'playing'
      && equippedItem === 'builder'
      && !isDead
      && !useVehicleStore.getState().isInVehicle();

    if (!rootRef.current) return;
    rootRef.current.visible = visible;
    if (!visible) return;

    const idleBob = Math.sin(idleTimer.current * 1.7) * 0.01;
    const idleSway = Math.sin(idleTimer.current * 1.08) * 0.008;
    const switchLift = switchPulse.current * 0.045;
    offsetWorld.current.set(idleSway, idleBob - switchLift, 0);
    offsetWorld.current.applyQuaternion(camera.quaternion);
    rootRef.current.position.copy(camera.position).add(offsetWorld.current);
    rootRef.current.quaternion.copy(camera.quaternion).multiply(localQuat);

    if (toolRef.current) {
      const swing = Math.sin((1 - swingKick.current) * Math.PI) * swingKick.current;
      toolOffsetWorld.current.copy(TOOL_MODEL_OFFSET);
      toolOffsetWorld.current.y -= swing * 0.08;
      toolOffsetWorld.current.z -= swing * 0.1;
      toolRef.current.position.copy(toolOffsetWorld.current);
      toolRef.current.quaternion.copy(toolQuat);
      toolRef.current.scale.setScalar(0.44);
      toolRef.current.rotation.x += swing * getToolTypeSwing(toolDef?.type ?? null);
      toolRef.current.rotation.z -= swing * 0.38;
    }

    if (toolTrailRef.current) {
      const trailMaterial = toolTrailRef.current.material as THREE.MeshBasicMaterial;
      const swing = Math.sin((1 - swingKick.current) * Math.PI) * swingKick.current;
      const statusPulse = Math.max(0, 1 - toolDurabilityRatio) * 0.25;
      trailMaterial.color.copy(toolAccentColor);
      trailMaterial.opacity = swing * 0.62 + switchPulse.current * 0.12 + statusPulse;
      toolTrailRef.current.rotation.z = -0.72 + idleTimer.current * 0.08 + swing * 1.8;
      toolTrailRef.current.scale.setScalar(0.74 + swing * 0.38 + switchPulse.current * 0.12);
    }

    if (toolStatusGlowRef.current) {
      const glowMaterial = toolStatusGlowRef.current.material as THREE.MeshBasicMaterial;
      const lowDurabilityPulse = toolDef && toolDurabilityRatio <= 0.18
        ? 0.55 + Math.sin(idleTimer.current * 9.5) * 0.22
        : 0;
      const tierGlow = toolDef ? TOOL_TIER_GLOW[toolDef.tier] : 0.08;
      glowMaterial.color.copy(lowDurabilityPulse > 0 ? TOOL_DANGER_COLOR : toolAccentColor);
      glowMaterial.opacity = Math.max(lowDurabilityPulse, tierGlow * 0.36 + switchPulse.current * 0.18);
      toolStatusGlowRef.current.scale.setScalar(0.7 + switchPulse.current * 0.16 + lowDurabilityPulse * 0.18);
    }

    if (toolChipRef.current) {
      const chipMaterial = toolChipRef.current.material as THREE.MeshBasicMaterial;
      const lowDurability = toolDef && toolDurabilityRatio <= 0.18;
      chipMaterial.color.copy(lowDurability ? TOOL_CHIP_DANGER_COLOR : toolAccentColor);
      chipMaterial.opacity = (lowDurability ? 0.72 : 0.32) + switchPulse.current * 0.24;
      toolChipRef.current.rotation.z -= delta * (lowDurability ? 7.5 : 2.4);
      toolChipRef.current.scale.setScalar(0.82 + (lowDurability ? Math.sin(idleTimer.current * 8) * 0.08 : 0));
    }

    if (blockRef.current) {
      const place = Math.sin((1 - placeKick.current) * Math.PI) * placeKick.current;
      blockOffsetWorld.current.copy(BLOCK_MODEL_OFFSET);
      blockOffsetWorld.current.z -= place * 0.1;
      blockOffsetWorld.current.y += switchPulse.current * 0.025;
      blockRef.current.position.copy(blockOffsetWorld.current);
      blockRef.current.quaternion.copy(blockQuat);
      blockRef.current.rotation.y += idleTimer.current * 0.35 + place * 0.8;
      blockRef.current.rotation.x += Math.sin(idleTimer.current * 1.3) * 0.045;
      blockRef.current.scale.setScalar(0.15 + switchPulse.current * 0.026 + place * 0.02);
    }

    if (blockGlowRef.current) {
      const material = blockGlowRef.current.material as THREE.MeshBasicMaterial;
      const pulse = switchPulse.current + placeKick.current * 0.8;
      material.color.copy(accentColor);
      material.opacity = 0.06 + pulse * 0.16;
      blockGlowRef.current.scale.setScalar(0.78 + pulse * 0.18);
    }

    if (blockRingRef.current) {
      const material = blockRingRef.current.material as THREE.MeshBasicMaterial;
      const pulse = switchPulse.current + placeKick.current * 0.9;
      material.color.copy(accentColor);
      material.opacity = 0.14 + pulse * 0.32;
      blockRingRef.current.rotation.z += delta * (1.2 + pulse * 5.5);
      blockRingRef.current.scale.setScalar(1 + pulse * 0.18);
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      <group ref={blockRef}>
        <mesh material={blockMaterial} renderOrder={32}>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
        <mesh ref={blockGlowRef} renderOrder={31}>
          <sphereGeometry args={[0.56, 18, 10]} />
          <meshBasicMaterial
            color={accentColor}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={blockRingRef} rotation={[Math.PI / 2, 0, 0]} renderOrder={33}>
          <torusGeometry args={[0.52, 0.02, 8, 40]} />
          <meshBasicMaterial
            color={accentColor}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[-0.05, -0.54, 0.1]} rotation={[0.18, 0.08, -0.22]} renderOrder={34}>
          <boxGeometry args={[0.22, 0.16, 0.18]} />
          <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[-0.13, -0.66, 0.12]} rotation={[0.08, 0.02, -0.3]} renderOrder={34}>
          <boxGeometry args={[0.2, 0.34, 0.18]} />
          <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
      <group ref={toolRef}>
        <ToolModel toolDef={toolDef} />
        <mesh ref={toolTrailRef} position={[0.03, 0.08, -0.035]} rotation={[0, 0, -0.72]} renderOrder={36}>
          <torusGeometry args={[0.36, 0.012, 8, 42, Math.PI * 1.28]} />
          <meshBasicMaterial
            color={toolAccentColor}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={toolStatusGlowRef} position={[0, 0.18, -0.045]} renderOrder={33}>
          <sphereGeometry args={[0.34, 18, 10]} />
          <meshBasicMaterial
            color={toolAccentColor}
            transparent
            opacity={0}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={toolChipRef} position={[0.18, 0.42, -0.02]} rotation={[0.15, 0.05, 0.4]} renderOrder={36}>
          <boxGeometry args={[0.07, 0.018, 0.012]} />
          <meshBasicMaterial
            color={toolAccentColor}
            transparent
            opacity={0.32}
            depthTest={false}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.08, -0.42, 0.04]} rotation={[-0.08, 0.04, -0.2]} renderOrder={34}>
          <boxGeometry args={[0.16, 0.42, 0.15]} />
          <meshStandardMaterial color={FIRST_PERSON_SLEEVE_COLOR} roughness={0.78} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={[0.02, -0.2, 0.02]} rotation={[0.08, 0.02, -0.08]} renderOrder={34}>
          <boxGeometry args={[0.16, 0.13, 0.14]} />
          <meshStandardMaterial color={FIRST_PERSON_SKIN_COLOR} roughness={0.72} depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}
