// ジェットコースター車体コンポーネント
// レール上を走行するボクセルスタイルのカート
// 搭乗検出・物理更新・カメラ追従を担当

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCoasterStore } from '../stores/useCoasterStore';
import { useGameStore } from '../stores/useGameStore';

/** カートの色 */
const CART_BODY_COLOR = 0xdd3333;  // 赤いカート
const CART_TRIM_COLOR = 0xffcc00;  // 黄色いトリム
const CART_WHEEL_COLOR = 0x333333; // 車輪

/** カートのボクセル3Dモデルを構築 */
function createCartGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const bodyColor = new THREE.Color(CART_BODY_COLOR);
  const trimColor = new THREE.Color(CART_TRIM_COLOR);
  const wheelColor = new THREE.Color(CART_WHEEL_COLOR);

  // 車体本体（箱型）
  addColoredBox(positions, normals, colors, 0, 0.35, 0, 0.8, 0.5, 1.2, bodyColor);
  // 前面トリム
  addColoredBox(positions, normals, colors, 0, 0.55, -0.55, 0.85, 0.12, 0.12, trimColor);
  // 後面トリム
  addColoredBox(positions, normals, colors, 0, 0.55, 0.55, 0.85, 0.12, 0.12, trimColor);
  // サイドトリム左
  addColoredBox(positions, normals, colors, -0.42, 0.55, 0, 0.04, 0.12, 1.2, trimColor);
  // サイドトリム右
  addColoredBox(positions, normals, colors, 0.42, 0.55, 0, 0.04, 0.12, 1.2, trimColor);
  // 車輪4つ
  addColoredBox(positions, normals, colors, -0.35, 0.05, -0.35, 0.15, 0.15, 0.15, wheelColor);
  addColoredBox(positions, normals, colors, 0.35, 0.05, -0.35, 0.15, 0.15, 0.15, wheelColor);
  addColoredBox(positions, normals, colors, -0.35, 0.05, 0.35, 0.15, 0.15, 0.15, wheelColor);
  addColoredBox(positions, normals, colors, 0.35, 0.05, 0.35, 0.15, 0.15, 0.15, wheelColor);
  // 座席
  addColoredBox(positions, normals, colors, 0, 0.3, 0.1, 0.55, 0.08, 0.5, new THREE.Color(0x8b4513));
  // 背もたれ
  addColoredBox(positions, normals, colors, 0, 0.5, 0.35, 0.55, 0.35, 0.08, new THREE.Color(0x8b4513));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

/** 頂点色付き直方体を追加 */
function addColoredBox(
  positions: number[], normals: number[], colors: number[],
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  color: THREE.Color,
): void {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  // 6面の法線と頂点
  const faces: Array<{ n: [number, number, number]; verts: number[] }> = [
    { n: [0, 0, 1], verts: [cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz + hz, cx + hx, cy + hy, cz + hz, cx - hx, cy - hy, cz + hz, cx + hx, cy + hy, cz + hz, cx - hx, cy + hy, cz + hz] },
    { n: [0, 0, -1], verts: [cx + hx, cy - hy, cz - hz, cx - hx, cy - hy, cz - hz, cx - hx, cy + hy, cz - hz, cx + hx, cy - hy, cz - hz, cx - hx, cy + hy, cz - hz, cx + hx, cy + hy, cz - hz] },
    { n: [0, 1, 0], verts: [cx - hx, cy + hy, cz - hz, cx - hx, cy + hy, cz + hz, cx + hx, cy + hy, cz + hz, cx - hx, cy + hy, cz - hz, cx + hx, cy + hy, cz + hz, cx + hx, cy + hy, cz - hz] },
    { n: [0, -1, 0], verts: [cx - hx, cy - hy, cz + hz, cx - hx, cy - hy, cz - hz, cx + hx, cy - hy, cz - hz, cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz - hz, cx + hx, cy - hy, cz + hz] },
    { n: [1, 0, 0], verts: [cx + hx, cy - hy, cz + hz, cx + hx, cy - hy, cz - hz, cx + hx, cy + hy, cz - hz, cx + hx, cy - hy, cz + hz, cx + hx, cy + hy, cz - hz, cx + hx, cy + hy, cz + hz] },
    { n: [-1, 0, 0], verts: [cx - hx, cy - hy, cz - hz, cx - hx, cy - hy, cz + hz, cx - hx, cy + hy, cz + hz, cx - hx, cy - hy, cz - hz, cx - hx, cy + hy, cz + hz, cx - hx, cy + hy, cz - hz] },
  ];
  for (const face of faces) {
    for (let i = 0; i < face.verts.length; i += 3) {
      positions.push(face.verts[i], face.verts[i + 1], face.verts[i + 2]);
      normals.push(face.n[0], face.n[1], face.n[2]);
      colors.push(color.r, color.g, color.b);
    }
  }
}

// 再利用ベクトル（GC防止）
const _cartQuat = new THREE.Quaternion();
const _cartEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _cameraTarget = new THREE.Vector3();
const _cameraLookAt = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

/** スムーズカメラの現在位置（ストア外で管理） */
const smoothCamera = {
  position: new THREE.Vector3(),
  initialized: false,
};

export function CoasterCart() {
  const meshRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const cartGeo = useMemo(() => createCartGeometry(), []);

  const cartSpawned = useCoasterStore((s) => s.cartSpawned);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const state = useCoasterStore.getState();
    const gamePhase = useGameStore.getState().phase;
    if (!state.cartSpawned || gamePhase !== 'playing') return;

    // 搭乗中のみ物理更新
    if (state.isBoarded) {
      state.updatePhysics(dt);
    }

    // カートの位置・回転を更新
    const group = meshRef.current;
    if (group) {
      group.position.set(state.cartX, state.cartY, state.cartZ);
      _cartEuler.set(state.cartPitch, state.cartYaw, state.cartRoll, 'YXZ');
      _cartQuat.setFromEuler(_cartEuler);
      group.quaternion.copy(_cartQuat);
    }

    // 搭乗中のカメラ追従（三人称）
    if (state.isBoarded) {
      const CAMERA_HEIGHT = 3.5;
      const CAMERA_BACK = 6;
      const FOLLOW_RATE = 6;

      // カメラ位置: カートの後方上方
      _cameraTarget.set(0, CAMERA_HEIGHT, CAMERA_BACK);
      _cameraTarget.applyAxisAngle(_yAxis, state.cartYaw);
      _cameraTarget.add(new THREE.Vector3(state.cartX, state.cartY, state.cartZ));

      if (!smoothCamera.initialized) {
        smoothCamera.position.copy(_cameraTarget);
        smoothCamera.initialized = true;
      } else {
        smoothCamera.position.lerp(_cameraTarget, 1 - Math.exp(-FOLLOW_RATE * dt));
      }

      camera.position.copy(smoothCamera.position);
      _cameraLookAt.set(state.cartX, state.cartY + 0.8, state.cartZ);
      camera.lookAt(_cameraLookAt);
    }
  });

  if (!cartSpawned) return null;

  return (
    <group ref={meshRef}>
      <mesh geometry={cartGeo} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
      {/* カートの影 */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.9, 1.3]} />
        <meshBasicMaterial color={0x000000} transparent opacity={0.15} />
      </mesh>
    </group>
  );
}
