// GLB モブ描画の共通コンポーネント
// 静的GLBにプロシージャル・リグを載せ、歩行・待機・被ダメを駆動する
// 自動接地: modelPosition.y を手動指定する必要なし（computeGroundOffset で自動計算）

import { useEffect, useMemo, useRef } from 'react';
import { Billboard, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MobData } from '../../stores/useMobStore';
import { computeGroundOffset } from '../../utils/autoGround';
import {
  buildProceduralMobRig,
  type MobRigStyle,
  type ProceduralMobRig,
} from '../../utils/mobProceduralRig';

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
  /**
   * プロシージャル・リグの体型。
   * 省略時は humanoid。'none' でリグ無効（従来の剛体＋簡易ボブのみ）。
   */
  rigStyle?: MobRigStyle | 'none';
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

function collectOriginalColorsFromTraverse(
  traverse: (fn: (mat: THREE.Material) => void) => void,
): Map<THREE.Material, THREE.Color> {
  const colors = new Map<THREE.Material, THREE.Color>();
  traverse((mat) => {
    if (hasMaterialColor(mat) && !colors.has(mat)) {
      colors.set(mat, mat.color.clone());
    }
  });
  return colors;
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

function tintMaterials(
  traverse: (fn: (mat: THREE.Material) => void) => void,
  originalByMat: Map<THREE.Material, THREE.Color>,
  tint: THREE.Color | null,
  glowColor: THREE.Color,
  glowIntensity: number,
): void {
  traverse((mat) => {
    if (hasMaterialColor(mat)) {
      const original = originalByMat.get(mat);
      mat.color.copy(tint ?? original ?? mat.color);
    }
    if (hasMaterialEmissive(mat)) {
      mat.emissive.copy(glowColor);
      mat.emissiveIntensity = glowIntensity;
    }
  });
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
  const groupRef = useRef<THREE.Group>(null);
  const modelAnchorRef = useRef<THREE.Group>(null);
  const rigRef = useRef<ProceduralMobRig | null>(null);
  const animClock = useRef(0);
  const rigStyle = config.rigStyle ?? 'humanoid';

  // 静的クローン（フォールバック用）とリグ
  const { fallbackScene, rig, originalColorsFallback, originalColorsRig } = useMemo(() => {
    const fallback = cloneSceneWithMaterials(scene);
    let built: ProceduralMobRig | null = null;
    if (rigStyle !== 'none') {
      try {
        built = buildProceduralMobRig(scene, rigStyle);
      } catch {
        built = null;
      }
    }
    const fallbackColors = collectOriginalColors(fallback);
    const rigColors = built
      ? collectOriginalColorsFromTraverse(built.traverseMaterials)
      : new Map<THREE.Material, THREE.Color>();
    return {
      fallbackScene: fallback,
      rig: built,
      originalColorsFallback: fallbackColors,
      originalColorsRig: rigColors,
    };
  }, [scene, rigStyle]);

  useEffect(() => {
    rigRef.current = rig;
    return () => {
      rig?.dispose();
      if (rigRef.current === rig) rigRef.current = null;
    };
  }, [rig]);

  // 自動接地
  const groundedPosition = useMemo((): [number, number, number] => {
    if (config.disableAutoGround) {
      return config.modelPosition;
    }
    const autoY = computeGroundOffset(scene, config.scale, config.path);
    const fineTuneY = Math.min(0.08, Math.max(-0.05, config.modelPosition[1]));
    return [config.modelPosition[0], autoY + fineTuneY, config.modelPosition[2]];
  }, [scene, config.scale, config.path, config.modelPosition, config.disableAutoGround]);

  const isDamaged = mob.hitTimer > 0;
  const isAngry = mob.angryAtPlayer;
  const tint = useMemo(() => {
    if (isDamaged) return config.damagedTint ?? new THREE.Color(0xff6666);
    if (isAngry) return config.angryTint ?? new THREE.Color(0xff6644);
    return null;
  }, [config.angryTint, config.damagedTint, isAngry, isDamaged]);
  const traitAccent = mob.traitAccent;
  const hitPulse = THREE.MathUtils.clamp(mob.hitTimer / 0.22, 0, 1);
  const glowColor = useMemo(() => {
    if (tint) return tint.clone().multiplyScalar(0.72);
    if (traitAccent) return new THREE.Color(traitAccent).multiplyScalar(0.34);
    return new THREE.Color(0xffe7bd).multiplyScalar(0.16);
  }, [tint, traitAccent]);
  const glowIntensity = 0.18 + hitPulse * 0.72 + (isAngry ? 0.16 : 0) + (traitAccent ? 0.07 : 0);

  // 被ダメ・怒りの色
  useEffect(() => {
    if (rig) {
      tintMaterials(rig.traverseMaterials, originalColorsRig, tint, glowColor, glowIntensity);
    } else {
      tintScene(fallbackScene, originalColorsFallback, tint, glowColor, glowIntensity);
    }
  }, [
    rig,
    fallbackScene,
    originalColorsFallback,
    originalColorsRig,
    tint,
    glowColor,
    glowIntensity,
  ]);

  // 毎フレーム: 位置補間なしで最新 mob 座標 + リグ更新
  useFrame((_, delta) => {
    animClock.current += delta;
    const t = animClock.current;
    const speed = Math.hypot(mob.vx, mob.vz);
    const moving = speed > 0.12;

    if (groupRef.current) {
      groupRef.current.position.set(mob.x, mob.y, mob.z);
      groupRef.current.rotation.y = mob.rotation;
    }

    // ルートの軽いボブはリグ側の骨盤で行うため控えめ
    const bobAmp = config.bobAmount ?? 0.03;
    const bobSpeed = config.bobSpeed ?? 5;
    const rootBob = moving && !rig
      ? Math.sin(t * bobSpeed) * bobAmp
      : moving
        ? Math.sin(t * bobSpeed) * bobAmp * 0.35
        : 0;

    if (modelAnchorRef.current) {
      const hitLean = -hitPulse * 0.18;
      const hitRoll = Math.sin(t * 40) * hitPulse * 0.08;
      const strideLean = !rig && moving ? Math.sin(t * bobSpeed) * Math.min(0.1, speed * 0.04) : 0;
      const sideLean = !rig && moving ? Math.cos(t * bobSpeed * 0.5) * Math.min(0.06, speed * 0.02) : 0;
      const squashY = 1 - hitPulse * 0.08;
      const squashXZ = 1 + hitPulse * 0.06;
      modelAnchorRef.current.position.set(
        groundedPosition[0],
        groundedPosition[1] + rootBob,
        groundedPosition[2],
      );
      modelAnchorRef.current.rotation.set(hitLean + strideLean, 0, hitRoll + sideLean);
      modelAnchorRef.current.scale.set(
        config.scale * squashXZ,
        config.scale * squashY,
        config.scale * squashXZ,
      );
    }

    rigRef.current?.update({
      time: t,
      moving,
      speed,
      hitTimer: mob.hitTimer,
      angry: isAngry,
      ally: mob.isAlly,
    });
  });

  // animTime を外部同期のフォールバックに使う（初回）
  useEffect(() => {
    if (animClock.current < 0.001) animClock.current = animTime;
  }, [animTime]);

  const hpRatio = mob.hp / mob.maxHp;
  const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;
  const speed = Math.min(1.8, Math.hypot(mob.vx, mob.vz));
  const shadowScale = Math.max(0.34, config.hpBarWidth * 0.72) * (1 + speed * 0.08 + hitPulse * 0.08);
  const angryPulse = isAngry ? 0.5 + Math.sin(animTime * 8) * 0.18 : 0;
  const traitPulse = traitAccent ? 0.42 + Math.sin(animTime * 3.2) * 0.08 : 0;
  const auraColor = traitAccent ?? (isAngry ? '#ff6644' : '#ffffff');
  const modelRotation = config.modelRotation ?? [0, 0, 0];

  return (
    <group ref={groupRef} position={[mob.x, mob.y, mob.z]} rotation={[0, mob.rotation, 0]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[shadowScale * 1.18, shadowScale, 1]}>
        <circleGeometry args={[1, 28]} />
        <meshBasicMaterial
          color={0x111111}
          transparent
          opacity={0.22}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {traitAccent && (
        <mesh
          position={[0, 0.04, 0]}
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
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1 + angryPulse * 0.16, 1 + angryPulse * 0.16, 1]}>
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

      <group ref={modelAnchorRef} position={groundedPosition} scale={config.scale}>
        {rig ? (
          <group rotation={modelRotation}>
            <primitive object={rig.root} />
          </group>
        ) : (
          <primitive
            object={fallbackScene}
            rotation={modelRotation}
          />
        )}
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
