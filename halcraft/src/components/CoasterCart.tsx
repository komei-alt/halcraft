// ジェットコースター車体コンポーネント v2
// レール上を走行するボクセルスタイルのカート
// 搭乗検出・物理更新・カメラ追従を担当

import { useRef, useMemo, useLayoutEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { coasterRuntime, useCoasterStore } from '../stores/useCoasterStore';
import { useGameStore } from '../stores/useGameStore';
import { COASTER_MAX_SPEED } from '../utils/coasterPhysics';

/** カートの色 */
const CART_BODY_COLOR = 0xdd3333;  // 赤いカート
const CART_TRIM_COLOR = 0xffcc00;  // 黄色いトリム
const CART_WHEEL_COLOR = 0x333333; // 車輪
const CART_METAL_COLOR = 0x58616c;
const CART_SEAT_COLOR = 0x6f351d;
const CART_LIGHT_COLOR = 0xfff0a0;

/** カートのボクセル3Dモデルを構築 */
function createCartGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const bodyColor = new THREE.Color(CART_BODY_COLOR);
  const trimColor = new THREE.Color(CART_TRIM_COLOR);
  const wheelColor = new THREE.Color(CART_WHEEL_COLOR);
  const metalColor = new THREE.Color(CART_METAL_COLOR);
  const seatColor = new THREE.Color(CART_SEAT_COLOR);
  const lightColor = new THREE.Color(CART_LIGHT_COLOR);

  // 低いシャシーと左右の外板。中央を開けて、座席と拘束バーが読める形にする。
  addColoredBox(positions, normals, colors, 0, 0.22, 0, 0.82, 0.26, 1.16, bodyColor);
  addColoredBox(positions, normals, colors, -0.37, 0.46, 0.02, 0.1, 0.34, 1.08, bodyColor);
  addColoredBox(positions, normals, colors, 0.37, 0.46, 0.02, 0.1, 0.34, 1.08, bodyColor);
  addColoredBox(positions, normals, colors, 0, 0.42, 0.51, 0.68, 0.34, 0.12, bodyColor);

  // 2段ノーズとバンパーで、進行方向（-Z）が一目で分かるシルエットにする。
  addColoredBox(positions, normals, colors, 0, 0.35, -0.52, 0.72, 0.28, 0.2, bodyColor);
  addColoredBox(positions, normals, colors, 0, 0.25, -0.65, 0.58, 0.18, 0.12, bodyColor);
  addColoredBox(positions, normals, colors, 0, 0.28, -0.73, 0.76, 0.1, 0.08, trimColor);
  addColoredBox(positions, normals, colors, -0.23, 0.39, -0.635, 0.14, 0.09, 0.035, lightColor);
  addColoredBox(positions, normals, colors, 0.23, 0.39, -0.635, 0.14, 0.09, 0.035, lightColor);

  // 車体を一周する黄色い安全トリム。
  addColoredBox(positions, normals, colors, 0, 0.6, -0.49, 0.82, 0.1, 0.1, trimColor);
  addColoredBox(positions, normals, colors, 0, 0.6, 0.5, 0.82, 0.1, 0.1, trimColor);
  addColoredBox(positions, normals, colors, -0.43, 0.57, 0, 0.04, 0.1, 1.06, trimColor);
  addColoredBox(positions, normals, colors, 0.43, 0.57, 0, 0.04, 0.1, 1.06, trimColor);

  // 座面・背もたれ・ヘッドレスト。
  addColoredBox(positions, normals, colors, 0, 0.39, 0.12, 0.56, 0.1, 0.46, seatColor);
  addColoredBox(positions, normals, colors, 0, 0.62, 0.36, 0.56, 0.42, 0.1, seatColor);
  addColoredBox(positions, normals, colors, 0, 0.84, 0.39, 0.32, 0.16, 0.1, seatColor);

  // 肩から下りる拘束バー。車体と同じ統合ジオメトリ内なので追加ドローは発生しない。
  addColoredBox(positions, normals, colors, -0.24, 0.74, 0.12, 0.07, 0.44, 0.07, metalColor);
  addColoredBox(positions, normals, colors, 0.24, 0.74, 0.12, 0.07, 0.44, 0.07, metalColor);
  addColoredBox(positions, normals, colors, 0, 0.56, -0.02, 0.58, 0.08, 0.09, metalColor);
  addColoredBox(positions, normals, colors, 0, 0.53, -0.08, 0.22, 0.1, 0.14, trimColor);

  // 前後ボギーと車軸。
  for (const z of [-0.34, 0.34]) {
    addColoredBox(positions, normals, colors, 0, 0.08, z, 0.62, 0.1, 0.18, metalColor);
    addColoredBox(positions, normals, colors, 0, 0.03, z, 0.92, 0.06, 0.08, metalColor);
    addColoredBox(positions, normals, colors, -0.43, 0.04, z, 0.17, 0.18, 0.18, wheelColor);
    addColoredBox(positions, normals, colors, 0.43, 0.04, z, 0.17, 0.18, 0.18, wheelColor);
  }

  // 編成を連結できる前後カプラー。
  addColoredBox(positions, normals, colors, 0, 0.12, -0.76, 0.09, 0.09, 0.24, metalColor);
  addColoredBox(positions, normals, colors, 0, 0.12, -0.9, 0.24, 0.12, 0.08, metalColor);
  addColoredBox(positions, normals, colors, 0, 0.12, 0.68, 0.09, 0.09, 0.24, metalColor);
  addColoredBox(positions, normals, colors, 0, 0.12, 0.82, 0.24, 0.12, 0.08, metalColor);

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
const _cameraForward = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

/** スムーズカメラの現在位置（ストア外で管理） */
const smoothCamera = {
  position: new THREE.Vector3(),
  initialized: false,
};

export function CoasterCart() {
  const meshRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const { camera } = useThree();
  const baseFov = useRef<number | null>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const cartGeo = useMemo(() => createCartGeometry(), []);

  const cartSpawned = useCoasterStore((s) => s.cartSpawned);
  const wasBoarded = useRef(false);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const state = useCoasterStore.getState();
    const gamePhase = useGameStore.getState().phase;
    if (!state.cartSpawned || gamePhase !== 'playing') return;

    // 搭乗状態の変化を検出 → カメラ初期化
    if (state.isBoarded && !wasBoarded.current) {
      smoothCamera.initialized = false; // 搭乗開始時にカメラをリセット
    }
    wasBoarded.current = state.isBoarded;

    // 搭乗中のみ物理更新
    if (state.isBoarded) {
      state.updatePhysics(dt);
    }

    // ★ updatePhysics後の最新状態を再取得（stateは古い参照）
    const latest = useCoasterStore.getState();
    const speedFactor = Math.min(1, Math.abs(latest.speed) / COASTER_MAX_SPEED);

    // カートの位置・回転を更新
    const group = meshRef.current;
    if (group) {
      group.position.set(latest.cartX, latest.cartY, latest.cartZ);
      _cartEuler.set(latest.cartPitch, latest.cartYaw, latest.cartRoll, 'YXZ');
      _cartQuat.setFromEuler(_cartEuler);
      group.quaternion.copy(_cartQuat);
    }
    if (lightRef.current) {
      lightRef.current.intensity = 0.4 + speedFactor * 1.8 + (latest.onChainLift ? 0.8 : 0);
      lightRef.current.distance = 4 + speedFactor * 5;
    }

    // 搭乗中のカメラ追従（三人称）
    if (latest.isBoarded) {
      const CAMERA_HEIGHT = 3.15 + speedFactor * 0.85;
      const CAMERA_BACK = 5.4 + speedFactor * 1.8;
      const FOLLOW_RATE = 6.5 + speedFactor * 2.5;
      const shake = speedFactor > 0.25
        ? Math.sin(performance.now() * 0.036) * speedFactor * 0.055
        : 0;

      // カメラ位置: カートの後方上方
      _cameraTarget.set(shake, CAMERA_HEIGHT + Math.abs(shake) * 0.6, CAMERA_BACK);
      _cameraTarget.applyAxisAngle(_yAxis, latest.cartYaw);
      _cameraTarget.x += latest.cartX;
      _cameraTarget.y += latest.cartY;
      _cameraTarget.z += latest.cartZ;

      if (!smoothCamera.initialized) {
        smoothCamera.position.copy(_cameraTarget);
        smoothCamera.initialized = true;
      } else {
        smoothCamera.position.lerp(_cameraTarget, 1 - Math.exp(-FOLLOW_RATE * dt));
      }

      camera.position.copy(smoothCamera.position);
      _cameraForward.copy(coasterRuntime.tangent).multiplyScalar(2.0 + speedFactor * 3.5);
      _cameraLookAt.set(
        latest.cartX + _cameraForward.x,
        latest.cartY + 0.75 + _cameraForward.y * 0.5,
        latest.cartZ + _cameraForward.z,
      );
      camera.lookAt(_cameraLookAt);

      if (camera instanceof THREE.PerspectiveCamera) {
        perspectiveCameraRef.current = camera;
        const perspectiveCamera = perspectiveCameraRef.current;
        if (baseFov.current === null) baseFov.current = perspectiveCamera.fov;
        const targetFov = baseFov.current + speedFactor * 9;
        perspectiveCamera.fov = perspectiveCamera.fov + (targetFov - perspectiveCamera.fov) * (1 - Math.exp(-4 * dt));
        perspectiveCamera.updateProjectionMatrix();
      }
    } else if (camera instanceof THREE.PerspectiveCamera && baseFov.current !== null) {
      perspectiveCameraRef.current = camera;
      const perspectiveCamera = perspectiveCameraRef.current;
      perspectiveCamera.fov = perspectiveCamera.fov + (baseFov.current - perspectiveCamera.fov) * (1 - Math.exp(-5 * dt));
      perspectiveCamera.updateProjectionMatrix();
    }
  });

  // 初フレームで原点に一瞬出るのを防ぐ（ストア座標で事前同期）
  useLayoutEffect(() => {
    if (!cartSpawned) return;
    const group = meshRef.current;
    if (!group) return;
    const latest = useCoasterStore.getState();
    group.position.set(latest.cartX, latest.cartY, latest.cartZ);
    _cartEuler.set(latest.cartPitch, latest.cartYaw, latest.cartRoll, 'YXZ');
    _cartQuat.setFromEuler(_cartEuler);
    group.quaternion.copy(_cartQuat);
  }, [cartSpawned]);

  if (!cartSpawned) return null;

  return (
    <group ref={meshRef} visible={cartSpawned}>
      <mesh geometry={cartGeo} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>
      {/* カートの影（レールとの z-fight を避ける） */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.9, 1.3]} />
        <meshBasicMaterial
          color={0x000000}
          transparent
          opacity={0.15}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <pointLight
        ref={lightRef}
        position={[0, 0.65, -0.45]}
        color={0xffcc66}
        intensity={0.6}
        distance={5}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}
