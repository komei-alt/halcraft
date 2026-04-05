// ミニマップHUDコンポーネント
// ヘリコプター搭乗中に右上に表示される俯瞰マップ
// ヘリの位置を中心に、プレイヤー・モブ・地形をシンプルに表示
// 方位マーカー（N/S/E/W）付き

import { useRef, useEffect } from 'react';
import { useVehicleStore } from '../../stores/useVehicleStore';
import { useMultiplayerStore } from '../../stores/useMultiplayerStore';
import { useMobStore } from '../../stores/useMobStore';
import { useWorldStore } from '../../stores/useWorldStore';

/** ミニマップの設定 */
const MAP_CONFIG = {
  /** マップのサイズ（px） */
  SIZE: 180,
  /** 表示範囲（ブロック数、半径） */
  RANGE: 50,
  /** 更新間隔（ms） */
  UPDATE_INTERVAL: 200,
  /** 背景色 */
  BG_COLOR: 'rgba(0, 0, 0, 0.6)',
  /** 地形の色 */
  TERRAIN_LOW: [34, 85, 34],   // 低地（暗い緑）
  TERRAIN_MID: [51, 119, 51],  // 中間（緑）
  TERRAIN_HIGH: [119, 85, 51], // 高地（茶）
  TERRAIN_WATER: [34, 68, 119], // 水面レベル以下（青）
} as const;

export function MinimapHUD() {
  const helicopter = useVehicleStore((s) => s.helicopter);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastUpdateRef = useRef(0);

  // 搭乗中でなければ非表示
  const isInHelicopter = helicopter.mySeat !== null;

  useEffect(() => {
    if (!isInHelicopter || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const render = () => {
      animId = requestAnimationFrame(render);

      const now = performance.now();
      if (now - lastUpdateRef.current < MAP_CONFIG.UPDATE_INTERVAL) return;
      lastUpdateRef.current = now;

      const heli = useVehicleStore.getState().helicopter;
      const size = MAP_CONFIG.SIZE;
      const range = MAP_CONFIG.RANGE;
      const scale = size / (range * 2);
      const centerX = heli.x;
      const centerZ = heli.z;

      // 背景クリア
      ctx.clearRect(0, 0, size, size);

      // 円形マスク
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.clip();

      // 背景
      ctx.fillStyle = MAP_CONFIG.BG_COLOR;
      ctx.fillRect(0, 0, size, size);

      // 地形を描画（簡易版: getBlockでチェック）
      const getBlock = useWorldStore.getState().getBlock;
      const step = 3; // 3ブロックごとにサンプリング（パフォーマンス）
      for (let dx = -range; dx < range; dx += step) {
        for (let dz = -range; dz < range; dz += step) {
          const wx = Math.floor(centerX + dx);
          const wz = Math.floor(centerZ + dz);

          // 表面の高さを探す（上から下にスキャン、簡易的にy=40から下へ）
          let surfaceY = 0;
          for (let y = 40; y >= 0; y--) {
            if (getBlock(wx, y, wz) !== 0) {
              surfaceY = y;
              break;
            }
          }

          // 高さに応じた色
          let r: number, g: number, b: number;
          if (surfaceY <= 5) {
            [r, g, b] = MAP_CONFIG.TERRAIN_WATER;
          } else if (surfaceY <= 15) {
            [r, g, b] = MAP_CONFIG.TERRAIN_LOW;
          } else if (surfaceY <= 25) {
            [r, g, b] = MAP_CONFIG.TERRAIN_MID;
          } else {
            [r, g, b] = MAP_CONFIG.TERRAIN_HIGH;
          }

          // ヘリからの角度を考慮して回転（マップは北が上）
          const px = (dx + range) * scale;
          const pz = (dz + range) * scale;

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(px, pz, step * scale + 1, step * scale + 1);
        }
      }

      // グリッド線（薄く）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const pos = (i / 4) * size;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(size, pos);
        ctx.stroke();
      }

      // モブを描画（赤い点 = 敵）
      const mobs = useMobStore.getState().mobs;
      for (const mob of mobs) {
        const dx = mob.x - centerX;
        const dz = mob.z - centerZ;
        if (Math.abs(dx) > range || Math.abs(dz) > range) continue;

        const px = (dx + range) * scale;
        const pz = (dz + range) * scale;

        ctx.beginPath();
        ctx.arc(px, pz, mob.isAlly ? 2.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = mob.isAlly ? '#44ff88' : '#ff4444';
        ctx.fill();
      }

      // リモートプレイヤーを描画（青い点）
      const remotePlayers = useMultiplayerStore.getState().remotePlayers;
      for (const [, player] of remotePlayers) {
        const dx = player.position[0] - centerX;
        const dz = player.position[2] - centerZ;
        if (Math.abs(dx) > range || Math.abs(dz) > range) continue;

        const px = (dx + range) * scale;
        const pz = (dz + range) * scale;

        ctx.beginPath();
        ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#44aaff';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // ヘリコプター自機（中央に大きな三角形）
      const heliScreenX = size / 2;
      const heliScreenZ = size / 2;
      const heliSize = 6;

      ctx.save();
      ctx.translate(heliScreenX, heliScreenZ);
      ctx.rotate(heli.rotationY); // ヘリの向き

      // 三角形（前方を示す）
      ctx.beginPath();
      ctx.moveTo(0, -heliSize);
      ctx.lineTo(-heliSize * 0.6, heliSize * 0.5);
      ctx.lineTo(heliSize * 0.6, heliSize * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#ffdd00';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();

      ctx.restore(); // クリップマスクをリストア

      // 外周リング
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 方位マーカー
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('N', size / 2, 10);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillText('S', size / 2, size - 10);
      ctx.fillText('W', 10, size / 2);
      ctx.fillText('E', size - 10, size / 2);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isInHelicopter]);

  if (!isInHelicopter) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        width: MAP_CONFIG.SIZE,
        height: MAP_CONFIG.SIZE,
        borderRadius: '50%',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 95,
        border: '2px solid rgba(255, 255, 255, 0.2)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
      }}
    >
      <canvas
        ref={canvasRef}
        width={MAP_CONFIG.SIZE}
        height={MAP_CONFIG.SIZE}
        style={{ width: '100%', height: '100%' }}
      />
      {/* 座標表示 */}
      <div
        style={{
          position: 'absolute',
          bottom: '-24px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '9px',
          fontFamily: 'monospace',
          color: 'rgba(255, 255, 255, 0.5)',
          whiteSpace: 'nowrap',
        }}
      >
        X:{Math.floor(helicopter.x)} Z:{Math.floor(helicopter.z)}
      </div>
    </div>
  );
}
