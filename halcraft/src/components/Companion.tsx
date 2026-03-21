import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

// 読み込んだ画像からブロック（ボクセル）の3D集合体を自動生成するコンポーネント
export function Companion({ position = [0, 2, -5] }: { position?: [number, number, number] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [voxelData, setVoxelData] = useState<{ color: THREE.Color, pos: THREE.Vector3 }[]>([]);
  
  // プレイヤーよりかなり背を高くする設定（1ブロックの大きさを計算して約4mの高さにする）
  const TARGET_HEIGHT = 4.0;
  // 画像の解像度を下げてブロック化（マイクラらしさを出すため。ここでは64x64ピクセル前後でサンプリング）
  const MAX_RESOLUTION = 64; 

  useEffect(() => {
    // 画像を裏側で読み込んでピクセルデータから立体ブロックを作る
    const img = new Image();
    img.src = '/textures/prototype.png';
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      // 指定サイズに縮小してドット絵化
      const width = img.width > img.height ? MAX_RESOLUTION : Math.floor((img.width / img.height) * MAX_RESOLUTION);
      const height = img.height > img.width ? MAX_RESOLUTION : Math.floor((img.height / img.width) * MAX_RESOLUTION);
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // 画像を描画
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height).data;
      
      const voxels = [];
      // 1ブロックのスケール計算（全体の高さを TARGET_HEIGHT(4m) に揃える）
      const blockSize = TARGET_HEIGHT / height;
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = (y * width + x) * 4;
          const r = imageData[index];
          const g = imageData[index + 1];
          const b = imageData[index + 2];
          const a = imageData[index + 3];
          
          if (a > 50) {
            // 色データ
            const color = new THREE.Color(`rgb(${r},${g},${b})`);
            // 中心を原点として、上から下へ、左から右へブロックの座標を作る (Z軸にも少し厚みを持たせて立体感を出す)
            const posX = (x - width / 2) * blockSize;
            const posY = ((height - y) - height / 2) * blockSize;
            
            // 少しだけZ軸に厚みを持たせる（マイクラのような1ピクセルの厚さ=ブロックスケール）
            voxels.push({ color, pos: new THREE.Vector3(posX, posY, 0) });
          }
        }
      }
      setVoxelData(voxels);
    };
  }, []);

  // ボクセルデータができたら、InstancedMeshに配置する
  useEffect(() => {
    if (meshRef.current && voxelData.length > 0) {
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      // 一つのブロックのサイズ
      const scale = TARGET_HEIGHT / MAX_RESOLUTION; 

      voxelData.forEach((voxel, i) => {
        // 配置
        dummy.position.copy(voxel.pos);
        // ブロック感を強調するため、隙間をほんの少し開ける(0.95倍)
        dummy.scale.set(scale * 0.95, scale * 0.95, scale * 1.5); // Z軸の厚みを少し強調
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
        // 色
        meshRef.current!.setColorAt(i, voxel.color);
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [voxelData]);

  if (voxelData.length === 0) return null;

  return (
    // 立体化したので、物理判定をキューブ型にしてその場にどっしり構えさせます
    <RigidBody position={position} colliders="hull" type="fixed">
      <instancedMesh ref={meshRef} args={[undefined, undefined, voxelData.length]} receiveShadow castShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </RigidBody>
  );
}
