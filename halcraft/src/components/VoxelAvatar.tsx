// ============================================
// VoxelAvatar — マイクラ風ボクセルキャラクター
// BoxGeometry で構成された人型アバター
// 死亡時: パーツが崩れ落ちるアニメーション
// スキン対応: skinId で各パーツの色を変更
// ============================================

import { useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type SkinDef, type SkinId, SKIN_DEFS, DEFAULT_SKIN_ID } from '../types/skins';
import type { EquippedItem } from '../stores/usePlayerStore';

interface VoxelAvatarProps {
  /** スキンID（優先） */
  skinId?: SkinId;
  /** 旧互換: スキンカラー（skinIdが無い場合のフォールバック） */
  color?: string;
  /** 移動中か（歩行アニメーション用） */
  isMoving: boolean;
  /** 表示姿勢 */
  pose?: 'standing' | 'seated';
  /** 手持ち装備に合わせた腕の構え */
  equippedItem?: EquippedItem;
  /** 視点の上下角度（リモートプレイヤーの武器構え同期用） */
  aimPitch?: number;
  /** 近接スイング進行度 0-1（0=非スイング） */
  meleeSwingProgress?: number;
  /** ライトセーバースイング進行度 0-1 */
  saberSwingProgress?: number;
  /** 機関銃リコイル進行度 0-1（1=キック直後） */
  gunRecoilProgress?: number;
  /** ロケットリコイル進行度 0-1（1=キック直後） */
  rocketRecoilProgress?: number;
  /** 死亡状態か */
  isDead?: boolean;
  /** 死亡開始時刻（Date.now()） */
  deathTime?: number;
}

/** 死亡アニメーションの総時間（秒） */
const DEATH_ANIM_DURATION = 1.2;
const WARDEN_MODEL_PATH = '/models/2026-04-29/warden.glb';
const MAX_REMOTE_AIM_PITCH = Math.PI / 3;

const SHARED_HEAD_GEOMETRY = new THREE.BoxGeometry(0.5, 0.5, 0.5);
const SHARED_BODY_GEOMETRY = new THREE.BoxGeometry(0.6, 0.8, 0.4);
const SHARED_ARM_GEOMETRY = new THREE.BoxGeometry(0.25, 0.7, 0.25);
const SHARED_DETAIL_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const SHARED_DETAIL_MATERIAL = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  vertexColors: true,
});
const SHARED_LEG_MATERIAL = new THREE.MeshLambertMaterial({
  color: 0xffffff,
  vertexColors: true,
});
const LEG_GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>();

type DetailTuple = readonly [number, number, number];

interface AvatarDetailPart {
  position: DetailTuple;
  scale: DetailTuple;
  color: string;
  rotation?: DetailTuple;
}

interface AvatarDetailPalette {
  face: string;
  hair: string;
  accent: string;
  trim: string;
  faceStyle: 'human' | 'visor' | 'creeper';
}

