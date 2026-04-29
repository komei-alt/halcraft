// GLB モブ描画の共通コンポーネント
// 2026-04-29 追加モデルを既存AIの見た目として使う

import { useEffect, useMemo } from 'react';
import { Billboard, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';

export interface GlbMobModelConfig {
  path: string;
  scale: number;
  modelPosition: [number, number, number];
  modelRotation?: [number, number, number];
  hpBarY: number;
  hpBarWidth: number;
  damagedTint?: THREE.Color;
  angryTint?: THREE.Color;
  bobAmount?: number;
  bobSpeed?: number;
}

interface GlbMobProps {
  mob: MobData;
  animTime: number;
  config: GlbMobModelConfig;
}

function cloneSceneWithMaterials(scene: THREE.Group): THREE.Group {
  const clone = scene.clone(true);
  clone.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.renderOrder = 0;
      if (Array.isArray(child.material)) {
        child.material = child.material.map((mat) => {
          const cloned = mat.clone();
          cloned.depthWrite = true;
          cloned.depthTest = true;
          return cloned;
        });
      } else {
        const cloned = child.material.clone();
        cloned.depthWrite = true;
        cloned.depthTest = true;
        child.material = cloned;
      }
    }
  });
  return clone;
}

function collectOriginalColors(scene: THREE.Group): Map<string, THREE.Color> {
  const colors = new Map<string, THREE.Color>();
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat, index) => {
        if ('color' in mat && mat.color instanceof THREE.Color) {
          colors.set(`${child.uuid}-${index}`, mat.color.clone());
        }
      });
    }
  });
  return colors;
}

function tintScene(scene: THREE.Group, colorByKey: Map<string, THREE.Color>, tint: THREE.Color | null): void {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat, index) => {
        if ('color' in mat && mat.color instanceof THREE.Color) {
          const original = colorByKey.get(`${child.uuid}-${index}`);
          mat.color.copy(tint ?? original ?? mat.color);
        }
      });
    }
  });
}

export function GlbMob({ mob, animTime, config }: GlbMobProps) {
  const { scene } = useGLTF(config.path);

  const clonedScene = useMemo(() => cloneSceneWithMaterials(scene), [scene]);
  const originalColors = useMemo(() => collectOriginalColors(clonedScene), [clonedScene]);

  const isDamaged = mob.hitTimer > 0;
  const isAngry = mob.angryAtPlayer;
  const tint = useMemo(() => {
    if (isDamaged) return config.damagedTint ?? new THREE.Color(0xff6666);
    if (isAngry) return config.angryTint ?? new THREE.Color(0xff6644);
    return null;
  }, [config.angryTint, config.damagedTint, isAngry, isDamaged]);

  useEffect(() => {
    tintScene(clonedScene, originalColors, tint);
  }, [clonedScene, originalColors, tint]);

  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;
  const isMoving = Math.abs(mob.vx) > 0.1 || Math.abs(mob.vz) > 0.1;
  const bob = isMoving
    ? Math.sin(animTime * (config.bobSpeed ?? 4)) * (config.bobAmount ?? 0.04)
    : 0;

  return (
    <group position={[mob.x, mob.y + bob, mob.z]} rotation={[0, mob.rotation, 0]}>
      <primitive
        object={clonedScene}
        scale={[config.scale, config.scale, config.scale]}
        position={config.modelPosition}
        rotation={config.modelRotation ?? [0, 0, 0]}
      />

      {mob.hp < mob.maxHp && (
        <Billboard position={[0, config.hpBarY, 0]}>
          <mesh>
            <planeGeometry args={[config.hpBarWidth, 0.1]} />
            <meshBasicMaterial color={0x222222} transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[-(config.hpBarWidth - config.hpBarWidth * hpRatio) / 2, 0, 0.001]}>
            <planeGeometry args={[config.hpBarWidth * hpRatio, 0.08]} />
            <meshBasicMaterial color={hpColor} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </Billboard>
      )}
    </group>
  );
}
