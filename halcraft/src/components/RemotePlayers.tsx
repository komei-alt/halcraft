// ============================================
// RemotePlayers — 他プレイヤーの一括描画
// useMultiplayerStore のリモートプレイヤーを VoxelAvatar で表示
// 死亡時は倒れる＋パーツ崩壊アニメーション
// ヘリコプター搭乗中のプレイヤーはヘリ位置に追従して表示
// ============================================

import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useMultiplayerStore, type RemotePlayer } from '../stores/useMultiplayerStore';
import { useVehicleStore } from '../stores/useVehicleStore';
import { VoxelAvatar } from './VoxelAvatar';

/** ヘリコプター操縦席のオフセット（Helicopter.tsx の group scale=1.3 を考慮） */
const COCKPIT_OFFSET_Y = 1.8;

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
  player: RemotePlayer;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const prevPosRef = useRef<[number, number, number]>([...player.position]);

  // 移動中かどうか（歩行アニメーション用）— state でレンダリングに反映
  const [isMoving, setIsMoving] = useState(false);

  useFrame(() => {
    if (!groupRef.current) return;

    // ヘリコプター搭乗判定（pilotIdが自分のIDと一致するか）
    const heli = useVehicleStore.getState().helicopter;
    const isInHelicopter = heli.spawned && heli.pilotId === player.id;

    if (isInHelicopter) {
      // 搭乗中: ヘリコプターの操縦席位置にアバターを配置
      // ヘリの向きに合わせてオフセットを回転させる
      const cosR = Math.cos(heli.rotationY);
      const sinR = Math.sin(heli.rotationY);
      // 操縦席はヘリの中心から少し前方上方（ヘリのローカル座標で Y+1.8, Z-0.5 → ワールド座標に変換）
      const localZ = -0.3; // ヘリの前方寄り（Three.jsの-Zが前方、モデルは180度回転してるので調整）
      const offsetX = sinR * localZ;
      const offsetZ = cosR * localZ;

      groupRef.current.position.set(
        heli.x + offsetX,
        heli.y + COCKPIT_OFFSET_Y,
        heli.z + offsetZ,
      );
      // ヘリの向きに体を合わせる
      groupRef.current.rotation.y = heli.rotationY;

      // 搭乗中は移動アニメーション無効
      setIsMoving((prev: boolean) => prev ? false : prev);
      prevPosRef.current = [
        heli.x + offsetX,
        heli.y + COCKPIT_OFFSET_Y,
        heli.z + offsetZ,
      ];
    } else {
      // 通常: サーバーからの補間位置を使用
      groupRef.current.position.set(
        player.position[0],
        player.position[1],
        player.position[2],
      );

      // Y軸回転（体の向き）
      groupRef.current.rotation.y = player.rotation[0];

      // 移動検知（死亡中は常に false）
      let moving = false;
      if (!player.isDead) {
        const dx = player.position[0] - prevPosRef.current[0];
        const dz = player.position[2] - prevPosRef.current[2];
        moving = Math.abs(dx) > 0.005 || Math.abs(dz) > 0.005;
      }
      setIsMoving((prev: boolean) => prev !== moving ? moving : prev);
      prevPosRef.current = [...player.position];
    }
  });

  return (
    <group ref={groupRef}>
      <VoxelAvatar
        color={player.color}
        isMoving={isMoving}
        isDead={player.isDead}
        deathTime={player.deathTime}
      />
    </group>
  );
}

// THREE の型を使うので import
import type * as THREE from 'three';
