// ドロップアイテムの描画＆物理演算コンポーネント
// ブロック破壊時に地面に落ちるアイテムを描画し、プレイヤーが近づくとピックアップする

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDroppedItemStore, type DroppedItem } from '../stores/useDroppedItemStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_DEFS, BLOCK_IDS, type BlockId, type BlockInfo } from '../types/blocks';
import { playItemPickupSound } from '../utils/sounds';

/** ピックアップ距離 */
const PICKUP_RADIUS = 2.0;
/** ピックアップ時の吸い込み速度 */
const PICKUP_SPEED = 12;
/** アイテムの重力 */
const ITEM_GRAVITY = -20;
/** アイテムのバウンス係数 */
const BOUNCE_FACTOR = 0.3;
/** ボブアニメーションの高さ */
const BOB_HEIGHT = 0.08;
/** ボブアニメーションの速度 */
const BOB_SPEED = 2.5;
/** 回転速度 */
const ROTATE_SPEED = 1.2;
/** アイテムの表示サイズ */
const ITEM_SCALE = 0.3;
/** アイテムの光輪サイズ */
const HALO_SCALE = 1;
/** アイテム吸い込み時の光跡の長さ */
const PICKUP_TRAIL_LENGTH = 1.45;
/** 期限切れチェック間隔（フレーム数） */
const CLEANUP_INTERVAL = 120;

type DropRarity = 'common' | 'resource' | 'precious' | 'power' | 'hazard';

interface DropPresentation {
  rarity: DropRarity;
  scale: number;
  haloScale: number;
  glowScale: number;
  edgeOpacity: number;
  spinBoost: number;
  secondaryColor: THREE.Color;
}

/** テクスチャキャッシュ */
const textureCache = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();

function getItemTexture(textureName: string): THREE.Texture {
  if (textureCache.has(textureName)) return textureCache.get(textureName)!;
  const texture = textureLoader.load(`/textures/blocks/${textureName}`);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(textureName, texture);
  return texture;
}

/** 共有ジオメトリ（全ドロップアイテムで再利用） */
const sharedItemGeometry = new THREE.BoxGeometry(1, 1, 1);
const sharedItemEdgesGeometry = new THREE.EdgesGeometry(sharedItemGeometry);
const sharedHaloGeometry = new THREE.RingGeometry(0.78, 1.08, 36);
const sharedShadowGeometry = new THREE.CircleGeometry(0.72, 32);
const sharedBillboardGlowGeometry = new THREE.CircleGeometry(1.05, 36);
const sharedCrownGeometry = new THREE.TorusGeometry(1.26, 0.035, 6, 44);
const sharedSparkGeometry = new THREE.OctahedronGeometry(0.16, 0);
const SPARK_POSITIONS: Array<[number, number, number]> = [
  [0.72, 0.42, 0],
  [-0.72, 0.32, 0],
  [0, 0.38, 0.72],
  [0, 0.28, -0.72],
];

function getDropAccentColor(blockId: BlockId, def: BlockInfo | undefined): THREE.Color {
  if (def?.emissiveColor) return def.emissiveColor.clone();

  if (
    blockId === BLOCK_IDS.DIAMOND_ORE ||
    blockId === BLOCK_IDS.DIAMOND_GEM ||
    blockId === BLOCK_IDS.ELECTRIC
  ) {
    return new THREE.Color(0x65f8ff);
  }
  if (blockId === BLOCK_IDS.GOLD_ORE || blockId === BLOCK_IDS.GOLD_INGOT) {
    return new THREE.Color(0xffd66b);
  }
  if (blockId === BLOCK_IDS.IRON || blockId === BLOCK_IDS.IRON_ORE || blockId === BLOCK_IDS.IRON_INGOT) {
    return new THREE.Color(0xc9d6df);
  }
  if (blockId === BLOCK_IDS.WOOD || blockId === BLOCK_IDS.RAW_WOOD || blockId === BLOCK_IDS.STICK) {
    return new THREE.Color(0xd49454);
  }
  if (blockId === BLOCK_IDS.LEAVES || blockId === BLOCK_IDS.GRASS) {
    return new THREE.Color(0x8adf69);
  }
  if (blockId === BLOCK_IDS.SAND) {
    return new THREE.Color(0xffd28a);
  }
  if (blockId === BLOCK_IDS.SNOW) {
    return new THREE.Color(0xe9fbff);
  }
  if (blockId === BLOCK_IDS.TNT || blockId === BLOCK_IDS.LAVA) {
    return new THREE.Color(0xff6a3d);
  }

  return new THREE.Color(0xffffff);
}

