// 松明レンダラーコンポーネント（InstancedMesh 最適化版）
// 全松明を5つの InstancedMesh で一括描画し、パフォーマンスを最大化
// 個別コンポーネント方式 → InstancedMesh 方式でメッシュ数を劇的に削減

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_IDS, CHUNK_SIZE, WORLD_HEIGHT } from '../types/blocks';
import { useWorldStore } from '../stores/useWorldStore';

interface TorchPosition {
  x: number;
  y: number;
  z: number;
}

// 共有マテリアル（全松明で再利用）
const stickMaterial = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.9 });
const holderMaterial = new THREE.MeshStandardMaterial({
  color: 0x444444, roughness: 0.7,
  emissive: new THREE.Color(0x331100), emissiveIntensity: 0.3,
});
const flameMaterial = new THREE.MeshStandardMaterial({
  color: 0xff6600, emissive: new THREE.Color(0xff4400), emissiveIntensity: 2.0,
  transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
});
const innerFlameMaterial = new THREE.MeshStandardMaterial({
  color: 0xffaa00, emissive: new THREE.Color(0xffcc22), emissiveIntensity: 3.0,
  transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
});
const glowMaterial = new THREE.MeshBasicMaterial({
  color: 0xff8844, transparent: true, opacity: 0.15,
  side: THREE.DoubleSide, depthWrite: false,
});

// 共有ジオメトリ
const stickGeom = new THREE.BoxGeometry(0.12, 0.6, 0.12);
const holderGeom = new THREE.BoxGeometry(0.16, 0.08, 0.16);
const flameGeom = new THREE.ConeGeometry(0.10, 0.28, 6);
const innerFlameGeom = new THREE.ConeGeometry(0.06, 0.20, 5);
const glowGeom = new THREE.SphereGeometry(0.18, 8, 8);

/** アニメーション更新する最大距離（この範囲外の松明は静止表示） */
const ANIMATION_RANGE = 40;
/** アニメーション距離の二乗（毎フレーム平方根を避ける） */
const ANIMATION_RANGE_SQ = ANIMATION_RANGE * ANIMATION_RANGE;

/** 再利用用の行列・ベクトル（GCプレッシャー削減） */
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

