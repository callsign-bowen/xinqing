import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const OCTOPUS_LAYOUT = Object.freeze({ x: 0, z: -4.5, height: 2, groundClearance: .012 });
export const OCTOPUS_MODEL = '/models/ocean-octopus.glb';

/** Release only the supplied character's assets, never shared ocean paint textures. */
export function disposeOctopus(root: THREE.Object3D): void {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometry.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  root.removeFromParent();
  geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

/** glTF is Y-up; the supplied face points towards +Z, facing the entry camera. */
export function placeOctopus(model: THREE.Object3D, groundY: number): THREE.Group {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('章鱼模型没有有效的尺寸');
  const scale = OCTOPUS_LAYOUT.height / size.y;
  const root = new THREE.Group(); root.name = 'Ocean octopus IP';
  // Center the supplied scene with a wrapper, retaining its original UVs and materials.
  const pivot = new THREE.Group(); pivot.scale.setScalar(scale);
  model.position.x -= center.x; model.position.y -= bounds.min.y; model.position.z -= center.z;
  pivot.add(model); root.add(pivot);
  root.position.set(OCTOPUS_LAYOUT.x, groundY + OCTOPUS_LAYOUT.groundClearance, OCTOPUS_LAYOUT.z);
  root.updateMatrixWorld(true);
  return root;
}

export async function loadOceanOctopus(signal: AbortSignal, groundY: number): Promise<THREE.Group> {
  const response = await fetch(OCTOPUS_MODEL, { signal });
  if (!response.ok) throw new Error(`小章鱼载入失败（${response.status}）`);
  const bytes = await response.arrayBuffer(); signal.throwIfAborted();
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL('/models/', document.baseURI).href);
  try {
    signal.throwIfAborted();
    return placeOctopus(gltf.scene, groundY);
  } catch (error) { disposeOctopus(gltf.scene); throw error; }
}

export function addOctopusShadow(root: THREE.Group, groundY: number): void {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const gradient = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(71,77,66,.19)'); gradient.addColorStop(1, 'rgba(71,77,66,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.9), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false
  }));
  shadow.name = 'Octopus soft contact'; shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = groundY + .005 - root.position.y; shadow.renderOrder = 1;
  root.add(shadow);
}
