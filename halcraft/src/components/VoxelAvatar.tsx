// ============================================
// VoxelAvatar — マイクラ風ボクセルキャラクター
// BoxGeometry で構成された人型アバター
// 死亡時: パーツが崩れ落ちるアニメーション
// ============================================

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface VoxelAvatarProps {
  /** スキンカラー（体・腕の色） */
  color: string;
  /** 移動中か（歩行アニメーション用） */
  isMoving: boolean;
  /** 死亡状態か */
  isDead?: boolean;
  /** 死亡開始時刻（Date.now()） */
  deathTime?: number;
}

/** 死亡アニメーションの総時間（秒） */
const DEATH_ANIM_DURATION = 1.2;

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

export function VoxelAvatar({ color, isMoving, isDead = false, deathTime = 0 }: VoxelAvatarProps) {
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // マテリアルをメモ化
  const bodyMat = useMemo(() => new THREE.MeshLambertMaterial({ color }), [color]);
  const skinMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#ffcc99' }), []);
  const legMat = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(0.7);
    return new THREE.MeshLambertMaterial({ color: c });
  }, [color]);
  // 死亡時のグレーアウトマテリアル
  const deadBodyMat = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(0.4);
    return new THREE.MeshLambertMaterial({ color: c });
  }, [color]);
  const deadSkinMat = useMemo(() => new THREE.MeshLambertMaterial({ color: '#999988' }), []);
  const deadLegMat = useMemo(() => {
    const c = new THREE.Color(color);
    c.multiplyScalar(0.3);
    return new THREE.MeshLambertMaterial({ color: c });
  }, [color]);

  // ジオメトリをメモ化
  const headGeom = useMemo(() => new THREE.BoxGeometry(0.5, 0.5, 0.5), []);
  const bodyGeom = useMemo(() => new THREE.BoxGeometry(0.6, 0.8, 0.4), []);
  const armGeom = useMemo(() => new THREE.BoxGeometry(0.25, 0.7, 0.25), []);
  const legGeom = useMemo(() => new THREE.BoxGeometry(0.25, 0.6, 0.3), []);

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
      headRef.current.material = deadSkinMat;
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
      headRef.current.material = skinMat;
      bodyRef.current.material = bodyMat;
      leftArmRef.current.material = bodyMat;
      rightArmRef.current.material = bodyMat;
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

      // 歩行アニメーション
      if (isMoving) {
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

  return (
    <group ref={groupRef}>
      {/* 頭 */}
      <mesh ref={headRef} geometry={headGeom} material={skinMat} position={[0, 1.55, 0]} castShadow />

      {/* 体 */}
      <mesh ref={bodyRef} geometry={bodyGeom} material={bodyMat} position={[0, 0.9, 0]} castShadow />

      {/* 左腕 */}
      <mesh
        ref={leftArmRef}
        geometry={armGeom}
        material={bodyMat}
        position={[-0.42, 0.85, 0]}
        castShadow
      />

      {/* 右腕 */}
      <mesh
        ref={rightArmRef}
        geometry={armGeom}
        material={bodyMat}
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
