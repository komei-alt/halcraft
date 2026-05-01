// 乗り物HPバー
// ダメージを受けている乗り物の上にHPバーを表示

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { useVehicleStore, type VehicleType } from '../../stores/useVehicleStore';

const BAR_WIDTH = 2.2;
const BAR_HEIGHT = 0.14;
const BAR_Y_OFFSETS: Record<VehicleType, number> = {
  helicopter: 4.5,
  tank: 3.5,
  airplane: 5.0,
  car: 3.2,
};

/** 単体の乗り物HPバー */
function SingleHealthBar({ type }: { type: VehicleType }) {
  const { camera } = useThree();
  const barGroupRef = useRef<THREE.Group>(null);
  const bgRef = useRef<THREE.Mesh>(null);
  const fgRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const vehicle = useVehicleStore.getState()[type];
    const group = barGroupRef.current;
    if (!group) return;

    // HPが最大 or 未スポーン or 破壊済み → 非表示
    if (!vehicle.spawned || vehicle.destroyed || vehicle.hp >= vehicle.maxHp) {
      group.visible = false;
      return;
    }

    // 距離判定（遠すぎたら非表示）
    const dist = camera.position.distanceTo(new THREE.Vector3(vehicle.x, vehicle.y, vehicle.z));
    if (dist > 40) {
      group.visible = false;
      return;
    }

    group.visible = true;
    group.position.set(vehicle.x, vehicle.y + BAR_Y_OFFSETS[type], vehicle.z);

    // HPバーの幅を更新
    const hpRatio = Math.max(0, vehicle.hp / vehicle.maxHp);
    const fg = fgRef.current;
    if (fg) {
      fg.scale.x = Math.max(0.001, hpRatio);
      fg.position.x = -(BAR_WIDTH * (1 - hpRatio)) / 2;

      // HP割合で色変化
      const mat = fg.material as THREE.MeshBasicMaterial;
      if (hpRatio > 0.5) {
        mat.color.setHex(0x44ff44); // 緑
      } else if (hpRatio > 0.25) {
        mat.color.setHex(0xffaa00); // オレンジ
      } else {
        mat.color.setHex(0xff2222); // 赤
      }
    }
  });

  return (
    <group ref={barGroupRef} visible={false}>
      <Billboard>
        {/* 背景（暗いバー） */}
        <mesh ref={bgRef} position={[0, 0, -0.01]}>
          <planeGeometry args={[BAR_WIDTH + 0.08, BAR_HEIGHT + 0.06]} />
          <meshBasicMaterial color="#111111" transparent opacity={0.7} depthWrite={false} />
        </mesh>

        {/* HP前景 */}
        <mesh ref={fgRef}>
          <planeGeometry args={[BAR_WIDTH, BAR_HEIGHT]} />
          <meshBasicMaterial color="#44ff44" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

export function VehicleHealthBars() {
  return (
    <>
      <SingleHealthBar type="helicopter" />
      <SingleHealthBar type="tank" />
      <SingleHealthBar type="airplane" />
      <SingleHealthBar type="car" />
    </>
  );
}