function getDropRarity(blockId: BlockId, def: BlockInfo | undefined): DropRarity {
  if (blockId === BLOCK_IDS.LAVA || blockId === BLOCK_IDS.TNT || blockId === BLOCK_IDS.NETHER_PORTAL) return 'hazard';
  if (def?.emissive || blockId === BLOCK_IDS.GLOWSTONE || blockId === BLOCK_IDS.ENCHANT || blockId === BLOCK_IDS.ELECTRIC) return 'power';
  if (blockId === BLOCK_IDS.DIAMOND_ORE || blockId === BLOCK_IDS.DIAMOND_GEM || blockId === BLOCK_IDS.GOLD_ORE || blockId === BLOCK_IDS.GOLD_INGOT) {
    return 'precious';
  }
  if (
    blockId === BLOCK_IDS.IRON ||
    blockId === BLOCK_IDS.IRON_ORE ||
    blockId === BLOCK_IDS.IRON_INGOT ||
    blockId === BLOCK_IDS.COAL_ORE ||
    blockId === BLOCK_IDS.CHEST ||
    blockId === BLOCK_IDS.FURNACE
  ) {
    return 'resource';
  }
  return 'common';
}

function getDropPresentation(blockId: BlockId, def: BlockInfo | undefined, accent: THREE.Color): DropPresentation {
  const rarity = getDropRarity(blockId, def);
  if (rarity === 'hazard') {
    return {
      rarity,
      scale: 1.12,
      haloScale: 1.28,
      glowScale: 1.34,
      edgeOpacity: 0.7,
      spinBoost: 1.55,
      secondaryColor: new THREE.Color(0xffd079),
    };
  }
  if (rarity === 'power') {
    return {
      rarity,
      scale: 1.16,
      haloScale: 1.36,
      glowScale: 1.46,
      edgeOpacity: 0.82,
      spinBoost: 1.42,
      secondaryColor: new THREE.Color(0xffffff),
    };
  }
  if (rarity === 'precious') {
    return {
      rarity,
      scale: 1.1,
      haloScale: 1.26,
      glowScale: 1.32,
      edgeOpacity: 0.76,
      spinBoost: 1.32,
      secondaryColor: new THREE.Color(0xfff2a8),
    };
  }
  if (rarity === 'resource') {
    return {
      rarity,
      scale: 1.04,
      haloScale: 1.12,
      glowScale: 1.12,
      edgeOpacity: 0.6,
      spinBoost: 1.16,
      secondaryColor: accent.clone().lerp(new THREE.Color(0xffffff), 0.35),
    };
  }
  return {
    rarity,
    scale: 1,
    haloScale: 1,
    glowScale: 1,
    edgeOpacity: 0.5,
    spinBoost: 1,
    secondaryColor: accent.clone().lerp(new THREE.Color(0xffffff), 0.18),
  };
}

