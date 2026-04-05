// コックピットビューコンポーネント
// ヘリコプター搭乗中にカメラに追従する窓枠+ダッシュボードの3Dモデル
// カメラの直前に配置し、FPSコックピット視点を演出する
// renderOrder + depthTest制御で常に最前面に描画

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useVehicleStore } from '../../stores/useVehicleStore';

/** コックピットフレームの色 */
const FRAME_COLOR = new THREE.Color(0x222222);   // ダークグレーの内装
const DASH_COLOR = new THREE.Color(0x1a1a1a);    // ダッシュボード（ほぼ黒）
const ACCENT_COLOR = new THREE.Color(0x444444);   // アクセント
const GAUGE_GLOW = new THREE.Color(0x33ff66);     // 計器の緑色発光
const WARNING_GLOW = new THREE.Color(0xff4444);   // 警告灯（赤）
const INDICATOR_GLOW = new THREE.Color(0x44aaff); // インジケータ（青）

/** コックピットの描画設定 */
const COCKPIT_CONFIG = {
  /** カメラからの前方オフセット */
  FORWARD_OFFSET: 0.35,
  /** 操縦席の全体スケール */
  SCALE: 0.2,
  /** フレームの太さ */
  FRAME_THICKNESS: 0.04,
  /** フレーム奥行き */
  FRAME_DEPTH: 0.02,
} as const;

