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
import { isValidSkinId } from '../types/skins';


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

    // 乗り物搭乗判定（車内描画側に任せる）
    const vehicleState = useVehicleStore.getState();
    const heli = vehicleState.helicopter;
    const tank = vehicleState.tank;
    let occupiedSeat: string | null = null;
    if (heli.spawned) {
      for (const [seat, id] of Object.entries(heli.seats)) {
        if (id === player.id) {
          occupiedSeat = seat;
          break;
        }
      }
    }
    const isInTank = tank.spawned && tank.seats.pilot === player.id;
    const isInVehicle = occupiedSeat !== null || isInTank;

    if (isInVehicle) {
      // 搭乗中: 乗り物コンポーネント側の PassengerAvatar が描画するので非表示
      groupRef.current.visible = false;
      setIsMoving((prev: boolean) => prev ? false : prev);
    } else {
      // 通常: サーバーからの補間位置を使用
      groupRef.current.visible = true;
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
        skinId={player.skinId && isValidSkinId(player.skinId) ? player.skinId : undefined}
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