/** 個別のドロップアイテム描画 */
function DroppedItemRenderer({ item }: { item: DroppedItem }) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>(null);
  const crownRef = useRef<THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>>(null);
  const shadowRef = useRef<THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>(null);
  const glowRef = useRef<THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>(null);
  const sparkRef = useRef<THREE.Group>(null);
  const trailRef = useRef<THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>>(null);
  const { camera } = useThree();
  const getBlock = useWorldStore((s) => s.getBlock);
  const addItem = useInventoryStore((s) => s.addItem);
  const removeItem = useDroppedItemStore((s) => s.removeItem);
  const startPickup = useDroppedItemStore((s) => s.startPickup);
  const updatePosition = useDroppedItemStore((s) => s.updateItemPosition);

  const def = BLOCK_DEFS[item.blockId];
  const texture = useMemo(() => {
    if (!def) return null;
    const texName = def.faceTextures?.top || def.texture;
    return getItemTexture(texName);
  }, [def]);

  // アイテムの色（発光用）
  const emissiveColor = useMemo(() => {
    if (def?.emissiveColor) return def.emissiveColor;
    return null;
  }, [def]);

  const accentColor = useMemo(() => getDropAccentColor(item.blockId, def), [def, item.blockId]);
  const presentation = useMemo(
    () => getDropPresentation(item.blockId, def, accentColor),
    [accentColor, def, item.blockId],
  );
  const trailGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return geo;
  }, []);

  // 再利用用ベクトル
  const tempVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!groupRef.current || !meshRef.current) return;
    const clampedDelta = Math.min(delta, 0.05);
    const now = Date.now();
    const ageSeconds = (now - item.spawnedAt) / 1000;

    let { x, y, z, vx, vy, vz } = item;

    if (item.beingPickedUp) {
      // ピックアップ中 → プレイヤーに向かって飛んでいく
      tempVec.current.set(
        camera.position.x - x,
        camera.position.y - y,
        camera.position.z - z,
      );
      const dist = tempVec.current.length();

      if (dist < 0.5) {
        // ピックアップ完了
        addItem(item.blockId);
        playItemPickupSound(presentation.rarity);
        removeItem(item.id);
        return;
      }

      tempVec.current.normalize().multiplyScalar(PICKUP_SPEED * clampedDelta);
      x += tempVec.current.x;
      y += tempVec.current.y;
      z += tempVec.current.z;
      updatePosition(item.id, x, y, z, 0, 0, 0);
      groupRef.current.position.set(x, y, z);

      // ピックアップ中はスケールが縮む
      const scale = Math.max(0.1, dist / PICKUP_RADIUS) * ITEM_SCALE * presentation.scale;
      groupRef.current.scale.setScalar(scale);
      meshRef.current.rotation.y += ROTATE_SPEED * 3.6 * presentation.spinBoost * clampedDelta;
      meshRef.current.rotation.x += ROTATE_SPEED * 1.8 * presentation.spinBoost * clampedDelta;

      if (haloRef.current) {
        haloRef.current.scale.setScalar(HALO_SCALE * presentation.haloScale * (1.22 + Math.sin(ageSeconds * 18) * 0.08));
        haloRef.current.material.opacity = presentation.rarity === 'common' ? 0.44 : 0.58;
      }
      if (crownRef.current) {
        crownRef.current.rotation.z = ageSeconds * 2.6;
        crownRef.current.scale.setScalar(presentation.haloScale * (1.2 + Math.sin(ageSeconds * 20) * 0.1));
        crownRef.current.material.opacity = presentation.rarity === 'common' ? 0 : 0.52;
      }
      if (glowRef.current) {
        glowRef.current.quaternion.copy(camera.quaternion);
        glowRef.current.scale.setScalar(presentation.glowScale * (1.18 + Math.sin(ageSeconds * 16) * 0.08));
        glowRef.current.material.opacity = presentation.rarity === 'common' ? 0.28 : 0.42;
      }
      if (sparkRef.current) {
        sparkRef.current.rotation.y = -ageSeconds * 4.2;
        sparkRef.current.visible = presentation.rarity !== 'common';
      }
      if (shadowRef.current) {
        shadowRef.current.material.opacity = 0.04;
      }
      if (trailRef.current) {
        const trailDir = tempVec.current.lengthSq() > 0.001
          ? tempVec.current.clone().normalize().multiplyScalar(Math.min(PICKUP_TRAIL_LENGTH, dist))
          : tempVec.current.set(0, 0.4, 0);
        const positions = trailRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
        positions.setXYZ(0, 0, 0, 0);
        positions.setXYZ(1, trailDir.x, trailDir.y, trailDir.z);
        positions.needsUpdate = true;
        trailRef.current.material.opacity = 0.62;
      }
      return;
    }

    // 物理演算（バウンス中）
    if (Math.abs(vy) > 0.01 || Math.abs(vx) > 0.01 || Math.abs(vz) > 0.01) {
      vy += ITEM_GRAVITY * clampedDelta;
      x += vx * clampedDelta;
      y += vy * clampedDelta;
      z += vz * clampedDelta;

      // 空気抵抗
      vx *= 0.95;
      vz *= 0.95;

      // 地面との衝突判定（下のブロックをチェック）
      const floorY = Math.floor(y);
      const blockBelow = getBlock(Math.floor(x), floorY, Math.floor(z));
      if (blockBelow !== BLOCK_IDS.AIR && vy < 0) {
        y = floorY + 1.1; // ブロックの上に着地
        vy = -vy * BOUNCE_FACTOR;
        vx *= 0.7;
        vz *= 0.7;
        // ほぼ停止していたら速度をゼロに
        if (Math.abs(vy) < 0.5) vy = 0;
        if (Math.abs(vx) < 0.1) vx = 0;
        if (Math.abs(vz) < 0.1) vz = 0;
      }

      updatePosition(item.id, x, y, z, vx, vy, vz);
    }

    // ボブ＆回転アニメーション（着地後）
    const bobOffset = Math.sin(ageSeconds * BOB_SPEED + item.spawnedAt * 0.001) * BOB_HEIGHT;
    groupRef.current.position.set(x, y + bobOffset, z);
    groupRef.current.scale.setScalar(ITEM_SCALE * presentation.scale);
    meshRef.current.rotation.y += ROTATE_SPEED * presentation.spinBoost * clampedDelta;
    meshRef.current.rotation.x = Math.sin(ageSeconds * 1.45) * 0.16;
    meshRef.current.rotation.z = Math.cos(ageSeconds * 1.18) * 0.1;

    const pulse = 1 + Math.sin(ageSeconds * 4.8) * 0.065;
    if (haloRef.current) {
      haloRef.current.scale.setScalar(HALO_SCALE * presentation.haloScale * pulse);
      haloRef.current.rotation.z = -ageSeconds * 0.8;
      haloRef.current.material.opacity = 0.18 + Math.max(0, Math.sin(ageSeconds * 3.2)) * (presentation.rarity === 'common' ? 0.1 : 0.18);
    }
    if (crownRef.current) {
      crownRef.current.rotation.z = ageSeconds * (presentation.rarity === 'hazard' ? 1.25 : 0.9);
      crownRef.current.scale.setScalar(presentation.haloScale * (0.92 + Math.sin(ageSeconds * 3.8) * 0.04));
      crownRef.current.material.opacity = presentation.rarity === 'common' ? 0 : 0.22 + Math.max(0, Math.sin(ageSeconds * 2.7)) * 0.16;
    }
    if (glowRef.current) {
      glowRef.current.quaternion.copy(camera.quaternion);
      glowRef.current.scale.setScalar(presentation.glowScale * (0.95 + Math.sin(ageSeconds * 3.7) * 0.08));
      glowRef.current.material.opacity = (presentation.rarity === 'common' ? 0.14 : 0.2) + Math.max(0, Math.sin(ageSeconds * 4.1)) * 0.1;
    }
    if (sparkRef.current) {
      sparkRef.current.visible = presentation.rarity !== 'common';
      sparkRef.current.rotation.y = -ageSeconds * (presentation.rarity === 'hazard' ? 1.65 : 1.05);
      sparkRef.current.rotation.x = Math.sin(ageSeconds * 1.6) * 0.16;
    }
    if (shadowRef.current) {
      shadowRef.current.position.y = -0.43 - bobOffset;
      shadowRef.current.scale.set(1.05 + Math.abs(bobOffset) * 1.3, 1.05 + Math.abs(bobOffset) * 1.3, 1);
      shadowRef.current.material.opacity = 0.16;
    }
    if (trailRef.current) {
      trailRef.current.material.opacity = 0;
    }

    // ピックアップ判定
    if (now >= item.pickupableAt) {
      const dx = camera.position.x - x;
      const dy = camera.position.y - y;
      const dz = camera.position.z - z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < PICKUP_RADIUS * PICKUP_RADIUS) {
        startPickup(item.id);
      }
    }
  });

  if (!def || !texture) return null;

  return (
    <group ref={groupRef} position={[item.x, item.y, item.z]} scale={ITEM_SCALE}>
      <mesh
        ref={shadowRef}
        geometry={sharedShadowGeometry}
        position={[0, -0.43, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <meshBasicMaterial
          color={0x111827}
          depthWrite={false}
          opacity={0.16}
          transparent
        />
      </mesh>
      <mesh
        ref={haloRef}
        geometry={sharedHaloGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <meshBasicMaterial
          color={accentColor}
          depthWrite={false}
          opacity={0.24}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh
        ref={crownRef}
        geometry={sharedCrownGeometry}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={2}
      >
        <meshBasicMaterial
          color={presentation.secondaryColor}
          depthWrite={false}
          opacity={presentation.rarity === 'common' ? 0 : 0.28}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <lineSegments ref={trailRef} geometry={trailGeometry} renderOrder={4}>
        <lineBasicMaterial
          color={accentColor}
          opacity={0}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
      <mesh ref={glowRef} geometry={sharedBillboardGlowGeometry} renderOrder={2}>
        <meshBasicMaterial
          color={accentColor}
          depthTest={false}
          depthWrite={false}
          fog={false}
          opacity={0.18}
          transparent
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh ref={meshRef} geometry={sharedItemGeometry} castShadow receiveShadow>
        <meshStandardMaterial
          map={texture}
          emissive={emissiveColor ?? accentColor}
          emissiveIntensity={emissiveColor ? 0.52 : presentation.rarity === 'common' ? 0.1 : 0.22}
          metalness={item.blockId === BLOCK_IDS.IRON || item.blockId === BLOCK_IDS.IRON_INGOT ? 0.18 : 0}
          opacity={def.transparent ? 0.78 : 1}
          transparent={def.transparent}
          roughness={presentation.rarity === 'precious' || presentation.rarity === 'power' ? 0.38 : 0.54}
        />
      </mesh>
      <lineSegments geometry={sharedItemEdgesGeometry} renderOrder={3}>
        <lineBasicMaterial
          color={accentColor}
          opacity={presentation.edgeOpacity}
          transparent
          toneMapped={false}
        />
      </lineSegments>
      <group ref={sparkRef} visible={presentation.rarity !== 'common'}>
        {SPARK_POSITIONS.map(([x, y, z], index) => (
          <mesh
            key={`${x}:${z}`}
            geometry={sharedSparkGeometry}
            position={[x, y, z]}
            rotation={[0.35, index * Math.PI * 0.5, 0.2]}
            renderOrder={4}
          >
            <meshBasicMaterial
              color={index % 2 === 0 ? presentation.secondaryColor : accentColor}
              depthWrite={false}
              opacity={0.46}
              transparent
              toneMapped={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** ドロップアイテム全体の管理コンポーネント */
export function DroppedItems() {
  const items = useDroppedItemStore((s) => s.items);
  const cleanupExpired = useDroppedItemStore((s) => s.cleanupExpired);
  const frameCount = useRef(0);

  // 初回マウント時に既存アイテムをクリア（リロード対応）
  useEffect(() => {
    return () => {
      // アンマウント時にクリーンアップ
    };
  }, []);

  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % CLEANUP_INTERVAL === 0) {
      cleanupExpired();
    }
  });

  return (
    <group>
      {items.map((item) => (
        <DroppedItemRenderer key={item.id} item={item} />
      ))}
    </group>
  );
}
