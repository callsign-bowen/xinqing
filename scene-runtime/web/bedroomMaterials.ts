import * as THREE from 'three';

/** Small local textures restore the fabric and grain lost from Blender node materials in GLB. */
export function refineRoomMaterials(room: THREE.Object3D): void {
  const textures = new Map<string, THREE.CanvasTexture>();
  const materials = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  function texture(kind: 'wood' | 'cloth'): THREE.CanvasTexture {
    const existing = textures.get(kind);
    if (existing) return existing;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.createImageData(256, 256);
    let seed = 42;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967296 - .5) * 6;
      const grain = kind === 'wood'
        ? Math.sin(x * .36 + Math.sin(y * .024) * 2.4) * 7 + Math.sin(x * 1.4 + y * .014) * 2
        : ((x % 4 < 2 ? 1 : -1) + (y % 4 < 2 ? 1 : -1)) * 3;
      const value = Math.round(239 + grain + noise);
      const index = (y * 256 + x) * 4;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.repeat.set(kind === 'cloth' ? 5 : 2, kind === 'cloth' ? 5 : 1);
    result.anisotropy = 4;
    textures.set(kind, result);
    return result;
  }
  room.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const next = source.map(material => {
      if (!(material instanceof THREE.MeshStandardMaterial) || material.map) return material;
      const kind = /oak|wood/i.test(material.name) ? 'wood'
        : /bedding|linen|sage|rug/i.test(material.name) ? 'cloth' : null;
      if (!kind) {
        if (/leaf/i.test(material.name)) material.roughness = .56;
        return material;
      }
      let refined = materials.get(material);
      if (!refined) {
        refined = material.clone();
        refined.map = texture(kind);
        refined.bumpMap = refined.map;
        refined.bumpScale = kind === 'cloth' ? .003 : .0015;
        refined.roughness = kind === 'cloth' ? .96 : .76;
        materials.set(material, refined);
      }
      return refined;
    });
    // Handmade curtain and rug meshes can lack UVs; project each face along its dominant normal.
    if (next.some(material => material.map) && !object.geometry.attributes.uv) {
      const geometry = object.geometry.clone();
      const positions = geometry.attributes.position, normals = geometry.attributes.normal;
      const uv = new Float32Array(positions.count * 2);
      for (let i = 0; i < positions.count; i++) {
        const nx = Math.abs(normals?.getX(i) || 0), ny = Math.abs(normals?.getY(i) || 0);
        const nz = Math.abs(normals?.getZ(i) || 0);
        uv[i * 2] = nx > ny && nx > nz ? positions.getZ(i) : positions.getX(i);
        uv[i * 2 + 1] = ny > nx && ny > nz ? positions.getZ(i) : positions.getY(i);
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      object.geometry.dispose();
      object.geometry = geometry;
    }
    object.material = Array.isArray(object.material) ? next : next[0];
  });
  // These source materials have all been replaced and aren't part of the room's disposal walk.
  materials.forEach((_replacement, source) => source.dispose());
}