function setGeometryColor(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function getAvatarLegGeometry(legColor: string, shoeColor: string): THREE.BufferGeometry {
  const cacheKey = `${legColor}:${shoeColor}`;
  const cached = LEG_GEOMETRY_CACHE.get(cacheKey);
  if (cached) return cached;

  const trousers = new THREE.BoxGeometry(0.25, 0.42, 0.3);
  trousers.translate(0, 0.09, 0);
  setGeometryColor(trousers, new THREE.Color(legColor));

  const shoe = new THREE.BoxGeometry(0.27, 0.18, 0.34);
  shoe.translate(0, -0.21, 0.02);
  setGeometryColor(shoe, new THREE.Color(shoeColor));

  const merged = mergeGeometries([trousers, shoe], false);
  if (!merged) {
    shoe.dispose();
    LEG_GEOMETRY_CACHE.set(cacheKey, trousers);
    return trousers;
  }

  trousers.dispose();
  shoe.dispose();
  LEG_GEOMETRY_CACHE.set(cacheKey, merged);
  return merged;
}

function getAvatarDetailPalette(skinId: SkinId, skin: SkinDef): AvatarDetailPalette {
  switch (skinId) {
    case 'ironman':
      return { face: '#9ff8ff', hair: '#e2b944', accent: '#82f3ff', trim: '#6f1111', faceStyle: 'visor' };
    case 'red_warden':
      return { face: '#ffbd58', hair: skin.accessoryColor ?? '#731600', accent: '#ffcf64', trim: '#2d1512', faceStyle: 'visor' };
    case 'hero':
      return { face: '#2e211d', hair: '#543520', accent: '#e6c36a', trim: '#40362c', faceStyle: 'human' };
    case 'creeper':
      return { face: '#102310', hair: '#286e30', accent: '#173e1c', trim: '#102b15', faceStyle: 'creeper' };
    default:
      return { face: '#3a241c', hair: '#5b3422', accent: '#76d4e6', trim: '#27365e', faceStyle: 'human' };
  }
}

function getHeadDetails(palette: AvatarDetailPalette, hasAccessory: boolean): readonly AvatarDetailPart[] {
  const details: AvatarDetailPart[] = [
    { position: [0, 0.255, 0], scale: [0.51, 0.045, 0.51], color: palette.hair },
    { position: [0, 0.17, 0.258], scale: [0.5, 0.13, 0.025], color: palette.hair },
    { position: [-0.255, 0.05, 0], scale: [0.025, 0.38, 0.5], color: palette.hair },
    { position: [0.255, 0.05, 0], scale: [0.025, 0.38, 0.5], color: palette.hair },
  ];

  if (palette.faceStyle === 'creeper') {
    details.push(
      { position: [-0.11, 0.06, 0.263], scale: [0.09, 0.1, 0.018], color: palette.face },
      { position: [0.11, 0.06, 0.263], scale: [0.09, 0.1, 0.018], color: palette.face },
      { position: [0, -0.09, 0.263], scale: [0.09, 0.12, 0.018], color: palette.face },
      { position: [-0.06, -0.17, 0.263], scale: [0.055, 0.08, 0.018], color: palette.face },
      { position: [0.06, -0.17, 0.263], scale: [0.055, 0.08, 0.018], color: palette.face },
    );
  } else if (palette.faceStyle === 'visor') {
    details.push(
      { position: [-0.11, 0.05, 0.263], scale: [0.12, 0.055, 0.018], color: palette.face, rotation: [0, 0, -0.12] },
      { position: [0.11, 0.05, 0.263], scale: [0.12, 0.055, 0.018], color: palette.face, rotation: [0, 0, 0.12] },
      { position: [0, -0.13, 0.263], scale: [0.18, 0.035, 0.018], color: palette.trim },
    );
  } else {
    details.push(
      { position: [-0.1, 0.04, 0.263], scale: [0.065, 0.065, 0.018], color: palette.face },
      { position: [0.1, 0.04, 0.263], scale: [0.065, 0.065, 0.018], color: palette.face },
      { position: [0, -0.12, 0.263], scale: [0.12, 0.035, 0.018], color: palette.face },
    );
  }

  if (hasAccessory) {
    details.push(
      { position: [-0.15, 0.34, 0], scale: [0.08, 0.22, 0.08], color: palette.hair, rotation: [0, 0, -0.2] },
      { position: [0.15, 0.34, 0], scale: [0.08, 0.22, 0.08], color: palette.hair, rotation: [0, 0, 0.2] },
    );
  }

  return details;
}

function getBodyDetails(palette: AvatarDetailPalette): readonly AvatarDetailPart[] {
  return [
    { position: [0, 0.24, 0.207], scale: [0.4, 0.06, 0.018], color: palette.trim },
    { position: [0, 0.06, 0.21], scale: [0.2, 0.2, 0.02], color: palette.accent, rotation: [0, 0, Math.PI / 4] },
    { position: [0, -0.3, 0.207], scale: [0.58, 0.075, 0.018], color: palette.trim },
  ];
}

function ColoredDetailInstances({
  details,
  dimmed,
}: {
  details: readonly AvatarDetailPart[];
  dimmed: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const part = new THREE.Object3D();
    const color = new THREE.Color();

    details.forEach((detail, index) => {
      part.position.set(...detail.position);
      part.rotation.set(...(detail.rotation ?? [0, 0, 0]));
      part.scale.set(...detail.scale);
      part.updateMatrix();
      mesh.setMatrixAt(index, part.matrix);
      color.set(detail.color);
      if (dimmed) color.multiplyScalar(0.35);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [details, dimmed]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[SHARED_DETAIL_GEOMETRY, SHARED_DETAIL_MATERIAL, details.length]}
      dispose={null}
    />
  );
}

/** 各パーツの崩壊パラメータ */
interface PartPhysics {
  /** 崩壊後のX方向散らばり */
  spreadX: number;
  /** 崩壊後のZ方向散らばり */
  spreadZ: number;
  /** 回転速度 */
  rotSpeed: number;
  /** 落下開始ディレイ（秒） */
  delay: number;
}

/** パーツごとの崩壊パラメータ（決定論的） */
const PART_PHYSICS: Record<string, PartPhysics> = {
  head:     { spreadX: 0.3, spreadZ: -0.2, rotSpeed: 4, delay: 0.3 },
  body:     { spreadX: 0, spreadZ: 0, rotSpeed: 1.5, delay: 0 },
  leftArm:  { spreadX: -0.5, spreadZ: 0.1, rotSpeed: 3, delay: 0.15 },
  rightArm: { spreadX: 0.5, spreadZ: -0.15, rotSpeed: -3.5, delay: 0.1 },
  leftLeg:  { spreadX: -0.3, spreadZ: 0.2, rotSpeed: -2.5, delay: 0.2 },
  rightLeg: { spreadX: 0.35, spreadZ: -0.1, rotSpeed: 2, delay: 0.25 },
};

function cloneWardenScene(scene: THREE.Group): THREE.Group {
  const clone = scene.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((mat) => mat.clone());
      } else {
        child.material = child.material.clone();
      }
    }
  });
  return clone;
}

