// ドロップアイテムの描画＆物理演算コンポーネント
// 形状別の共有ジオメトリと素材別の共有マテリアルで、1個ほぼ1ドローに抑える

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDroppedItemStore, type DroppedItem } from '../stores/useDroppedItemStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId, type BlockInfo } from '../types/blocks';
import { playItemPickupSound } from '../utils/sounds';

const PICKUP_RADIUS = 2;
const PICKUP_SPEED = 12;
const ITEM_GRAVITY = -20;
const BOUNCE_FACTOR = 0.3;
const BOB_HEIGHT = 0.08;
const BOB_SPEED = 2.5;
const ROTATE_SPEED = 1.2;
const ITEM_SCALE = 0.3;
const CLEANUP_INTERVAL = 120;
/** ストア更新を間引き、最大128個のドロップ時にもReact再描画を連打しない */
const STORE_SYNC_INTERVAL_MS = 90;

type DropRarity = 'common' | 'resource' | 'precious' | 'power' | 'hazard';
type DropShape = 'block' | 'ingot' | 'gem' | 'stick' | 'seed';

interface DropPresentation {
  rarity: DropRarity;
  scale: number;
  spinBoost: number;
}

interface DropMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const textureCache = new Map<string, THREE.Texture>();
const materialCache = new Map<BlockId, THREE.MeshStandardMaterial>();
const textureLoader = new THREE.TextureLoader();

function getItemTexture(textureName: string): THREE.Texture {
  const cached = textureCache.get(textureName);
  if (cached) return cached;
  const texture = textureLoader.load(`/textures/blocks/${textureName}`);
  // ワールドブロックと同じくミップマップで遠景のチラつきを抑える
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(textureName, texture);
  return texture;
}

function createDropGeometries(): Record<DropShape, THREE.BufferGeometry> {
  const block = new THREE.BoxGeometry(1, 1, 1);

  // 六角断面の低い塊にして、ブロックとは異なる金属インゴットの輪郭を作る。
  const ingot = new THREE.CylinderGeometry(0.48, 0.56, 0.3, 6);
  ingot.scale(1.18, 1, 0.7);
  ingot.rotateY(Math.PI / 6);

  const gem = new THREE.OctahedronGeometry(0.62, 0);
  gem.scale(0.78, 1, 0.7);
  gem.rotateY(Math.PI / 4);

  const stick = new THREE.BoxGeometry(0.18, 1.18, 0.18);
  stick.rotateZ(-0.58);

  // 小麦の種は薄い涙滴状に見えるよう、低分割球をつぶして使う。
  const seed = new THREE.SphereGeometry(0.5, 8, 5);
  seed.scale(0.42, 0.18, 0.76);
  seed.rotateZ(0.32);

  return { block, ingot, gem, stick, seed };
}

const DROP_GEOMETRIES = createDropGeometries();

function getDropShape(blockId: BlockId): DropShape {
  if (blockId === BLOCK_IDS.IRON_INGOT || blockId === BLOCK_IDS.GOLD_INGOT) return 'ingot';
  if (blockId === BLOCK_IDS.DIAMOND_GEM) return 'gem';
  if (blockId === BLOCK_IDS.STICK) return 'stick';
  if (blockId === BLOCK_IDS.WHEAT_SEEDS) return 'seed';
  return 'block';
}

function getDropAccentColor(blockId: BlockId, def: BlockInfo | undefined): THREE.Color {
  if (def?.emissiveColor) return def.emissiveColor.clone();
  if (blockId === BLOCK_IDS.DIAMOND_ORE || blockId === BLOCK_IDS.DIAMOND_GEM || blockId === BLOCK_IDS.ELECTRIC) {
    return new THREE.Color(0x65f8ff);
  }
  if (blockId === BLOCK_IDS.GOLD_ORE || blockId === BLOCK_IDS.GOLD_INGOT) return new THREE.Color(0xffd66b);
  if (blockId === BLOCK_IDS.IRON || blockId === BLOCK_IDS.IRON_ORE || blockId === BLOCK_IDS.IRON_INGOT) {
    return new THREE.Color(0xc9d6df);
  }
  if (blockId === BLOCK_IDS.WOOD || blockId === BLOCK_IDS.RAW_WOOD || blockId === BLOCK_IDS.STICK) {
    return new THREE.Color(0xd49454);
  }
  if (blockId === BLOCK_IDS.WHEAT_SEEDS) return new THREE.Color(0x91ca4f);
  if (blockId === BLOCK_IDS.LEAVES || blockId === BLOCK_IDS.GRASS) return new THREE.Color(0x8adf69);
  if (blockId === BLOCK_IDS.SAND) return new THREE.Color(0xffd28a);
  if (blockId === BLOCK_IDS.SNOW) return new THREE.Color(0xe9fbff);
  if (blockId === BLOCK_IDS.TNT || blockId === BLOCK_IDS.LAVA) return new THREE.Color(0xff6a3d);
  return new THREE.Color(0xffffff);
}