export function CockpitView() {
  const mySeat = useVehicleStore((s) => s.helicopter.mySeat);
  const isBoarded = mySeat !== null;
  const cockpitRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  // 再利用用ベクトル・クォータニオン（GCプレッシャー防止）
  const tempVec = useRef(new THREE.Vector3());
  const tempQuat = useRef(new THREE.Quaternion());

  // コックピットフレーム用マテリアル
  const frameMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: FRAME_COLOR,
    side: THREE.DoubleSide,
  }), []);

  const dashMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: DASH_COLOR,
    side: THREE.DoubleSide,
  }), []);

  const accentMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: ACCENT_COLOR,
    side: THREE.DoubleSide,
  }), []);

  const gaugeMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: GAUGE_GLOW,
    transparent: true,
    opacity: 0.9,
  }), []);

  const warningMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: WARNING_GLOW,
    transparent: true,
    opacity: 0.7,
  }), []);

  const indicatorMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: INDICATOR_GLOW,
    transparent: true,
    opacity: 0.6,
  }), []);

  // 毎フレームカメラに追従
  useFrame(() => {
    if (!cockpitRef.current || !isBoarded) return;

    // カメラの位置と向きを取得
    tempQuat.current.copy(camera.quaternion);

    // カメラの前方にオフセット
    tempVec.current.set(0, 0, -COCKPIT_CONFIG.FORWARD_OFFSET);
    tempVec.current.applyQuaternion(tempQuat.current);
    tempVec.current.add(camera.position);

    // コックピットをカメラに追従
    cockpitRef.current.position.copy(tempVec.current);
    cockpitRef.current.quaternion.copy(tempQuat.current);
  });

  if (!isBoarded) return null;

  const T = COCKPIT_CONFIG.FRAME_THICKNESS;
  const D = COCKPIT_CONFIG.FRAME_DEPTH;
  const S = COCKPIT_CONFIG.SCALE;

  return (
    <group ref={cockpitRef} scale={S} renderOrder={999}>
      {/* === 窓枠フレーム（コックピットウィンドウの境界） === */}

      {/* 上部フレーム（天井との境界） */}
      <mesh position={[0, 0.52, 0]} material={frameMat} renderOrder={999}>
        <boxGeometry args={[2.8, T, D]} />
      </mesh>

      {/* 下部フレーム（ダッシュボードとの境界） */}
      <mesh position={[0, -0.32, 0]} material={frameMat} renderOrder={999}>
        <boxGeometry args={[2.8, T * 1.5, D]} />
      </mesh>

      {/* 中央縦フレーム（フロントウィンドウを左右に分割） */}
      <mesh position={[0, 0.1, 0]} material={frameMat} renderOrder={999}>
        <boxGeometry args={[T * 0.8, 0.88, D]} />
      </mesh>

      {/* 左の縦フレーム（Aピラー左） */}
      <mesh position={[-1.05, 0.1, 0]} material={frameMat} renderOrder={999}>
        <boxGeometry args={[T * 1.5, 0.9, D]} />
      </mesh>

      {/* 右の縦フレーム（Aピラー右） */}
      <mesh position={[1.05, 0.1, 0]} material={frameMat} renderOrder={999}>
        <boxGeometry args={[T * 1.5, 0.9, D]} />
      </mesh>

      {/* 左斜めフレーム（サイドウィンドウとの接続） */}
      <mesh position={[-1.3, 0.1, 0.06]} rotation={[0, 0.4, 0]} material={frameMat} renderOrder={999}>
        <boxGeometry args={[T, 0.9, D]} />
      </mesh>

      {/* 右斜めフレーム */}
      <mesh position={[1.3, 0.1, 0.06]} rotation={[0, -0.4, 0]} material={frameMat} renderOrder={999}>
        <boxGeometry args={[T, 0.9, D]} />
      </mesh>

      {/* === ダッシュボード === */}
      {/* メインダッシュ（下部の広い板） */}
      <mesh position={[0, -0.55, 0.05]} rotation={[-0.3, 0, 0]} material={dashMat} renderOrder={999}>
        <boxGeometry args={[2.8, 0.4, D * 2]} />
      </mesh>

      {/* ダッシュボード上縁（段差） */}
      <mesh position={[0, -0.38, 0.02]} material={accentMat} renderOrder={999}>
        <boxGeometry args={[2.7, T * 0.5, D * 1.5]} />
      </mesh>

      {/* === 計器パネル（中央下部） === */}

      {/* 左計器ハウジング */}
      <mesh position={[-0.35, -0.52, 0.03]} rotation={[-0.3, 0, 0]} material={accentMat} renderOrder={999}>
        <boxGeometry args={[0.3, 0.22, D * 1.2]} />
      </mesh>
      {/* 左計器の発光面（速度計イメージ） */}
      <mesh position={[-0.35, -0.52, 0.02]} rotation={[-0.3, 0, 0]} material={gaugeMat} renderOrder={999}>
        <boxGeometry args={[0.24, 0.16, 0.001]} />
      </mesh>

      {/* 右計器ハウジング */}
      <mesh position={[0.35, -0.52, 0.03]} rotation={[-0.3, 0, 0]} material={accentMat} renderOrder={999}>
        <boxGeometry args={[0.3, 0.22, D * 1.2]} />
      </mesh>
      {/* 右計器の発光面（高度計イメージ） */}
      <mesh position={[0.35, -0.52, 0.02]} rotation={[-0.3, 0, 0]} material={indicatorMat} renderOrder={999}>
        <boxGeometry args={[0.24, 0.16, 0.001]} />
      </mesh>

      {/* 中央小計器（コンパスイメージ） */}
      <mesh position={[0, -0.48, 0.025]} rotation={[-0.3, 0, 0]} material={accentMat} renderOrder={999}>
        <boxGeometry args={[0.16, 0.14, D]} />
      </mesh>
      <mesh position={[0, -0.48, 0.02]} rotation={[-0.3, 0, 0]} material={gaugeMat} renderOrder={999}>
        <boxGeometry args={[0.12, 0.10, 0.001]} />
      </mesh>

      {/* === 警告灯ストリップ（ダッシュ上部に小さなインジケータの並び） === */}
      {/* 左インジケータ群 */}
      {[-0.8, -0.65, -0.5].map((x, i) => (
        <mesh key={`ind-l-${i}`} position={[x, -0.37, 0.015]} material={i === 0 ? warningMat : gaugeMat} renderOrder={999}>
          <boxGeometry args={[0.06, 0.03, 0.001]} />
        </mesh>
      ))}

      {/* 右インジケータ群 */}
      {[0.5, 0.65, 0.8].map((x, i) => (
        <mesh key={`ind-r-${i}`} position={[x, -0.37, 0.015]} material={i === 2 ? warningMat : indicatorMat} renderOrder={999}>
          <boxGeometry args={[0.06, 0.03, 0.001]} />
        </mesh>
      ))}

      {/* === サイドコンソール要素（左右に小さなスイッチパネル風） === */}
      {/* 左サイドパネル */}
      <mesh position={[-1.2, -0.3, 0.04]} rotation={[0, 0.5, 0]} material={dashMat} renderOrder={999}>
        <boxGeometry args={[0.4, 0.35, D]} />
      </mesh>
      {/* 左サイドのスイッチ群（小さな発光ドット） */}
      {[0, 0.08, 0.16].map((dy, i) => (
        <mesh
          key={`sw-l-${i}`}
          position={[-1.18, -0.22 - dy, 0.035]}
          rotation={[0, 0.5, 0]}
          material={i === 1 ? gaugeMat : indicatorMat}
          renderOrder={999}
        >
          <boxGeometry args={[0.04, 0.03, 0.001]} />
        </mesh>
      ))}

      {/* 右サイドパネル */}
      <mesh position={[1.2, -0.3, 0.04]} rotation={[0, -0.5, 0]} material={dashMat} renderOrder={999}>
        <boxGeometry args={[0.4, 0.35, D]} />
      </mesh>
      {/* 右サイドのスイッチ群 */}
      {[0, 0.08, 0.16].map((dy, i) => (
        <mesh
          key={`sw-r-${i}`}
          position={[1.18, -0.22 - dy, 0.035]}
          rotation={[0, -0.5, 0]}
          material={i === 0 ? warningMat : gaugeMat}
          renderOrder={999}
        >
          <boxGeometry args={[0.04, 0.03, 0.001]} />
        </mesh>
      ))}

      {/* === 天井部分 === */}
      {/* オーバーヘッドパネル（天井の計器） */}
      <mesh position={[0, 0.6, 0.04]} material={dashMat} renderOrder={999}>
        <boxGeometry args={[1.5, 0.12, D * 1.5]} />
      </mesh>
      {/* オーバーヘッドのスイッチ列 */}
      {[-0.4, -0.2, 0, 0.2, 0.4].map((x, i) => (
        <mesh
          key={`oh-${i}`}
          position={[x, 0.6, 0.03]}
          material={i === 2 ? gaugeMat : accentMat}
          renderOrder={999}
        >
          <boxGeometry args={[0.08, 0.05, 0.001]} />
        </mesh>
      ))}
    </group>
  );
}
