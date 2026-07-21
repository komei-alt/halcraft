// パーティクルごとの size 属性を反映する PointsMaterial ヘルパー
// 標準 PointsMaterial は uniform size しか見ないため、onBeforeCompile で差し替える

import * as THREE from 'three';

export interface SizedPointsMaterialOptions {
  size?: number;
  opacity?: number;
  blending?: THREE.Blending;
  depthWrite?: boolean;
  depthTest?: boolean;
  toneMapped?: boolean;
}

/** attribute `particleSize` を gl_PointSize に使う PointsMaterial を作る */
export function createSizedPointsMaterial(
  options: SizedPointsMaterialOptions = {},
): THREE.PointsMaterial {
  const material = new THREE.PointsMaterial({
    size: options.size ?? 0.2,
    vertexColors: true,
    transparent: true,
    opacity: options.opacity ?? 0.95,
    sizeAttenuation: true,
    depthWrite: options.depthWrite ?? false,
    depthTest: options.depthTest ?? true,
    toneMapped: options.toneMapped ?? true,
    blending: options.blending ?? THREE.NormalBlending,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'uniform float size;',
        'uniform float size;\nattribute float particleSize;',
      )
      .replace(
        'gl_PointSize = size;',
        'gl_PointSize = particleSize;',
      )
      .replace(
        'gl_PointSize = size * ( scale / - mvPosition.z );',
        'gl_PointSize = particleSize * ( scale / - mvPosition.z );',
      );
  };
  material.customProgramCacheKey = () => 'halcraft-sized-points-v1';

  return material;
}