function getDropRarity(blockId: BlockId, def: BlockInfo | undefined): DropRarity {
  if (blockId === BLOCK_IDS.LAVA || blockId === BLOCK_IDS.TNT || blockId === BLOCK_IDS.NETHER_PORTAL) return 'hazard';
  if (def?.emissive || blockId === BLOCK_IDS.GLOWSTONE || blockId === BLOCK_IDS.ENCHANT || blockId === BLOCK_IDS.ELECTRIC) return 'power';
  if (
    blockId === BLOCK_IDS.DIAMOND_ORE ||
    blockId === BLOCK_IDS.DIAMOND_GEM ||
    blockId === BLOCK_IDS.GOLD_ORE ||
    blockId === BLOCK_IDS.GOLD_INGOT
  ) return 'precious';
  if (
    blockId === BLOCK_IDS.IRON ||
    blockId === BLOCK_IDS.IRON_ORE ||
    blockId === BLOCK_IDS.IRON_INGOT ||
    blockId === BLOCK_IDS.COAL_ORE ||
    blockId === BLOCK_IDS.CHEST ||
    blockId === BLOCK_IDS.FURNACE
  ) return 'resource';
  return 'common';
}

function getDropPresentation(blockId: BlockId, def: BlockInfo | undefined): DropPresentation {
  const rarity = getDropRarity(blockId, def);
  switch (rarity) {
    case 'hazard':
      return { rarity, scale: 1.12, spinBoost: 1.55 };
    case 'power':
      return { rarity, scale: 1.16, spinBoost: 1.42 };
    case 'precious':
      return { rarity, scale: 1.1, spinBoost: 1.32 };
    case 'resource':
      return { rarity, scale: 1.04, spinBoost: 1.16 };
    default:
      return { rarity, scale: 1, spinBoost: 1 };
  }
}

function getDropMaterial(
  blockId: BlockId,
  def: BlockInfo,
  shape: DropShape,
  presentation: DropPresentation,
): THREE.MeshStandardMaterial {
  const cached = materialCache.get(blockId);
  if (cached) return cached;

  const textureName = def.faceTextures?.top ?? def.texture;
  const accent = getDropAccentColor(blockId, def);
  const material = new THREE.MeshStandardMaterial({
    map: getItemTexture(textureName),
    emissive: def.emissiveColor?.clone() ?? accent.clone().multiplyScalar(0.32),
    emissiveIntensity: def.emissiveColor
      ? 0.5
      : presentation.rarity === 'common'
        ? 0.08
        : 0.2,
    metalness: shape === 'ingot' ? 0.72 : shape === 'gem' ? 0.18 : 0,
    roughness: shape === 'ingot' ? 0.3 : shape === 'gem' ? 0.24 : shape === 'stick' || shape === 'seed' ? 0.82 : 0.54,
    opacity: def.transparent ? 0.82 : 1,
    transparent: def.transparent,
    // 透過ドロップが背後の光を変に隠さないよう深度書き込みを切る
    depthWrite: !def.transparent,
    alphaTest: def.transparent ? 0.06 : 0,
  });
  materialCache.set(blockId, material);
  return material;
}

