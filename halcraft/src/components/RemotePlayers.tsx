// ============================================
// RemotePlayers — 他プレイヤーの一括描画
// useMultiplayerStore のリモートプレイヤーを VoxelAvatar + NameTag で表示
// ============================================

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useMultiplayerStore } from '../stores/useMultiplayerStore';
import { VoxelAvatar } from './VoxelAvatar';

export function RemotePlayers() {
  const remotePlayers = useMultiplayerStore((s) => s.remotePlayers);
  const interpolateRemotePlayers = useMultiplayerStore((s) => s.interpolateRemotePlayers);

  // 毎フレーム補間を実行
  useFrame((_, delta) => {
    interpolateRemotePlayers(delta);
  });

  // Map を配列に変換
  const playerArray = useMemo(
    () => Array.from(remotePlayers.values()),
    [remotePlayers],
  );

  return (
    <>
      {playerArray.map((player) => (
        <RemotePlayerModel key={player.id} player={player} />
      ))}
    </>
  );
}

/** 個別プレイヤーのモデル表示 */
function RemotePlayerModel({
  player,
}: {
  player: {
    id: string;
    name: string;
    color: string;
    position: [number, number, number];
    rotation: [number, number];
    targetPosition: [number, number, number];
    speaking: boolean;
  };
}) {
  const groupRef = useRef<THREE.Group>(null);
  const prevPosRef = useRef<[number, number, number]>([...player.position]);

  // 移動中かどうか（歩行アニメーション用）
  const isMoving = useRef(false);

  useFrame(() => {
    if (!groupRef.current) return;

    // 位置を更新
    groupRef.current.position.set(
      player.position[0],
      player.position[1],
      player.position[2],
    );

    // Y軸回転（体の向き）
    groupRef.current.rotation.y = player.rotation[0];

    // 移動検知
    const dx = player.position[0] - prevPosRef.current[0];
    const dz = player.position[2] - prevPosRef.current[2];
    isMoving.current = Math.abs(dx) > 0.005 || Math.abs(dz) > 0.005;
    prevPosRef.current = [...player.position];
  });

  return (
    <group ref={groupRef}>
      <VoxelAvatar color={player.color} isMoving={isMoving.current} />
    </group>
  );
}

// THREE の型を使うので import
import type * as THREE from 'three';
