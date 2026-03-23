// ドロップアイテムの描画＆物理演算コンポーネント
// ブロック破壊時に地面に落ちるアイテムを描画し、プレイヤーが近づくとピックアップする

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDroppedItemStore, type DroppedItem } from '../stores/useDroppedItemStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useWorldStore } from '../stores/useWorldStore';
import { BLOCK_DEFS, BLOCK_IDS } from '../types/blocks';

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
/** 期限切れチェック間隔（フレーム数） */
const CLEANUP_INTERVAL = 120;

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

/** 個別のドロップアイテム描画 */
function DroppedItemRenderer({ item }: { item: DroppedItem }) {
  const meshRef = useRef<THREE.Mesh>(null);
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

  // 再利用用ベクトル
  const tempVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const clampedDelta = Math.min(delta, 0.05);
    const now = Date.now();

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
        removeItem(item.id);
        return;
      }

      tempVec.current.normalize().multiplyScalar(PICKUP_SPEED * clampedDelta);
      x += tempVec.current.x;
      y += tempVec.current.y;
      z += tempVec.current.z;
      updatePosition(item.id, x, y, z, 0, 0, 0);
      meshRef.current.position.set(x, y, z);

      // ピックアップ中はスケールが縮む
      const scale = Math.max(0.1, dist / PICKUP_RADIUS) * ITEM_SCALE;
      meshRef.current.scale.setScalar(scale);
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
    const bobOffset = Math.sin(now / 1000 * BOB_SPEED + item.spawnedAt * 0.001) * BOB_HEIGHT;
    meshRef.current.position.set(x, y + bobOffset, z);
    meshRef.current.rotation.y += ROTATE_SPEED * clampedDelta;

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
    <mesh ref={meshRef} position={[item.x, item.y, item.z]} scale={ITEM_SCALE}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={texture}
        emissive={emissiveColor ?? undefined}
        emissiveIntensity={emissiveColor ? 0.3 : 0}
        roughness={0.7}
      />
    </mesh>
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
