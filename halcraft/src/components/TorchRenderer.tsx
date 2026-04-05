// 松明レンダラーコンポーネント（InstancedMesh 最適化版 v2）
// 全松明を5つの InstancedMesh で一括描画し、パフォーマンスを最大化
// 静的パーツ（棒・受け）は初回のみ行列を設定、炎は距離LODで最適化

import { useMemo, useRef, useEffect } from 'react';
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

/** 炎アニメーション距離（この範囲外の松明は炎を静止表示） */
const ANIM_RANGE_SQ = 30 * 30;
/** 炎の簡易アニメーション距離（近すぎず遠すぎない中間距離–スケールのみ動かす） */
const ANIM_SIMPLE_RANGE_SQ = 50 * 50;
/** 炎アニメーションの更新頻度を間引くフレーム数 */
const ANIM_SKIP_FRAMES = 2;

/** 再利用用オブジェクト（GCプレッシャー削減） */
const _matrix = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3(1, 1, 1);
const _unitScale = new THREE.Vector3(1, 1, 1);

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
  // 静的パーツが初期化済みかのフラグ
  const staticInitRef = useRef(false);
  // アニメーション間引きカウンター
  const frameCountRef = useRef(0);

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

  const count = torchPositions.length;

  // 松明数が変わったらタイムオフセットを再生成 & 静的パーツリセット
  useMemo(() => {
    const offsets = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      offsets[i] = Math.random() * Math.PI * 2;
    }
    timeOffsetsRef.current = offsets;
    staticInitRef.current = false;
  }, [count]);

  // 静的パーツ（棒・受け）と遠距離松明の炎デフォルト位置を一度だけ設定
  useEffect(() => {
    staticInitRef.current = false;
  }, [torchPositions]);

  useFrame(({ camera, clock }) => {
    if (count === 0) return;

    const stick = stickRef.current;
    const holder = holderRef.current;
    const flame = flameRef.current;
    const innerFlame = innerFlameRef.current;
    const glow = glowRef.current;
    if (!stick || !holder || !flame || !innerFlame || !glow) return;

    // 静的パーツは松明が追加/削除された時のみ再計算
    if (!staticInitRef.current) {
      staticInitRef.current = true;
      for (let i = 0; i < count; i++) {
        const pos = torchPositions[i];
        const bx = pos.x + 0.5;
        const bz = pos.z + 0.5;

        // 棒
        _pos.set(bx, pos.y + 0.3, bz);
        _matrix.compose(_pos, _quat, _unitScale);
        stick.setMatrixAt(i, _matrix);

        // 受け
        _pos.set(bx, pos.y + 0.58, bz);
        _matrix.compose(_pos, _quat, _unitScale);
        holder.setMatrixAt(i, _matrix);

        // 炎のデフォルト位置（遠距離用）
        _pos.set(bx, pos.y + 0.75, bz);
        _matrix.compose(_pos, _quat, _unitScale);
        flame.setMatrixAt(i, _matrix);

        _pos.set(bx, pos.y + 0.72, bz);
        _matrix.compose(_pos, _quat, _unitScale);
        innerFlame.setMatrixAt(i, _matrix);
        glow.setMatrixAt(i, _matrix);
      }
      stick.instanceMatrix.needsUpdate = true;
      holder.instanceMatrix.needsUpdate = true;
      flame.instanceMatrix.needsUpdate = true;
      innerFlame.instanceMatrix.needsUpdate = true;
      glow.instanceMatrix.needsUpdate = true;
    }

    // フレーム間引き：炎アニメーションはN フレームに1回だけ更新
    frameCountRef.current++;
    if (frameCountRef.current % ANIM_SKIP_FRAMES !== 0) return;

    const t = clock.getElapsedTime();
    const offsets = timeOffsetsRef.current;
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;

    let flameChanged = false;

    for (let i = 0; i < count; i++) {
      const pos = torchPositions[i];
      const bx = pos.x + 0.5;
      const bz = pos.z + 0.5;

      // カメラからの距離
      const dx = bx - camX;
      const dy = pos.y - camY;
      const dz = bz - camZ;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq >= ANIM_SIMPLE_RANGE_SQ) {
        // 遠距離: アニメーションなし（初期化時のデフォルト位置のまま）
        continue;
      }

      flameChanged = true;
      const offset = offsets[i];
      const ti = t + offset;

      if (distSq < ANIM_RANGE_SQ) {
        // 近距離: フルアニメーション（位置揺れ + スケール変化）
        const flameScale = 1 + Math.sin(ti * 10) * 0.15;
        _pos.set(
          bx + Math.sin(ti * 6) * 0.02,
          pos.y + 0.75,
          bz + Math.cos(ti * 8) * 0.02,
        );
        _scl.set(flameScale, flameScale * 1.1, flameScale);
        _matrix.compose(_pos, _quat, _scl);
        flame.setMatrixAt(i, _matrix);

        const innerScale = 0.8 + Math.sin(ti * 12 + 1) * 0.2;
        _pos.set(
          bx + Math.sin(ti * 7 + 1) * 0.03,
          pos.y + 0.72,
          bz + Math.cos(ti * 9 + 2) * 0.03,
        );
        _scl.set(innerScale, innerScale * 1.2, innerScale);
        _matrix.compose(_pos, _quat, _scl);
        innerFlame.setMatrixAt(i, _matrix);

        const glowScale = 1 + Math.sin(ti * 7) * 0.1;
        _pos.set(bx, pos.y + 0.72, bz);
        _scl.set(glowScale, glowScale, glowScale);
        _matrix.compose(_pos, _quat, _scl);
        glow.setMatrixAt(i, _matrix);
      } else {
        // 中距離: 簡易アニメーション（スケールのみ、位置固定）
        const flameScale = 1 + Math.sin(ti * 8) * 0.1;
        _pos.set(bx, pos.y + 0.75, bz);
        _scl.set(flameScale, flameScale, flameScale);
        _matrix.compose(_pos, _quat, _scl);
        flame.setMatrixAt(i, _matrix);

        _pos.set(bx, pos.y + 0.72, bz);
        _matrix.compose(_pos, _quat, _scl);
        innerFlame.setMatrixAt(i, _matrix);
        glow.setMatrixAt(i, _matrix);
      }
    }

    if (flameChanged) {
      flame.instanceMatrix.needsUpdate = true;
      innerFlame.instanceMatrix.needsUpdate = true;
      glow.instanceMatrix.needsUpdate = true;
    }
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
