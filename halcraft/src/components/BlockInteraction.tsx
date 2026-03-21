// ブロック操作コンポーネント
// レイキャストでプレイヤーの照準先を検出し、左クリック=破壊、右クリック=設置を行う

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { BLOCK_IDS } from '../types/blocks';

/** ブロック操作のリーチ距離 */
const REACH = 6;
/** レイキャスティングの精度 */
const RAY_STEPS = 100;

interface TargetBlock {
  /** 照準先のブロック座標 */
  x: number;
  y: number;
  z: number;
  /** 設置先（照準ブロックの隣接面） */
  placeX: number;
  placeY: number;
  placeZ: number;
}

/** ブロック選択ハイライトの表示 */
function BlockHighlight({ target }: { target: TargetBlock | null }) {
  if (!target) return null;
  return (
    <mesh position={[target.x + 0.5, target.y + 0.5, target.z + 0.5]}>
      <boxGeometry args={[1.01, 1.01, 1.01]} />
      <meshBasicMaterial
        color={0xffffff}
        wireframe
        transparent
        opacity={0.5}
        depthTest={false}
      />
    </mesh>
  );
}

export function BlockInteraction() {
  const { camera } = useThree();
  const getBlock = useWorldStore((s) => s.getBlock);
  const breakBlock = useWorldStore((s) => s.breakBlock);
  const setBlock = useWorldStore((s) => s.setBlock);
  const getSelectedBlock = usePlayerStore((s) => s.getSelectedBlock);

  const [target, setTarget] = useState<TargetBlock | null>(null);
  const targetRef = useRef<TargetBlock | null>(null);

  // レイマーチングで照準先のブロックを検出
  useFrame(() => {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const origin = camera.position.clone();

    let prevX = -999, prevY = -999, prevZ = -999;
    let found: TargetBlock | null = null;

    for (let i = 0; i < RAY_STEPS; i++) {
      const t = (i / RAY_STEPS) * REACH;
      const point = origin.clone().add(dir.clone().multiplyScalar(t));

      const bx = Math.floor(point.x);
      const by = Math.floor(point.y);
      const bz = Math.floor(point.z);

      // 同じブロックなら重複チェックしない
      if (bx === prevX && by === prevY && bz === prevZ) continue;

      const block = getBlock(bx, by, bz);
      if (block !== BLOCK_IDS.AIR) {
        found = {
          x: bx, y: by, z: bz,
          placeX: prevX, placeY: prevY, placeZ: prevZ,
        };
        break;
      }

      prevX = bx;
      prevY = by;
      prevZ = bz;
    }

    targetRef.current = found;
    // ターゲット変更時のみstate更新（パフォーマンスのため）
    setTarget((prev) => {
      if (!found && !prev) return prev;
      if (!found || !prev) return found;
      if (found.x === prev.x && found.y === prev.y && found.z === prev.z) return prev;
      return found;
    });
  });

  // クリック処理
  const handleMouseDown = useCallback((e: MouseEvent) => {
    // PointerLock中でなければ無視
    if (!document.pointerLockElement) return;

    const t = targetRef.current;
    if (!t) return;

    if (e.button === 0) {
      // 左クリック: ブロック破壊
      breakBlock(t.x, t.y, t.z);
    } else if (e.button === 2) {
      // 右クリック: ブロック設置
      if (t.placeX === -999) return;
      const selectedBlock = getSelectedBlock();
      setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
    }
  }, [breakBlock, setBlock, getSelectedBlock]);

  useEffect(() => {
    document.addEventListener('mousedown', handleMouseDown);
    // 右クリックのコンテキストメニューを無効化
    const preventContext = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', preventContext);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, [handleMouseDown]);

  return <BlockHighlight target={target} />;
}
