// GLB モブ描画の共通コンポーネント
// 2026-04-29 追加モデルを既存AIの見た目として使う
// 自動接地: modelPosition.y を手動指定する必要なし（computeGroundOffset で自動計算）

import { useEffect, useMemo } from 'react';
import { Billboard, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { computeGroundOffset } from '../../utils/autoGround';

export interface GlbMobModelConfig {
  path: string;
  scale: number;
  /**
   * モデルのローカル位置オフセット。
   * Y 値は自動接地で上書きされるため、XZ の微調整のみに使う。
   * Y を手動で制御したい場合は `disableAutoGround: true` を設定する。
   */
  modelPosition: [number, number, number];
  modelRotation?: [number, number, number];
  hpBarY: number;
  hpBarWidth: number;
  damagedTint?: THREE.Color;
  angryTint?: THREE.Color;
  bobAmount?: number;
  bobSpeed?: number;
  /** true にすると自動接地を無効化し、modelPosition.y をそのまま使う */
  disableAutoGround?: boolean;
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

type ColorMaterial = THREE.Material & { color: THREE.Color };
type EmissiveMaterial = THREE.Material & { emissive: THREE.Color; emissiveIntensity?: number };

function hasMaterialColor(material: THREE.Material): material is ColorMaterial {
  return 'color' in material && material.color instanceof THREE.Color;
}

function hasMaterialEmissive(material: THREE.Material): material is EmissiveMaterial {
  return 'emissive' in material && material.emissive instanceof THREE.Color;
}

function collectOriginalColors(scene: THREE.Group): Map<string, THREE.Color> {
  const colors = new Map<string, THREE.Color>();
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat, index) => {
        if (hasMaterialColor(mat)) {
          colors.set(`${child.uuid}-${index}`, mat.color.clone());
        }
      });
    }
  });
  return colors;
}

function tintScene(
  scene: THREE.Group,
  colorByKey: Map<string, THREE.Color>,
  tint: THREE.Color | null,
  glowColor: THREE.Color,
  glowIntensity: number,
): void {
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat, index) => {
        if (hasMaterialColor(mat)) {
          const original = colorByKey.get(`${child.uuid}-${index}`);
          mat.color.copy(tint ?? original ?? mat.color);
        }
        if (hasMaterialEmissive(mat)) {
          mat.emissive.copy(glowColor);
          mat.emissiveIntensity = glowIntensity;
        }
      });
    }
  });
}

export function GlbMob({ mob, animTime, config }: GlbMobProps) {
  const { scene } = useGLTF(config.path);

  const clonedScene = useMemo(() => cloneSceneWithMaterials(scene), [scene]);
  const originalColors = useMemo(() => collectOriginalColors(clonedScene), [clonedScene]);

  // 自動接地: GLBバウンディングボックスからY底面を0に揃える
  const groundedPosition = useMemo((): [number, number, number] => {
    if (config.disableAutoGround) {
      return config.modelPosition;
    }
    const autoY = computeGroundOffset(scene, config.scale, config.path);
    return [config.modelPosition[0], autoY, config.modelPosition[2]];
  }, [scene, config.scale, config.path, config.modelPosition, config.disableAutoGround]);

  const isDamaged = mob.hitTimer > 0;
  const isAngry = mob.angryAtPlayer;
  const tint = useMemo(() => {
    if (isDamaged) return config.damagedTint ?? new THREE.Color(0xff6666);
    if (isAngry) return config.angryTint ?? new THREE.Color(0xff6644);
    return null;
  }, [config.angryTint, config.damagedTint, isAngry, isDamaged]);
  const traitAccent = mob.traitAccent;
  const hitPulse = THREE.MathUtils.clamp(mob.hitTimer / 0.3, 0, 1);
  const glowColor = useMemo(() => {
    if (tint) return tint.clone().multiplyScalar(0.58);
    if (traitAccent) return new THREE.Color(traitAccent).multiplyScalar(0.34);
    return new THREE.Color(0xffe7bd).multiplyScalar(0.16);
  }, [tint, traitAccent]);
  const glowIntensity = 0.18 + hitPulse * 0.34 + (isAngry ? 0.16 : 0) + (traitAccent ? 0.07 : 0);

  useEffect(() => {
    tintScene(clonedScene, originalColors, tint, glowColor, glowIntensity);
  }, [clonedScene, glowColor, glowIntensity, originalColors, tint]);

  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;
  const isMoving = Math.abs(mob.vx) > 0.1 || Math.abs(mob.vz) > 0.1;
  const speed = Math.min(1.8, Math.sqrt(mob.vx * mob.vx + mob.vz * mob.vz));
  const bob = isMoving
    ? Math.sin(animTime * (config.bobSpeed ?? 4)) * (config.bobAmount ?? 0.04)
    : 0;
  const movePhase = animTime * (config.bobSpeed ?? 4);
  const strideLean = isMoving ? Math.sin(movePhase) * Math.min(0.12, speed * 0.045) : 0;
  const sideLean = isMoving ? Math.cos(movePhase * 0.5) * Math.min(0.07, speed * 0.025) : 0;
  const hitLean = -hitPulse * 0.2;
  const hitRoll = Math.sin(animTime * 34) * hitPulse * 0.08;
  const squashY = 1 - hitPulse * 0.05 + (isMoving ? Math.abs(Math.sin(movePhase)) * 0.015 : 0);
  const squashXZ = 1 + hitPulse * 0.045;
  const shadowScale = Math.max(0.34, config.hpBarWidth * 0.72) * (1 + speed * 0.08 + hitPulse * 0.08);
  const angryPulse = isAngry ? 0.5 + Math.sin(animTime * 8) * 0.18 : 0;
  const traitPulse = traitAccent ? 0.42 + Math.sin(animTime * 3.2) * 0.08 : 0;
  const auraColor = traitAccent ?? (isAngry ? '#ff6644' : '#ffffff');

  return (
    <group position={[mob.x, mob.y + bob, mob.z]} rotation={[0, mob.rotation, 0]}>
      <mesh position={[0, 0.018 - bob, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[shadowScale * 1.18, shadowScale, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial
          color={0x111111}
          transparent
          opacity={0.22}
          depthWrite={false}
        />
      </mesh>
      {traitAccent && (
        <mesh
          position={[0, 0.04 - bob, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[1 + traitPulse * 0.08, 1 + traitPulse * 0.08, 1]}
        >
          <ringGeometry args={[0.46, 0.62, 36]} />
          <meshBasicMaterial
            color={auraColor}
            transparent
            opacity={traitPulse}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      {isAngry && (
        <mesh position={[0, 0.06 - bob, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1 + angryPulse * 0.16, 1 + angryPulse * 0.16, 1]}>
          <ringGeometry args={[0.54, 0.68, 36]} />
          <meshBasicMaterial
            color={auraColor}
            transparent
            opacity={0.22 + angryPulse * 0.18}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}

      <group
        position={groundedPosition}
        rotation={[hitLean + strideLean, 0, hitRoll + sideLean]}
        scale={[config.scale * squashXZ, config.scale * squashY, config.scale * squashXZ]}
      >
        <primitive
          object={clonedScene}
          rotation={config.modelRotation ?? [0, 0, 0]}
        />
      </group>

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
