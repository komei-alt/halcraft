import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier';
import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

const SPEED = 10;
const JUMP_FORCE = 15;

export function Player() {
  const rigidBody = useRef<RapierRigidBody>(null);
  const { camera } = useThree();
  const [movement, setMovement] = useState({ forward: false, backward: false, left: false, right: false, jump: false });

  // キーボードイベントの取得
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') setMovement(m => ({ ...m, forward: true }));
      if (e.code === 'KeyS') setMovement(m => ({ ...m, backward: true }));
      if (e.code === 'KeyA') setMovement(m => ({ ...m, left: true }));
      if (e.code === 'KeyD') setMovement(m => ({ ...m, right: true }));
      if (e.code === 'Space') setMovement(m => ({ ...m, jump: true }));
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyW') setMovement(m => ({ ...m, forward: false }));
      if (e.code === 'KeyS') setMovement(m => ({ ...m, backward: false }));
      if (e.code === 'KeyA') setMovement(m => ({ ...m, left: false }));
      if (e.code === 'KeyD') setMovement(m => ({ ...m, right: false }));
      if (e.code === 'Space') setMovement(m => ({ ...m, jump: false }));
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame(() => {
    if (!rigidBody.current) return;
    
    // カメラ位置をプレイヤー位置に合わせる (Y軸は目の高さ +1.5)
    const position = rigidBody.current.translation();
    camera.position.set(position.x, position.y + 1.5, position.z);

    // WASDによる移動ベクトル計算
    const frontVector = new THREE.Vector3(0, 0, (movement.backward ? 1 : 0) - (movement.forward ? 1 : 0));
    const sideVector = new THREE.Vector3((movement.left ? 1 : 0) - (movement.right ? 1 : 0), 0, 0);
    const direction = new THREE.Vector3();
    
    direction.subVectors(frontVector, sideVector).normalize().multiplyScalar(SPEED).applyEuler(camera.rotation);
    
    // 物理エンジンへの速度適用
    const velocity = rigidBody.current.linvel();
    rigidBody.current.setLinvel({ x: direction.x, y: velocity.y, z: direction.z }, true);

    // ジャンプ処理（より厳密な接地判定）
    if (movement.jump && Math.abs(velocity.y) < 0.05) {
      rigidBody.current.setLinvel({ x: velocity.x, y: JUMP_FORCE, z: velocity.z }, true);
      setMovement(m => ({ ...m, jump: false }));
    }
  });

  return (
    <RigidBody ref={rigidBody} colliders={false} mass={1} type="dynamic" position={[0, 5, 0]} enabledRotations={[false, false, false]}>
      <CapsuleCollider args={[1, 0.5]} />
      {/* プレイヤーの透明なカプセル（当たり判定用・カメラが中に入るので非表示） */}
      <mesh visible={false}>
        <capsuleGeometry args={[0.5, 1, 4]} />
        <meshBasicMaterial color="red" />
      </mesh>
    </RigidBody>
  );
}