function WardenAvatar({
  isMoving,
  pose,
  isDead,
  deathTime,
}: {
  isMoving: boolean;
  pose: 'standing' | 'seated';
  isDead: boolean;
  deathTime: number;
}) {
  const { scene } = useGLTF(WARDEN_MODEL_PATH);
  const groupRef = useRef<THREE.Group>(null);
  const clonedScene = useMemo(() => cloneWardenScene(scene), [scene]);
  const originalColors = useMemo(() => {
    const colors: THREE.Color[] = [];
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          if ('color' in mat && mat.color instanceof THREE.Color) {
            colors.push(mat.color.clone());
          }
        }
      }
    });
    return colors;
  }, [clonedScene]);

  useEffect(() => {
    let colorIndex = 0;
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          if ('color' in mat && mat.color instanceof THREE.Color) {
            const original = originalColors[colorIndex] ?? mat.color;
            mat.color.copy(original);
            if (isDead) {
              mat.color.multiplyScalar(0.45);
            }
            colorIndex++;
          }
        }
      }
    });
  }, [clonedScene, isDead, originalColors]);

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = deathTime > 0 ? (Date.now() - deathTime) / 1000 : 0;
    if (isDead) {
      const t = Math.min(elapsed / DEATH_ANIM_DURATION, 1);
      groupRef.current.rotation.x = t * (Math.PI / 2);
      groupRef.current.position.y = 0.48 - t * 0.45;
      return;
    }

    if (pose === 'seated') {
      groupRef.current.rotation.x = -0.52;
      groupRef.current.position.y = 0.24;
      groupRef.current.position.z = -0.12;
      return;
    }

    groupRef.current.rotation.x = 0;
    groupRef.current.position.y = 0.48 + (isMoving ? Math.sin(performance.now() * 0.008) * 0.025 : 0);
    groupRef.current.position.z = 0;
  });

  return (
    <group ref={groupRef} scale={0.22} rotation={[0, Math.PI, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

function remoteMeleePose(progress: number): {
  pitch: number;
  roll: number;
  lift: number;
  push: number;
} {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const smooth = (t: number) => {
    const x = THREE.MathUtils.clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  };
  if (p <= 0.001) return { pitch: 0, roll: 0, lift: 0, push: 0 };
  if (p < 0.28) {
    const u = smooth(p / 0.28);
    return { pitch: -1.1 * u, roll: -0.45 * u, lift: 0.12 * u, push: -0.08 * u };
  }
  if (p < 0.48) {
    const u = smooth((p - 0.28) / 0.2);
    return {
      pitch: THREE.MathUtils.lerp(-1.1, 1.25, u),
      roll: THREE.MathUtils.lerp(-0.45, 0.7, u),
      lift: THREE.MathUtils.lerp(0.12, -0.1, u),
      push: THREE.MathUtils.lerp(-0.08, 0.18, u),
    };
  }
  if (p < 0.7) {
    const u = smooth((p - 0.48) / 0.22);
    return {
      pitch: THREE.MathUtils.lerp(1.25, 0.9, u),
      roll: THREE.MathUtils.lerp(0.7, 0.4, u),
      lift: THREE.MathUtils.lerp(-0.1, -0.04, u),
      push: THREE.MathUtils.lerp(0.18, 0.08, u),
    };
  }
  const u = smooth((p - 0.7) / 0.3);
  return {
    pitch: THREE.MathUtils.lerp(0.9, 0, u),
    roll: THREE.MathUtils.lerp(0.4, 0, u),
    lift: THREE.MathUtils.lerp(-0.04, 0, u),
    push: THREE.MathUtils.lerp(0.08, 0, u),
  };
}

export function VoxelAvatar({
  skinId,
  color,
  isMoving,
  pose = 'standing',
  equippedItem = 'builder',
  aimPitch = 0,
  meleeSwingProgress = 0,
  saberSwingProgress = 0,
  gunRecoilProgress = 0,
  rocketRecoilProgress = 0,
  isDead = false,
  deathTime = 0,
}: VoxelAvatarProps) {
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // スキン定義を取得（skinId優先、なければcolorからフォールバック）
  const skin = useMemo(() => {
    if (skinId && skinId in SKIN_DEFS) return SKIN_DEFS[skinId];
    return SKIN_DEFS[DEFAULT_SKIN_ID];
  }, [skinId]);
  const resolvedSkinId = skinId && skinId in SKIN_DEFS ? skinId : DEFAULT_SKIN_ID;

  // フォールバック色（skinIdが無くcolorが渡された場合の旧互換用）
  const fallbackColor = color && !skinId ? color : null;

  // マテリアルをメモ化（スキンカラーベース）
  const headMat = useMemo(() =>
    new THREE.MeshLambertMaterial({ color: fallbackColor || skin.colors.head }),
    [skin, fallbackColor]);

  const bodyMat = useMemo(() =>
    new THREE.MeshLambertMaterial({ color: fallbackColor || skin.colors.body }),
    [skin, fallbackColor]);

  const armMat = useMemo(() =>
    new THREE.MeshLambertMaterial({ color: fallbackColor || skin.colors.arms }),
    [skin, fallbackColor]);

  const legColor = fallbackColor
    ? `#${new THREE.Color(fallbackColor).multiplyScalar(0.7).getHexString()}`
    : skin.colors.legs;
  const shoeColor = fallbackColor
    ? `#${new THREE.Color(fallbackColor).multiplyScalar(0.42).getHexString()}`
    : skin.colors.shoes;

  // 死亡時のグレーアウトマテリアル
  const deadHeadMat = useMemo(() => {
    const c = new THREE.Color(fallbackColor || skin.colors.head);
    c.multiplyScalar(0.4);
    return new THREE.MeshLambertMaterial({ color: c });
  }, [skin, fallbackColor]);

  const deadBodyMat = useMemo(() => {
    const c = new THREE.Color(fallbackColor || skin.colors.body);
    c.multiplyScalar(0.4);
    return new THREE.MeshLambertMaterial({ color: c });
  }, [skin, fallbackColor]);

  const deadLegMat = useMemo(() => {
    const c = new THREE.Color(fallbackColor || skin.colors.legs);
    c.multiplyScalar(0.3);
    return new THREE.MeshLambertMaterial({ color: c });
  }, [skin, fallbackColor]);

  const legGeom = useMemo(() => getAvatarLegGeometry(legColor, shoeColor), [legColor, shoeColor]);
  const detailPalette = useMemo(
    () => getAvatarDetailPalette(resolvedSkinId, skin),
    [resolvedSkinId, skin],
  );
  const headDetails = useMemo(
    () => getHeadDetails(detailPalette, skin.hasHeadAccessory === true),
    [detailPalette, skin.hasHeadAccessory],
  );
  const bodyDetails = useMemo(() => getBodyDetails(detailPalette), [detailPalette]);

  // 元の位置（各パーツ）
  const origPositions = useMemo(() => ({
    head: new THREE.Vector3(0, 1.55, 0),
    body: new THREE.Vector3(0, 0.9, 0),
    leftArm: new THREE.Vector3(-0.42, 0.85, 0),
    rightArm: new THREE.Vector3(0.42, 0.85, 0),
    leftLeg: new THREE.Vector3(-0.15, 0.3, 0),
    rightLeg: new THREE.Vector3(0.15, 0.3, 0),
  }), []);

  // アニメーション
  useFrame((_, delta) => {
    if (!leftArmRef.current || !rightArmRef.current) return;
    if (!leftLegRef.current || !rightLegRef.current) return;
    if (!headRef.current || !bodyRef.current || !groupRef.current) return;

    if (isDead && deathTime > 0) {
      // ===== 死亡アニメーション =====
      const elapsed = (Date.now() - deathTime) / 1000; // 経過秒
      const t = Math.min(elapsed / DEATH_ANIM_DURATION, 1); // 0→1 に正規化

      // イージング（バウンス風）
      const ease = t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // 全体を横に倒す（X軸回転）
      groupRef.current.rotation.x = ease * (Math.PI / 2);
      // 少し沈む
      groupRef.current.position.y = -ease * 0.5;

      // マテリアル変更（グレーアウト）
      headRef.current.material = deadHeadMat;
      bodyRef.current.material = deadBodyMat;
      leftArmRef.current.material = deadBodyMat;
      rightArmRef.current.material = deadBodyMat;
      leftLegRef.current.material = deadLegMat;
      rightLegRef.current.material = deadLegMat;

      // 各パーツの崩壊（パーツが散らばる）
      const parts: [THREE.Mesh, string][] = [
        [headRef.current, 'head'],
        [bodyRef.current, 'body'],
        [leftArmRef.current, 'leftArm'],
        [rightArmRef.current, 'rightArm'],
        [leftLegRef.current, 'leftLeg'],
        [rightLegRef.current, 'rightLeg'],
      ];

      for (const [mesh, partName] of parts) {
        const phys = PART_PHYSICS[partName];
        const orig = origPositions[partName as keyof typeof origPositions];
        // ディレイ考慮の進行度
        const partT = Math.max(0, Math.min(1,
          (elapsed - phys.delay) / (DEATH_ANIM_DURATION - phys.delay)
        ));
        const partEase = partT * partT;

        // 散らばり
        mesh.position.x = orig.x + phys.spreadX * partEase;
        mesh.position.y = orig.y - partEase * 0.3; // 少し下がる
        mesh.position.z = orig.z + phys.spreadZ * partEase;

        // パーツ個別の回転
        if (partName !== 'body') {
          mesh.rotation.z = phys.rotSpeed * partEase;
        }
      }
    } else {
      // ===== 通常（生存時） =====
      // 全体の回転リセット
      groupRef.current.rotation.x = 0;
      groupRef.current.position.y = 0;

      // マテリアル戻す
      headRef.current.material = headMat;
      bodyRef.current.material = bodyMat;
      leftArmRef.current.material = armMat;
      rightArmRef.current.material = armMat;
      leftLegRef.current.material = SHARED_LEG_MATERIAL;
      rightLegRef.current.material = SHARED_LEG_MATERIAL;

      // 位置リセット
      headRef.current.position.copy(origPositions.head);
      bodyRef.current.position.copy(origPositions.body);
      leftArmRef.current.position.copy(origPositions.leftArm);
      rightArmRef.current.position.copy(origPositions.rightArm);
      leftLegRef.current.position.copy(origPositions.leftLeg);
      rightLegRef.current.position.copy(origPositions.rightLeg);

      // 回転リセット
      headRef.current.rotation.set(0, 0, 0);
      bodyRef.current.rotation.set(0, 0, 0);

      if (pose === 'seated') {
        // 車内では一体のボクセルパーツを座席に収まる姿勢へ固定する
        bodyRef.current.position.y = 0.92;
        headRef.current.position.y = 1.5;
        leftArmRef.current.rotation.x = -0.22;
        rightArmRef.current.rotation.x = -0.22;
        leftLegRef.current.position.set(-0.15, 0.58, -0.22);
        rightLegRef.current.position.set(0.15, 0.58, -0.22);
        leftLegRef.current.rotation.x = Math.PI / 2.25;
        rightLegRef.current.rotation.x = Math.PI / 2.25;
        leftArmRef.current.rotation.z = 0;
        rightArmRef.current.rotation.z = 0;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else if (equippedItem === 'rocket_launcher') {
        const pitch = THREE.MathUtils.clamp(aimPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
        // rocketRecoilProgress: 1=キック直後 → 0=収束
        const kick = THREE.MathUtils.clamp(rocketRecoilProgress, 0, 1);
        const kickEase = kick * kick;
        rightArmRef.current.position.set(
          0.43 + kickEase * 0.06,
          1.08 + kickEase * 0.04,
          -0.04 + kickEase * 0.22,
        );
        leftArmRef.current.position.set(-0.16 + kickEase * 0.04, 1.04 + kickEase * 0.03, -0.24 + kickEase * 0.16);
        rightArmRef.current.rotation.x = 1.24 + pitch * 0.35 - kickEase * 0.55;
        leftArmRef.current.rotation.x = 1.48 + pitch * 0.45 - kickEase * 0.4;
        rightArmRef.current.rotation.z = -0.26 - kickEase * 0.15;
        leftArmRef.current.rotation.z = 0.58 + kickEase * 0.1;
        bodyRef.current.rotation.x = -kickEase * 0.18;
        bodyRef.current.position.z = kickEase * 0.08;
        leftLegRef.current.rotation.x = kickEase * 0.2;
        rightLegRef.current.rotation.x = -kickEase * 0.25;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else if (equippedItem === 'machine_gun') {
        const pitch = THREE.MathUtils.clamp(aimPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
        const kick = THREE.MathUtils.clamp(gunRecoilProgress, 0, 1);
        const kickEase = kick * kick;
        const shake = kick > 0.05 ? Math.sin(performance.now() * 0.08) * kickEase * 0.04 : 0;
        rightArmRef.current.position.set(
          0.38 + shake,
          0.92 + kickEase * 0.03,
          -0.14 + kickEase * 0.12,
        );
        leftArmRef.current.position.set(-0.26 + shake * 0.5, 0.92, -0.2 + kickEase * 0.08);
        rightArmRef.current.rotation.x = 1.1 + pitch * 0.4 - kickEase * 0.28;
        leftArmRef.current.rotation.x = 1.16 + pitch * 0.45 - kickEase * 0.2;
        rightArmRef.current.rotation.z = -0.2 + shake;
        leftArmRef.current.rotation.z = 0.32;
        bodyRef.current.rotation.x = -kickEase * 0.06;
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else if (equippedItem === 'lightsaber') {
        const pitch = THREE.MathUtils.clamp(aimPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
        const swing = remoteMeleePose(saberSwingProgress);
        const swinging = saberSwingProgress > 0.01;
        // 刃を体の前へ構え、スイング時は大きく弧を描く
        rightArmRef.current.position.set(
          0.36 + swing.push * 0.2,
          0.9 + swing.lift * 0.9,
          -0.12 + swing.push * 0.7,
        );
        leftArmRef.current.position.set(
          -0.2 + (swinging ? 0.08 : 0),
          0.88 + swing.lift * 0.4,
          -0.13 + swing.push * 0.3,
        );
        rightArmRef.current.rotation.x = 1.32 + pitch * 0.34 + swing.pitch * 1.15;
        leftArmRef.current.rotation.x = 1.18 + pitch * 0.3 + swing.pitch * 0.45;
        rightArmRef.current.rotation.z = -0.28 + swing.roll * 1.1;
        leftArmRef.current.rotation.z = 0.42 + swing.roll * 0.35;
        rightArmRef.current.rotation.y = swing.roll * 0.4;
        bodyRef.current.rotation.y = swinging ? swing.roll * 0.35 : 0;
        bodyRef.current.rotation.x = swinging ? swing.pitch * 0.12 : 0;
        leftLegRef.current.rotation.x = swinging ? 0.2 : 0;
        rightLegRef.current.rotation.x = swinging ? -0.28 : 0;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else if (equippedItem === 'builder') {
        const pitch = THREE.MathUtils.clamp(aimPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
        const swing = remoteMeleePose(meleeSwingProgress);
        const swinging = meleeSwingProgress > 0.01;
        rightArmRef.current.position.set(
          0.48 + swing.push * 0.15,
          0.68 + swing.lift,
          -0.1 + swing.push * 0.6,
        );
        rightArmRef.current.rotation.x = 0.3 + pitch * 0.14 + swing.pitch;
        rightArmRef.current.rotation.z = -0.42 + swing.roll;
        rightArmRef.current.rotation.y = swing.roll * 0.35;
        // スイング中は左腕をバランス用に前へ
        leftArmRef.current.rotation.x = swinging
          ? -0.35 - swing.pitch * 0.15
          : isMoving ? Math.sin(performance.now() * 0.006) * 0.35 : 0;
        leftArmRef.current.rotation.z = swinging ? 0.25 : 0;
        // 踏み込み
        bodyRef.current.rotation.y = swinging ? swing.roll * 0.2 : 0;
        bodyRef.current.rotation.x = swinging ? swing.pitch * 0.08 : 0;
        leftLegRef.current.rotation.x = swinging
          ? 0.15
          : isMoving ? -Math.sin(performance.now() * 0.006) * 0.45 : 0;
        rightLegRef.current.rotation.x = swinging
          ? -0.25 + swing.push * 0.4
          : isMoving ? Math.sin(performance.now() * 0.006) * 0.45 : 0;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else if (isMoving) {
        // 歩行アニメーション
        const t = performance.now() * 0.006;
        const swing = Math.sin(t) * 0.6;

        leftArmRef.current.rotation.x = swing;
        rightArmRef.current.rotation.x = -swing;
        leftLegRef.current.rotation.x = -swing;
        rightLegRef.current.rotation.x = swing;
        // Z回転リセット
        leftArmRef.current.rotation.z = 0;
        rightArmRef.current.rotation.z = 0;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else {
        const speed = delta * 5;
        leftArmRef.current.rotation.x *= (1 - speed);
        rightArmRef.current.rotation.x *= (1 - speed);
        leftLegRef.current.rotation.x *= (1 - speed);
        rightLegRef.current.rotation.x *= (1 - speed);
        leftArmRef.current.rotation.z *= (1 - speed);
        rightArmRef.current.rotation.z *= (1 - speed);
        leftLegRef.current.rotation.z *= (1 - speed);
        rightLegRef.current.rotation.z *= (1 - speed);
      }
    }
  });

  if (skinId === 'warden') {
    return <WardenAvatar isMoving={isMoving} pose={pose} isDead={isDead} deathTime={deathTime} />;
  }

  return (
    <group ref={groupRef}>
      {/* 顔・髪・ヘルメット・ツノを1つのインスタンス描画へまとめる */}
      <mesh
        ref={headRef}
        geometry={SHARED_HEAD_GEOMETRY}
        material={headMat}
        position={[0, 1.55, 0]}
        castShadow
        receiveShadow
        dispose={null}
      >
        <ColoredDetailInstances details={headDetails} dimmed={isDead} />
      </mesh>

      {/* 体 */}
      <mesh
        ref={bodyRef}
        geometry={SHARED_BODY_GEOMETRY}
        material={bodyMat}
        position={[0, 0.9, 0]}
        castShadow
        receiveShadow
        dispose={null}
      >
        <ColoredDetailInstances details={bodyDetails} dimmed={isDead} />
      </mesh>

      {/* 左腕 */}
      <mesh
        ref={leftArmRef}
        geometry={SHARED_ARM_GEOMETRY}
        material={armMat}
        position={[-0.42, 0.85, 0]}
        castShadow
        receiveShadow
        dispose={null}
      />

      {/* 右腕 */}
      <mesh
        ref={rightArmRef}
        geometry={SHARED_ARM_GEOMETRY}
        material={armMat}
        position={[0.42, 0.85, 0]}
        castShadow
        receiveShadow
        dispose={null}
      />

      {/* 左足 */}
      <mesh
        ref={leftLegRef}
        geometry={legGeom}
        material={SHARED_LEG_MATERIAL}
        position={[-0.15, 0.3, 0]}
        castShadow
        receiveShadow
        dispose={null}
      />

      {/* 右足 */}
      <mesh
        ref={rightLegRef}
        geometry={legGeom}
        material={SHARED_LEG_MATERIAL}
        position={[0.15, 0.3, 0]}
        castShadow
        receiveShadow
        dispose={null}
      />
    </group>
  );
}

useGLTF.preload(WARDEN_MODEL_PATH);
