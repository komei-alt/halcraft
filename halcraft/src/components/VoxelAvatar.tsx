// ============================================
// VoxelAvatar — マイクラ風ボクセルキャラクター
// BoxGeometry で構成された人型アバター
// 死亡時: パーツが崩れ落ちるアニメーション
// スキン対応: skinId で各パーツの色を変更
// ============================================

import { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { type SkinId, SKIN_DEFS, DEFAULT_SKIN_ID } from '../types/skins';
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
  /** 死亡状態か */
  isDead?: boolean;
  /** 死亡開始時刻（Date.now()） */
  deathTime?: number;
}

/** 死亡アニメーションの総時間（秒） */
const DEATH_ANIM_DURATION = 1.2;
const WARDEN_MODEL_PATH = '/models/2026-04-29/warden.glb';
const MAX_REMOTE_AIM_PITCH = Math.PI / 3;

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

export function VoxelAvatar({
  skinId,
  color,
  isMoving,
  pose = 'standing',
  equippedItem = 'builder',
  aimPitch = 0,
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

  const legMat = useMemo(() =>
    new THREE.MeshLambertMaterial({ color: fallbackColor ? new THREE.Color(fallbackColor).multiplyScalar(0.7) : skin.colors.legs }),
    [skin, fallbackColor]);

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

  // ツノ用アクセサリーマテリアル
  const accessoryMat = useMemo(() => {
    if (!skin.hasHeadAccessory) return null;
    return new THREE.MeshLambertMaterial({ color: skin.accessoryColor || '#881100' });
  }, [skin]);

  // ジオメトリをメモ化
  const headGeom = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, 0.5), []);
  const bodyGeom = useMemo(() => new THREE.BoxGeometry(0.6, 0.8, 0.4), []);
  const armGeom = useMemo(() => new THREE.BoxGeometry(0.25, 0.7, 0.25), []);
  const legGeom = useMemo(() => new THREE.BoxGeometry(0.25, 0.6, 0.3), []);
  const hornGeom = useMemo(() => new THREE.BoxGeometry(0.08, 0.2, 0.08), []);

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
      leftLegRef.current.material = legMat;
      rightLegRef.current.material = legMat;

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
        rightArmRef.current.position.set(0.43, 1.08, -0.04);
        leftArmRef.current.position.set(-0.16, 1.04, -0.24);
        rightArmRef.current.rotation.x = 1.24 + pitch * 0.35;
        leftArmRef.current.rotation.x = 1.48 + pitch * 0.45;
        rightArmRef.current.rotation.z = -0.26;
        leftArmRef.current.rotation.z = 0.58;
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else if (equippedItem === 'machine_gun') {
        const pitch = THREE.MathUtils.clamp(aimPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
        rightArmRef.current.position.set(0.38, 0.92, -0.14);
        leftArmRef.current.position.set(-0.26, 0.92, -0.2);
        rightArmRef.current.rotation.x = 1.1 + pitch * 0.4;
        leftArmRef.current.rotation.x = 1.16 + pitch * 0.45;
        rightArmRef.current.rotation.z = -0.2;
        leftArmRef.current.rotation.z = 0.32;
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
        leftLegRef.current.rotation.z = 0;
        rightLegRef.current.rotation.z = 0;
      } else if (equippedItem === 'builder') {
        const pitch = THREE.MathUtils.clamp(aimPitch, -MAX_REMOTE_AIM_PITCH, MAX_REMOTE_AIM_PITCH);
        rightArmRef.current.position.set(0.48, 0.68, -0.1);
        rightArmRef.current.rotation.x = 0.3 + pitch * 0.14;
        rightArmRef.current.rotation.z = -0.42;
        leftArmRef.current.rotation.x = isMoving ? Math.sin(performance.now() * 0.006) * 0.35 : 0;
        leftArmRef.current.rotation.z = 0;
        leftLegRef.current.rotation.x = isMoving ? -Math.sin(performance.now() * 0.006) * 0.45 : 0;
        rightLegRef.current.rotation.x = isMoving ? Math.sin(performance.now() * 0.006) * 0.45 : 0;
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
      {/* 頭 */}
      <mesh ref={headRef} geometry={headGeom} material={headMat} position={[0, 1.55, 0]} castShadow />

      {/* ツノ（赤ウォーデンなど、headAccessory付きスキン） */}
      {skin.hasHeadAccessory && accessoryMat && (
        <>
          <mesh
            geometry={hornGeom}
            material={accessoryMat}
            position={[-0.15, 1.88, 0]}
            rotation={[0, 0, -0.2]}
            castShadow
          />
          <mesh
            geometry={hornGeom}
            material={accessoryMat}
            position={[0.15, 1.88, 0]}
            rotation={[0, 0, 0.2]}
            castShadow
          />
        </>
      )}

      {/* 体 */}
      <mesh ref={bodyRef} geometry={bodyGeom} material={bodyMat} position={[0, 0.9, 0]} castShadow />

      {/* 左腕 */}
      <mesh
        ref={leftArmRef}
        geometry={armGeom}
        material={armMat}
        position={[-0.42, 0.85, 0]}
        castShadow
      />

      {/* 右腕 */}
      <mesh
        ref={rightArmRef}
        geometry={armGeom}
        material={armMat}
        position={[0.42, 0.85, 0]}
        castShadow
      />

      {/* 左足 */}
      <mesh
        ref={leftLegRef}
        geometry={legGeom}
        material={legMat}
        position={[-0.15, 0.3, 0]}
        castShadow
      />

      {/* 右足 */}
      <mesh
        ref={rightLegRef}
        geometry={legGeom}
        material={legMat}
        position={[0.15, 0.3, 0]}
        castShadow
      />
    </group>
  );
}

useGLTF.preload(WARDEN_MODEL_PATH);