function DroppedItemRenderer({ item }: { item: DroppedItem }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const getBlock = useWorldStore((state) => state.getBlock);
  const addItem = useInventoryStore((state) => state.addItem);
  const removeItem = useDroppedItemStore((state) => state.removeItem);
  const startPickup = useDroppedItemStore((state) => state.startPickup);
  const updatePosition = useDroppedItemStore((state) => state.updateItemPosition);
  const motionRef = useRef<DropMotion>({
    x: item.x,
    y: item.y,
    z: item.z,
    vx: item.vx,
    vy: item.vy,
    vz: item.vz,
  });
  const lastStoreSyncRef = useRef(item.spawnedAt);
  const directionRef = useRef(new THREE.Vector3());

  const def = BLOCK_DEFS[item.blockId];
  const shape = getDropShape(item.blockId);
  const presentation = useMemo(
    () => getDropPresentation(item.blockId, def),
    [def, item.blockId],
  );
  const material = useMemo(
    () => def ? getDropMaterial(item.blockId, def, shape, presentation) : null,
    [def, item.blockId, presentation, shape],
  );

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const clampedDelta = Math.min(delta, 0.05);
    const now = Date.now();
    const ageSeconds = (now - item.spawnedAt) / 1000;
    const motion = motionRef.current;

    if (item.beingPickedUp) {
      const direction = directionRef.current.set(
        camera.position.x - motion.x,
        camera.position.y - motion.y,
        camera.position.z - motion.z,
      );
      const distance = direction.length();

      if (distance < 0.5) {
        addItem(item.blockId);
        playItemPickupSound(presentation.rarity);
        removeItem(item.id);
        return;
      }

      direction.normalize();
      motion.x += direction.x * PICKUP_SPEED * clampedDelta;
      motion.y += direction.y * PICKUP_SPEED * clampedDelta;
      motion.z += direction.z * PICKUP_SPEED * clampedDelta;
      motion.vx = 0;
      motion.vy = 0;
      motion.vz = 0;
      mesh.position.set(motion.x, motion.y, motion.z);
      mesh.scale.setScalar(
        Math.max(0.1, distance / PICKUP_RADIUS) * ITEM_SCALE * presentation.scale,
      );
      mesh.rotation.y += ROTATE_SPEED * 3.6 * presentation.spinBoost * clampedDelta;
      mesh.rotation.x += ROTATE_SPEED * 1.8 * presentation.spinBoost * clampedDelta;

      if (now - lastStoreSyncRef.current >= STORE_SYNC_INTERVAL_MS) {
        updatePosition(item.id, motion.x, motion.y, motion.z, 0, 0, 0);
        lastStoreSyncRef.current = now;
      }
      return;
    }

    let moving = Math.abs(motion.vy) > 0.01 || Math.abs(motion.vx) > 0.01 || Math.abs(motion.vz) > 0.01;
    if (moving) {
      motion.vy += ITEM_GRAVITY * clampedDelta;
      motion.x += motion.vx * clampedDelta;
      motion.y += motion.vy * clampedDelta;
      motion.z += motion.vz * clampedDelta;
      motion.vx *= 0.95;
      motion.vz *= 0.95;

      const floorY = Math.floor(motion.y);
      const blockBelow = getBlock(Math.floor(motion.x), floorY, Math.floor(motion.z));
      if (blockBelow !== BLOCK_IDS.AIR && motion.vy < 0) {
        motion.y = floorY + 1.1;
        motion.vy = -motion.vy * BOUNCE_FACTOR;
        motion.vx *= 0.7;
        motion.vz *= 0.7;
        if (Math.abs(motion.vy) < 0.5) motion.vy = 0;
        if (Math.abs(motion.vx) < 0.1) motion.vx = 0;
        if (Math.abs(motion.vz) < 0.1) motion.vz = 0;
      }
      moving = Math.abs(motion.vy) > 0.01 || Math.abs(motion.vx) > 0.01 || Math.abs(motion.vz) > 0.01;
    }

    if (moving && now - lastStoreSyncRef.current >= STORE_SYNC_INTERVAL_MS) {
      updatePosition(item.id, motion.x, motion.y, motion.z, motion.vx, motion.vy, motion.vz);
      lastStoreSyncRef.current = now;
    }

    const bobOffset = Math.sin(ageSeconds * BOB_SPEED + item.spawnedAt * 0.001) * BOB_HEIGHT;
    mesh.position.set(motion.x, motion.y + bobOffset, motion.z);
    mesh.scale.setScalar(ITEM_SCALE * presentation.scale);
    mesh.rotation.y += ROTATE_SPEED * presentation.spinBoost * clampedDelta;
    mesh.rotation.x = Math.sin(ageSeconds * 1.45) * 0.16;
    mesh.rotation.z = Math.cos(ageSeconds * 1.18) * 0.1;

    if (now >= item.pickupableAt) {
      const dx = camera.position.x - motion.x;
      const dy = camera.position.y - motion.y;
      const dz = camera.position.z - motion.z;
      if (dx * dx + dy * dy + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        updatePosition(item.id, motion.x, motion.y, motion.z, 0, 0, 0);
        lastStoreSyncRef.current = now;
        startPickup(item.id);
      }
    }
  });

  if (!def || !material) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={DROP_GEOMETRIES[shape]}
      material={material}
      position={[item.x, item.y, item.z]}
      scale={ITEM_SCALE * presentation.scale}
      castShadow
      receiveShadow
    />
  );
}

/** ドロップアイテム全体の管理コンポーネント */
export function DroppedItems() {
  const items = useDroppedItemStore((state) => state.items);
  const cleanupExpired = useDroppedItemStore((state) => state.cleanupExpired);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % CLEANUP_INTERVAL === 0) cleanupExpired();
  });

  return (
    <group>
      {items.map((item) => (
        <DroppedItemRenderer key={item.id} item={item} />
      ))}
    </group>
  );
}