/** ワールド内のすべての松明を InstancedMesh で一括描画 */
export function TorchRenderer() {
  const chunks = useWorldStore((s) => s.chunks);
  const chunkVersions = useWorldStore((s) => s.chunkVersions);

  // InstancedMesh の ref
  const stickRef = useRef<THREE.InstancedMesh>(null);
  const holderRef = useRef<THREE.InstancedMesh>(null);
  const flameRef = useRef<THREE.InstancedMesh>(null);
  const innerFlameRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);

  // 各松明のランダムなタイムオフセット（炎のゆらぎを個別化）
  const timeOffsetsRef = useRef<Float32Array>(new Float32Array(0));

  // 全チャンクから松明の位置を収集
  const torchPositions = useMemo(() => {
    const positions: TorchPosition[] = [];

    chunks.forEach((chunkData, key) => {
      const [cx, cz] = key.split(',').map(Number);

      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        for (let ly = 0; ly < WORLD_HEIGHT; ly++) {
          for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            if (chunkData[lx][ly][lz] === BLOCK_IDS.TORCH) {
              positions.push({
                x: cx * CHUNK_SIZE + lx,
                y: ly,
                z: cz * CHUNK_SIZE + lz,
              });
            }
          }
        }
      }
    });

    return positions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks, chunkVersions]);

  // 松明数が変わったらタイムオフセットを再生成
  const count = torchPositions.length;
  useMemo(() => {
    const offsets = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      offsets[i] = Math.random() * Math.PI * 2;
    }
    timeOffsetsRef.current = offsets;
  }, [count]);

  // 静的パーツ（棒と受け）の初期配置 + 炎アニメーションの一括更新
  useFrame(({ camera, clock }) => {
    if (count === 0) return;

    const stick = stickRef.current;
    const holder = holderRef.current;
    const flame = flameRef.current;
    const innerFlame = innerFlameRef.current;
    const glow = glowRef.current;
    if (!stick || !holder || !flame || !innerFlame || !glow) return;

    const t = clock.getElapsedTime();
    const offsets = timeOffsetsRef.current;
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;

    for (let i = 0; i < count; i++) {
      const pos = torchPositions[i];
      const baseX = pos.x + 0.5;
      const baseZ = pos.z + 0.5;

      // 棒（静的）
      _position.set(baseX, pos.y + 0.3, baseZ);
      _matrix.compose(_position, _quaternion, _scale);
      stick.setMatrixAt(i, _matrix);

      // 受け（静的）
      _position.set(baseX, pos.y + 0.58, baseZ);
      _matrix.compose(_position, _quaternion, _scale);
      holder.setMatrixAt(i, _matrix);

      // カメラからの距離でアニメーション判定
      const dx = baseX - camX;
      const dy = pos.y - camY;
      const dz = baseZ - camZ;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < ANIMATION_RANGE_SQ) {
        // 近い松明: 炎のアニメーション
        const offset = offsets[i];
        const ti = t + offset;

        // メインの炎
        const flameScale = 1 + Math.sin(ti * 10) * 0.15;
        _position.set(
          baseX + Math.sin(ti * 6) * 0.02,
          pos.y + 0.75,
          baseZ + Math.cos(ti * 8) * 0.02,
        );
        _scale.set(flameScale, flameScale * 1.1, flameScale);
        _matrix.compose(_position, _quaternion, _scale);
        flame.setMatrixAt(i, _matrix);

        // 内側の炎
        const innerScale = 0.8 + Math.sin(ti * 12 + 1) * 0.2;
        _position.set(
          baseX + Math.sin(ti * 7 + 1) * 0.03,
          pos.y + 0.72,
          baseZ + Math.cos(ti * 9 + 2) * 0.03,
        );
        _scale.set(innerScale, innerScale * 1.2, innerScale);
        _matrix.compose(_position, _quaternion, _scale);
        innerFlame.setMatrixAt(i, _matrix);

        // グロー
        const glowScale = 1 + Math.sin(ti * 7) * 0.1;
        _position.set(baseX, pos.y + 0.72, baseZ);
        _scale.set(glowScale, glowScale, glowScale);
        _matrix.compose(_position, _quaternion, _scale);
        glow.setMatrixAt(i, _matrix);
      } else {
        // 遠い松明: 静止表示（スケール固定）
        _scale.set(1, 1, 1);

        _position.set(baseX, pos.y + 0.75, baseZ);
        _matrix.compose(_position, _quaternion, _scale);
        flame.setMatrixAt(i, _matrix);

        _position.set(baseX, pos.y + 0.72, baseZ);
        _matrix.compose(_position, _quaternion, _scale);
        innerFlame.setMatrixAt(i, _matrix);

        _position.set(baseX, pos.y + 0.72, baseZ);
        _matrix.compose(_position, _quaternion, _scale);
        glow.setMatrixAt(i, _matrix);
      }
    }

    // InstancedMesh に変更通知
    stick.instanceMatrix.needsUpdate = true;
    holder.instanceMatrix.needsUpdate = true;
    flame.instanceMatrix.needsUpdate = true;
    innerFlame.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <group>
      {/* 棒 */}
      <instancedMesh
        ref={stickRef}
        args={[stickGeom, stickMaterial, count]}
        frustumCulled={false}
      />
      {/* 受け */}
      <instancedMesh
        ref={holderRef}
        args={[holderGeom, holderMaterial, count]}
        frustumCulled={false}
      />
      {/* メインの炎 */}
      <instancedMesh
        ref={flameRef}
        args={[flameGeom, flameMaterial, count]}
        frustumCulled={false}
      />
      {/* 内側の炎 */}
      <instancedMesh
        ref={innerFlameRef}
        args={[innerFlameGeom, innerFlameMaterial, count]}
        frustumCulled={false}
      />
      {/* グロー */}
      <instancedMesh
        ref={glowRef}
        args={[glowGeom, glowMaterial, count]}
        frustumCulled={false}
      />
    </group>
  );
}
