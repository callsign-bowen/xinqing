import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createDogGreeting } from './sceneDogMotion';
import { createDogChat } from './sceneDogChat';

export interface SceneDog {
  root: THREE.Group;
  update(dt: number): void;
  greet(): boolean;
  talk(): boolean;
  closeChat(): void;
  isActive(): boolean;
  bindInteraction(surface: HTMLElement, camera: THREE.Camera, viewport?: HTMLElement): void;
  dispose(): void;
}
interface Placement {
  position: [number, number, number];
  height: number;
  face?: [number, number];
  signal?: AbortSignal;
  castShadow?: boolean;
  contactShadow?: boolean;
  autoGreet?: boolean;
  onWake?: () => void;
  chat?: { host: HTMLElement; camera: THREE.Camera; viewport: HTMLElement; onOpen?: () => void; onClose?: () => void };
}

function disposeAsset(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  root.removeFromParent();
  textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); geometries.forEach(geometry => geometry.dispose());
  skeletons.forEach(skeleton => skeleton.dispose());
}

/** Share the user's original model across scenes, with independent instances and lifetimes. */
export async function addSceneDog(scene: THREE.Scene, placement: Placement): Promise<SceneDog> {
  const response = await fetch('/models/scene-dog-greeting.glb', { signal: placement.signal });
  if (!response.ok) throw new Error(`小狗模型载入失败（${response.status}）`);
  const bytes = await response.arrayBuffer();
  placement.signal?.throwIfAborted();
  const asset = await new GLTFLoader().parseAsync(bytes, new URL('/models/', location.href).href);
  if (placement.signal?.aborted) { disposeAsset(asset.scene); placement.signal.throwIfAborted(); }
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const motion = createDogGreeting(asset.scene, asset.animations, {
    reducedMotion: preference.matches, autoGreet: placement.autoGreet, onWake: placement.onWake
  });
  // Normalize the relaxed pose, so the feet stay anchored throughout the clips.
  asset.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(asset.scene), height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height < 1e-6) { motion.dispose(); disposeAsset(asset.scene); throw new Error('小狗模型的尺寸不正确'); }
  asset.scene.scale.multiplyScalar(placement.height / height); asset.scene.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(asset.scene), center = fitted.getCenter(new THREE.Vector3());
  asset.scene.position.add(new THREE.Vector3(-center.x, -fitted.min.y, -center.z));
  asset.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = placement.castShadow ?? true; object.receiveShadow = true;
    if (object instanceof THREE.SkinnedMesh) {
      object.frustumCulled = false;
      object.computeBoundingSphere();
      if (object.boundingSphere) object.boundingSphere.radius *= 1.5;
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = .8;
    }
  });
  const root = new THREE.Group(); root.name = 'Scene companion | user dog'; root.userData.companion = 'dog';
  root.add(asset.scene); root.position.fromArray(placement.position);
  if (placement.contactShadow) {
    const shadowMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 shadowUV;void main(){shadowUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 shadowUV;void main(){float r=length((shadowUV-.5)*2.);gl_FragColor=vec4(.18,.14,.09,(1.-smoothstep(.05,1.,r))*.18);}'
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(placement.height * .7, placement.height * .55), shadowMaterial);
    shadow.name = 'Dog | soft contact shadow'; shadow.rotation.x = -Math.PI / 2; shadow.position.y = .004; root.add(shadow);
  }
  if (placement.face) root.rotation.y = Math.atan2(placement.face[0] - placement.position[0], placement.face[1] - placement.position[2]);
  scene.add(root); root.updateMatrixWorld(true);
  const anchor = new THREE.Vector3();
  const chat = placement.chat ? createDogChat({
    host: placement.chat.host, onOpen: placement.chat.onOpen, onClose: placement.chat.onClose, onWake: placement.onWake,
    anchor() {
      const { camera, viewport } = placement.chat!;
      root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      anchor.set(0, placement.height * .92, 0).applyMatrix4(root.matrixWorld).project(camera);
      const box = viewport.getBoundingClientRect();
      return { x: box.left + (anchor.x * .5 + .5) * box.width, y: box.top + (-anchor.y * .5 + .5) * box.height, visible: anchor.z > -1 && anchor.z < 1 };
    }
  }) : undefined;
  function talk(): boolean { if (disposed) return false; motion.greet(); chat?.open(); return Boolean(chat); }
  const lifetime = new AbortController();
  preference.addEventListener('change', event => motion.setReducedMotion(event.matches), { signal: lifetime.signal });
  let interaction: AbortController | undefined;
  function bindInteraction(surface: HTMLElement, camera: THREE.Camera, viewport = surface): void {
    interaction?.abort();
    if (disposed) return;
    interaction = new AbortController();
    const options = { signal: interaction.signal };
    let press: { id: number; x: number; y: number } | undefined;
    const ray = new THREE.Raycaster(), point = new THREE.Vector2();
    surface.addEventListener('pointerdown', event => {
      if (event.target instanceof Element && event.target.closest('button,a,input,textarea,select,[role="button"],[contenteditable="true"]')) return;
      if (event.isPrimary && event.button === 0) press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }, options);
    surface.addEventListener('pointermove', event => {
      if (press && (event.pointerId !== press.id || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 7)) press = undefined;
    }, options);
    surface.addEventListener('pointercancel', () => { press = undefined; }, options);
    surface.addEventListener('pointerup', event => {
      const start = press; press = undefined;
      if (!start || event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) return;
      const rect = viewport.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      point.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      root.updateMatrixWorld(true); camera.updateMatrixWorld(true); ray.setFromCamera(point, camera);
      if (ray.intersectObject(asset.scene, true).length) talk();
    }, options);
  }
  let disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; lifetime.abort(); interaction?.abort(); chat?.dispose(); motion.dispose(); placement.signal?.removeEventListener('abort', dispose); disposeAsset(root); };
  placement.signal?.addEventListener('abort', dispose, { once: true });
  return { root, update(dt) { motion.update(dt); chat?.layout(); }, greet: motion.greet, talk, closeChat: () => chat?.close(false), isActive: motion.isActive, bindInteraction, dispose };
}
