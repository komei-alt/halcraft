import * as THREE from 'three';

function configureColorTexture(texture: THREE.Texture | null, colorSpace: THREE.ColorSpace): void {
  if (!texture) return;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
}

/**
 * ハル由来モデルの形状・シルエットには触れず、色空間とPBR応答だけを正規化する。
 */
export function normalizeHaruModelMaterial(material: THREE.Material): void {
  material.depthTest = true;
  material.depthWrite = material.transparent ? material.depthWrite : true;
  material.toneMapped = true;

  if (material instanceof THREE.MeshStandardMaterial) {
    configureColorTexture(material.map, THREE.SRGBColorSpace);
    configureColorTexture(material.emissiveMap, THREE.SRGBColorSpace);
    configureColorTexture(material.normalMap, THREE.NoColorSpace);
    configureColorTexture(material.roughnessMap, THREE.NoColorSpace);
    configureColorTexture(material.metalnessMap, THREE.NoColorSpace);
    configureColorTexture(material.aoMap, THREE.NoColorSpace);
    material.roughness = THREE.MathUtils.clamp(material.roughness, 0.32, 0.96);
    material.metalness = THREE.MathUtils.clamp(material.metalness, 0, 0.92);
    material.envMapIntensity = THREE.MathUtils.clamp(material.envMapIntensity || 0.82, 0.62, 1.08);
    material.needsUpdate = true;
  }
}

export function normalizeHaruModelScene(scene: THREE.Object3D): void {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    child.renderOrder = 0;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(normalizeHaruModelMaterial);
  });
}

/** GLBを安全に複製し、素材だけを共通PBR規約へ揃える。 */
export function cloneHaruModelScene<T extends THREE.Object3D>(scene: T): T {
  const clone = scene.clone(true) as T;
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
  });
  normalizeHaruModelScene(clone);
  return clone;
}
