import { useEffect, useMemo } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BLOCK_DEFS, type BlockId } from '../types/blocks';
import { getMaterialIdForFace, type MaterialFaceRole } from '../data/blockMaterials';
import {
  MATERIAL_ATLAS_SLOTS,
  MATERIAL_ATLAS_SPECS,
  type MaterialAtlasId,
} from '../generated/materialAtlas';
import { useSettingsStore } from '../stores/useSettingsStore';
import { getPerformanceProfile } from './performance';

export const BLOCK_PBR_ATLAS_URLS = [
  '/textures/materials/block-base.webp',
  '/textures/materials/block-normal.webp',
  '/textures/materials/block-orm.webp',
  '/textures/materials/block-emissive.webp',
] as const;

export interface BlockPbrAtlas {
  baseColor: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
  emissive: THREE.Texture;
  slots: ReadonlyMap<MaterialAtlasId, (typeof MATERIAL_ATLAS_SLOTS)[MaterialAtlasId]>;
}

export interface AtlasMaterialOptions {
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  emissiveIntensity?: number;
  envMapIntensity?: number;
  blending?: THREE.Blending;
}

function configureAtlasTexture(
  texture: THREE.Texture,
  name: string,
  colorSpace: THREE.ColorSpace,
  anisotropy: number,
): void {
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}

/** Worldと装飾ブロックが同じ4枚のPBRアトラスを共有する。 */
export function useBlockPbrAtlas(): BlockPbrAtlas {
  const textures = useLoader(THREE.TextureLoader, [...BLOCK_PBR_ATLAS_URLS]);
  const { gl } = useThree();
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

  return useMemo(() => {
    const [baseColor, normal, orm, emissive] = textures;
    configureAtlasTexture(baseColor, 'HalCraft PBR Base Color', THREE.SRGBColorSpace, anisotropy);
    configureAtlasTexture(normal, 'HalCraft PBR Normal', THREE.NoColorSpace, anisotropy);
    configureAtlasTexture(orm, 'HalCraft PBR ORM', THREE.NoColorSpace, anisotropy);
    configureAtlasTexture(emissive, 'HalCraft PBR Emissive', THREE.SRGBColorSpace, anisotropy);
    return {
      baseColor,
      normal,
      orm,
      emissive,
      slots: new Map(Object.entries(MATERIAL_ATLAS_SLOTS)) as BlockPbrAtlas['slots'],
    };
  }, [anisotropy, textures]);
}

/** 既存形状を変えず、UVだけを指定アトラスセルへ決定的に写す。 */
export function mapGeometryToMaterialAtlas<T extends THREE.BufferGeometry>(
  geometry: T,
  materialId: MaterialAtlasId,
): T {
  const slot = MATERIAL_ATLAS_SLOTS[materialId];
  const uv = geometry.getAttribute('uv');
  if (!uv) return geometry;

  const mapped = new Float32Array(uv.count * 2);
  for (let index = 0; index < uv.count; index++) {
    mapped[index * 2] = THREE.MathUtils.lerp(slot.u0, slot.u1, uv.getX(index));
    mapped[index * 2 + 1] = THREE.MathUtils.lerp(slot.v0, slot.v1, uv.getY(index));
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(mapped, 2));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(mapped.slice(), 2));
  return geometry;
}

export function useAtlasPbrMaterial(
  materialId: MaterialAtlasId,
  options: AtlasMaterialOptions = {},
): THREE.MeshStandardMaterial {
  useSettingsStore((state) => state.graphicsPreset);
  useSettingsStore((state) => state.lightingQuality);
  const atlas = useBlockPbrAtlas();
  const pbr = getPerformanceProfile().materialDetail === 'pbr';
  const spec = MATERIAL_ATLAS_SPECS[materialId];
  const alphaMode = 'alphaMode' in spec ? spec.alphaMode : 'opaque';
  const materialEmissive = 'emissive' in spec ? spec.emissive : 0;
  const {
    side = THREE.FrontSide,
    transparent = alphaMode === 'blend',
    opacity = transparent ? 0.76 : 1,
    depthWrite = !transparent,
    emissiveIntensity = materialEmissive,
    envMapIntensity = 0.82,
    blending = THREE.NormalBlending,
  } = options;

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    map: atlas.baseColor,
    normalMap: pbr ? atlas.normal : null,
    normalScale: new THREE.Vector2(spec.normalStrength * 0.62, spec.normalStrength * 0.62),
    aoMap: pbr ? atlas.orm : null,
    aoMapIntensity: 0.8,
    roughnessMap: pbr ? atlas.orm : null,
    metalnessMap: pbr ? atlas.orm : null,
    emissiveMap: pbr && emissiveIntensity > 0 ? atlas.emissive : null,
    emissive: new THREE.Color(emissiveIntensity > 0 ? 0xffffff : 0x000000),
    emissiveIntensity,
    roughness: pbr ? 1 : spec.roughness,
    metalness: pbr ? 1 : spec.metalness,
    envMapIntensity,
    alphaTest: alphaMode === 'cutout' ? 0.34 : 0,
    transparent,
    opacity,
    depthWrite,
    depthTest: true,
    blending,
    side,
  }), [
    atlas,
    alphaMode,
    blending,
    depthWrite,
    emissiveIntensity,
    envMapIntensity,
    opacity,
    pbr,
    side,
    spec.metalness,
    spec.normalStrength,
    spec.roughness,
    transparent,
  ]);

  useEffect(() => () => material.dispose(), [material]);
  return material;
}

export function useBlockPbrMaterial(
  blockId: BlockId,
  role: MaterialFaceRole = 'side',
  options?: AtlasMaterialOptions,
): THREE.MeshStandardMaterial {
  const definition = BLOCK_DEFS[blockId];
  const materialId = definition ? getMaterialIdForFace(definition, role) : 'stone';
  return useAtlasPbrMaterial(materialId, options);
}
