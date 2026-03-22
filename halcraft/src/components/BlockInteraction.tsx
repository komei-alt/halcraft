// ブロック操作コンポーネント
// レイマーチングで照準先のブロックを検出し、左クリック=破壊、右クリック=設置を行う

import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { useWorldStore } from '../stores/useWorldStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { BLOCK_IDS } from '../types/blocks';

/** ブロック操作のリーチ距離 */
const REACH = 6;
/** レイマーチングのステップ数（多いほど精度が高い） */
const RAY_STEPS = 120;
/** レイマーチングのステップ間隔 */
const STEP_SIZE = REACH / RAY_STEPS;

interface TargetBlock {
  /** 照準先のブロック座標 */
  x: number;
  y: number;
  z: number;
  /** 設置先（照準ブロックの隣接面） */
  placeX: number;
  placeY: number;
  placeZ: number;
  /** 設置先が有効かどうか */
  hasPlaceTarget: boolean;
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
  const addItem = useInventoryStore((s) => s.addItem);

  const [target, setTarget] = useState<TargetBlock | null>(null);
  const targetRef = useRef<TargetBlock | null>(null);

  // レイマーチングで照準先のブロックを検出
  useFrame(() => {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const origin = camera.position.clone();

    let found: TargetBlock | null = null;

    // 前回の空気ブロック座標を追跡
    let lastAirX = -1;
    let lastAirY = -1;
    let lastAirZ = -1;
    let hasLastAir = false;
    let lastBx = -999;
    let lastBy = -999;
    let lastBz = -999;

    for (let i = 1; i <= RAY_STEPS; i++) {
      const t = i * STEP_SIZE;
      const px = origin.x + dir.x * t;
      const py = origin.y + dir.y * t;
      const pz = origin.z + dir.z * t;

      const bx = Math.floor(px);
      const by = Math.floor(py);
      const bz = Math.floor(pz);

      // 同じブロック座標ならスキップ
      if (bx === lastBx && by === lastBy && bz === lastBz) continue;
      lastBx = bx;
      lastBy = by;
      lastBz = bz;

      const block = getBlock(bx, by, bz);
      if (block !== BLOCK_IDS.AIR) {
        // 固体ブロックにヒット！
        found = {
          x: bx, y: by, z: bz,
          placeX: lastAirX,
          placeY: lastAirY,
          placeZ: lastAirZ,
          hasPlaceTarget: hasLastAir,
        };
        break;
      } else {
        // 空気ブロック → 設置先候補として記録
        lastAirX = bx;
        lastAirY = by;
        lastAirZ = bz;
        hasLastAir = true;
      }
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
      // 左クリック: ブロック破壊 → インベントリに追加
      const blockId = getBlock(t.x, t.y, t.z);
      if (breakBlock(t.x, t.y, t.z)) {
        addItem(blockId);
      }
    } else if (e.button === 2) {
      // 右クリック: ブロック設置
      if (!t.hasPlaceTarget) return;
      const selectedBlock = getSelectedBlock();
      setBlock(t.placeX, t.placeY, t.placeZ, selectedBlock);
    }
  }, [breakBlock, setBlock, getSelectedBlock, getBlock, addItem]);

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
