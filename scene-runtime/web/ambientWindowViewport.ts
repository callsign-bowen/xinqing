import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { refineRoomMaterials } from './bedroomMaterials';
import { addSceneDog, type SceneDog } from './sceneDog';

export interface WindowViewport {
  resume(): void;
  pause(): void;
  resetView(): void;
  reactToReply(): void;
  greet(): void;
  greetDog(): boolean;
  talkDog(): boolean;
  dispose(): void;
}

export type AmbientSceneKind = 'window' | 'lunar' | 'forest' | 'ocean' | 'bedroom';
export type WindowCompanion = 'dog' | 'kitten';

const interactive = 'button,a,input,textarea,select,summary,[contenteditable="true"],[role="button"],.ai-messages,.ai-input-area,.ai-header,.ai-action-row,.ambient-controls,.ambient-speech';
const frameInterval = 1000 / 30;

/** A seated, full 360-degree view of the Blender room, independent of the chat workflow. */
export async function createWindowViewport(host: HTMLElement, surface: HTMLElement, kind: AmbientSceneKind = 'window', cancellation?: AbortSignal, companion: WindowCompanion = 'kitten'): Promise<WindowViewport> {
  if(kind==='ocean'){const {createOceanAmbientViewport}=await import('./oceanAmbientViewport');cancellation?.throwIfAborted();return createOceanAmbientViewport(host,surface,cancellation);}
  if(kind==='forest'||kind==='bedroom'){const {createFrameSceneViewport}=await import('./frameSceneViewport');cancellation?.throwIfAborted();return createFrameSceneViewport(host,surface,kind,cancellation);}
  const lunar = kind === 'lunar';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(lunar ? '#030711' : '#cbdde6');
  if (!lunar) scene.fog = new THREE.Fog('#cbdde6', 90, 420);
  const camera = new THREE.PerspectiveCamera(54, 1, .08, lunar ? 1400 : 800);
  if (lunar) {
    camera.position.set(-.8, 1.65, 5.2);
    camera.lookAt(-1, .7, -25);
  } else if (companion === 'dog') {
    camera.position.set(1.6, 1.85, 4.3);
    camera.lookAt(0, 1.9, -4.3);
  } else {
    camera.position.set(1.1, 1.65, 3.0);
    camera.lookAt(0, 1.25, -4.3);
  }
  const startRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  const abort = new AbortController();
  const cancelledExternally = () => dispose();
  const oldTabindex = surface.getAttribute('tabindex');
  const oldLabel = surface.getAttribute('aria-label');
  const oldTouchAction = surface.style.touchAction;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instanceBatches = new Set<THREE.InstancedMesh>();
  let renderer: THREE.WebGLRenderer | undefined;
  let environment: THREE.WebGLRenderTarget | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let model: THREE.Object3D | undefined;
  let dog: SceneDog | undefined;
  let companionObject: THREE.Object3D | undefined;
  let pressX=0,pressY=0,wasDrag=false;
  let targetFov = 54, dogFocus = false, returnYaw = 0, returnPitch = 0;
  let animateKitten: ((time: number) => void) | undefined;
  let kittenAnchor: THREE.Object3D | undefined;
  let animationTime = 0, animationTick = 0, lastWave = -Infinity, greetRequested = true;
  let kittenMixer: THREE.AnimationMixer | undefined;
  const projectedAnchor = new THREE.Vector3();
  let loaded = false, disposed = false, active = false, contextLost = false;
  let frame = 0, lastFrame = -Infinity, dirty = true;
  let targetYaw = 0, targetPitch = 0, yaw = 0, pitch = 0;
  let pointer: number | undefined, pointerX = 0, pointerY = 0;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function collect(root: THREE.Object3D): void {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  }

  function batchStaticMeshes(root: THREE.Object3D, label: string): void {
    root.updateMatrixWorld(true);
    const rootInverse = root.matrixWorld.clone().invert();
    const localMatrix = new THREE.Matrix4();
    const batches = new Map<string, THREE.Mesh[]>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || object instanceof THREE.SkinnedMesh || Array.isArray(object.material) || object.children.length) return;
      const key = `${object.geometry.uuid}:${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      const batch = batches.get(key) || [];
      batch.push(object); batches.set(key, batch);
    });
    for (const objects of batches.values()) {
      if (objects.length < 4) continue;
      const first = objects[0];
      const instanced = new THREE.InstancedMesh(first.geometry, first.material, objects.length);
      instanced.name = `${label} | ${first.name}`;
      instanced.castShadow = first.castShadow;
      instanced.receiveShadow = first.receiveShadow;
      objects.forEach((object, index) => {
        localMatrix.multiplyMatrices(rootInverse, object.matrixWorld);
        instanced.setMatrixAt(index, localMatrix);
        object.removeFromParent();
      });
      instanced.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingBox(); instanced.computeBoundingSphere();
      root.add(instanced); instanceBatches.add(instanced);
    }
  }

  function releasePointer(): void {
    if (pointer !== undefined) {
      try { if (surface.hasPointerCapture(pointer)) surface.releasePointerCapture(pointer); } catch { /* The browser may already have cancelled this pointer. */ }
      pointer = undefined;
    }
    delete surface.dataset.dragging;
  }

  function pause(): void {
    active = false;
    dog?.closeChat();
    lastFrame = -Infinity;
    animationTick = 0;
    cancelAnimationFrame(frame); frame = 0;
    releasePointer();
    surface.style.touchAction = oldTouchAction;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancellation?.removeEventListener('abort', cancelledExternally);
    pause(); abort.abort(); clearTimeout(loadTimeout);
    resizeObserver?.disconnect();
    surface.removeEventListener('pointerdown', pointerDown);
    surface.removeEventListener('pointermove', pointerMove);
    surface.removeEventListener('pointerup', pointerEnd);
    surface.removeEventListener('pointercancel', pointerEnd);
    surface.removeEventListener('lostpointercapture', pointerEnd);
    surface.removeEventListener('keydown', keyDown);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', visibilityChanged);
    renderer?.domElement.removeEventListener('webglcontextlost', loseContext);
    if (oldTabindex === null) surface.removeAttribute('tabindex'); else surface.setAttribute('tabindex', oldTabindex);
    if (oldLabel === null) surface.removeAttribute('aria-label'); else surface.setAttribute('aria-label', oldLabel);
    if (model) collect(model);
    dog?.dispose();
    kittenMixer?.stopAllAction();
    if (kittenMixer) kittenMixer.uncacheRoot(kittenMixer.getRoot());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    instanceBatches.forEach(batch => batch.dispose()); instanceBatches.clear();
    geometries.clear(); materials.clear(); textures.clear();
    scene.environment = null;
    environment?.dispose();
    scene.clear();
    renderer?.renderLists.dispose();
    renderer?.dispose();
    renderer?.domElement.remove();
  }

  function loseContext(event: Event): void {
    event.preventDefault(); contextLost = true;
    const wasLoaded = loaded;
    host.dataset.viewportState = 'error';
    dispose();
    // Reveal the static image underneath; errors after initialization cannot reject its resolved promise.
    if (wasLoaded) host.dispatchEvent(new CustomEvent('ambient-viewport-error', { detail: new Error('三维场景的图形连接已中断。') }));
  }

  function schedule(): void {
    if (active && !disposed && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }

  function render(now: number): void {
    frame = 0;
    if (!active || disposed || !renderer || document.hidden) return;
    if (now - lastFrame < frameInterval) { schedule(); return; }
    const dt = Number.isFinite(lastFrame) ? Math.min(.1, Math.max(0, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    const speed = reducedMotion.matches ? 1 : .42;
    yaw += (targetYaw - yaw) * speed;
    pitch += (targetPitch - pitch) * speed;
    const rotating = Math.abs(targetYaw - yaw) + Math.abs(targetPitch - pitch) > .0001;
    if (!rotating) {
      yaw = targetYaw; pitch = targetPitch;
      // Rebase after full turns without changing the visible direction.
      const turns = Math.round(yaw / (Math.PI * 2)) * Math.PI * 2;
      yaw -= turns; targetYaw -= turns;
    }
    rotation.set(startRotation.x + pitch, startRotation.y + yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(rotation);
    const zooming = Math.abs(camera.fov - targetFov) > .01;
    if (zooming) { camera.fov += (targetFov - camera.fov) * speed; camera.updateProjectionMatrix(); }
    dog?.update(dt);
    const moving = rotating || zooming || Boolean(dog?.isActive());
    const animate = Boolean(animateKitten) && !reducedMotion.matches;
    if (animate) {
      if (animationTick) animationTime += Math.min((now - animationTick) / 1000, .1);
      animationTick = now;
      animateKitten!(animationTime);
      dirty = true;
    }
    if (dirty || moving) {
      try {
        renderer.render(scene, camera); dirty = false;
        if (kittenAnchor) {
          kittenAnchor.getWorldPosition(projectedAnchor).project(camera);
          host.dispatchEvent(new CustomEvent('ambient-kitten-anchor', { detail: {
            x: (projectedAnchor.x + 1) * host.clientWidth / 2,
            y: (1 - projectedAnchor.y) * host.clientHeight / 2,
            visible: Math.abs(projectedAnchor.x) < 1 && Math.abs(projectedAnchor.y) < 1 && Math.abs(projectedAnchor.z) < 1,
          } }));
        }
      }
      catch {
        host.dataset.viewportState = 'error'; dispose();
        host.dispatchEvent(new CustomEvent('ambient-viewport-error', { detail: new Error('三维场景暂时无法显示。') }));
        return;
      }
    }
    // Animate only while the scene is open; reduced-motion users retain the static pose.
    if (moving || animate) { dirty = true; schedule(); }
  }

  function resize(): void {
    if (!renderer || disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    targetFov = dogFocus ? 34 : width < height ? 70 : 54;
    if (!dogFocus) camera.fov = targetFov;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    dirty = true; schedule();
  }

  function allowedTarget(target: EventTarget | null): boolean {
    return !(target instanceof Element) || !target.closest(interactive);
  }

  function pointerDown(event: PointerEvent): void {
    if (!active || disposed || pointer !== undefined || !event.isPrimary || event.button !== 0 || !allowedTarget(event.target)) return;
    pointer = event.pointerId; pointerX = pressX = event.clientX; pointerY = pressY = event.clientY;wasDrag=false;
    try { surface.setPointerCapture(pointer); } catch { /* Drag still works while the pointer remains over the surface. */ }
    surface.dataset.dragging = 'true';
    // Do not blur an active chat draft or dismiss its software keyboard just to move the view.
    if (!(document.activeElement instanceof Element) || !document.activeElement.matches('input,textarea,[contenteditable="true"]')) surface.focus({ preventScroll: true });
  }

  function changeView(dx: number, dy: number): void {
    targetYaw += dx;
    const pitchLimit = THREE.MathUtils.degToRad(82);
    targetPitch = THREE.MathUtils.clamp(targetPitch + dy, -pitchLimit - startRotation.x, pitchLimit - startRotation.x);
    dirty = true; schedule();
  }

  function pointerMove(event: PointerEvent): void {
    if (event.pointerId !== pointer || !active) return;
    if(Math.hypot(event.clientX-pressX,event.clientY-pressY)>7)wasDrag=true;
    // One screen-width swipe turns about 180 degrees on both phones and desktops.
    const sensitivity = Math.PI / Math.max(320, host.clientWidth);
    changeView((event.clientX - pointerX) * sensitivity, (event.clientY - pointerY) * sensitivity * .8);
    pointerX = event.clientX; pointerY = event.clientY;
    event.preventDefault();
  }

  function pointerEnd(event: PointerEvent): void {
    if(event.type==='pointerup'&&event.pointerId===pointer&&!wasDrag&&Math.hypot(event.clientX-pressX,event.clientY-pressY)<=7&&active&&companionObject){
      const rect=host.getBoundingClientRect(),ray=new THREE.Raycaster();camera.updateMatrixWorld(true);companionObject.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
      if(ray.intersectObject(companionObject,true).length){greet();host.dispatchEvent(new CustomEvent('ambient-character-activate'));}
    }
    if (event.pointerId === pointer) releasePointer();
  }

  function keyDown(event: KeyboardEvent): void {
    if (!active || disposed || event.altKey || event.ctrlKey || event.metaKey || !allowedTarget(event.target)) return;
    switch (event.key) {
      case 'ArrowLeft': changeView(Math.PI / 9, 0); break;
      case 'ArrowRight': changeView(-Math.PI / 9, 0); break;
      case 'ArrowUp': changeView(0, Math.PI / 18); break;
      case 'ArrowDown': changeView(0, -Math.PI / 18); break;
      case 'Home': resetView(); break;
      default: return;
    }
    event.preventDefault();
  }

  function resetView(): void {
    if (disposed) return;
    dog?.closeChat();
    releasePointer();
    targetFov = host.clientWidth < host.clientHeight ? 70 : 54;
    targetYaw = Math.round(yaw / (Math.PI * 2)) * Math.PI * 2;
    targetPitch = 0;
    dirty = true; schedule();
  }

  function visibilityChanged(): void {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; animationTick = 0; releasePointer(); }
    else if (active) { dirty = true; lastFrame = -Infinity; schedule(); }
  }

  function resume(): void {
    if (disposed || contextLost || !loaded) return;
    const entering = !active;
    active = true; surface.style.touchAction = 'none';
    if (entering) dog?.greet();
    animationTick = 0; greetRequested = true;
    dirty = true; lastFrame = -Infinity; resize(); schedule();
  }

  function greet(): void { dog?.greet(); greetRequested = true; dirty = true; schedule(); }
  function reactToReply(): void { if (animationTime - lastWave > 6) greet(); }

  function focusDog(focused: boolean): void {
    if (focused && dog) {
      returnYaw = targetYaw; returnPitch = targetPitch; dogFocus = true;
      const target = dog.root.getWorldPosition(new THREE.Vector3()); target.y += .85 * .68;
      const look = camera.clone(); look.lookAt(target);
      const aim = new THREE.Euler().setFromQuaternion(look.quaternion, 'YXZ');
      targetYaw = aim.y - startRotation.y; targetPitch = aim.x - startRotation.x; targetFov = 34;
    } else {
      dogFocus = false; targetYaw = returnYaw; targetPitch = returnPitch;
      targetFov = host.clientWidth < host.clientHeight ? 70 : 54;
    }
    dirty = true; schedule();
  }

  const loadTimeout = window.setTimeout(() => abort.abort(), 45000);
  cancellation?.addEventListener('abort', cancelledExternally, { once: true });
  try {
    if (cancellation?.aborted) throw new Error('三维场景加载已停止。');
    host.dataset.viewportState = 'loading';
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lunar ? 1 : .9;
    if (lunar) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
    }
    const canvas = renderer.domElement;
    canvas.className = 'ambient-window-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    canvas.addEventListener('webglcontextlost', loseContext);
    host.append(canvas);
    if (oldTabindex === null) surface.tabIndex = 0;
    if (oldLabel === null) surface.setAttribute('aria-label', `${lunar ? '月面观星' : '安静窗边'}三维场景，可在空白处拖动或按方向键360度环视，Home 键恢复视角`);

    const roomEnvironment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    try { environment = pmrem.fromScene(roomEnvironment, .04); scene.environment = environment.texture; }
    finally { roomEnvironment.dispose(); pmrem.dispose(); }
    scene.environmentIntensity = lunar ? .18 : .65;
    if (lunar) {
      const [modelResponse, skyResponse] = await Promise.all([
        fetch('/models/lunar-camp.glb', { signal: abort.signal }),
        fetch('/scenes/lunar/deep-sky-8k.jpg', { signal: abort.signal }),
      ]);
      if (!modelResponse.ok || !skyResponse.ok) throw new Error('月面场景资源加载失败。');
      const [modelBytes, skyBlob] = await Promise.all([modelResponse.arrayBuffer(), skyResponse.blob()]);
      if (disposed || abort.signal.aborted) throw new Error('三维场景加载已停止。');
      const draco = new DRACOLoader().setDecoderPath('/draco/').setWorkerLimit(2);
      let gltf;
      try {
        gltf = await new GLTFLoader().setDRACOLoader(draco).parseAsync(modelBytes, new URL('/models/', document.baseURI).href);
      } finally { draco.dispose(); }
      model = gltf.scene;
      collect(model);
      if (disposed || abort.signal.aborted) throw new Error('三维场景加载已停止。');
      const skyUrl = URL.createObjectURL(skyBlob);
      let skyTexture: THREE.Texture;
      try { skyTexture = await new THREE.TextureLoader().loadAsync(skyUrl); }
      finally { URL.revokeObjectURL(skyUrl); }
      textures.add(skyTexture);
      if (disposed || abort.signal.aborted) { skyTexture.dispose(); throw new Error('三维场景加载已停止。'); }
      skyTexture.mapping = THREE.EquirectangularReflectionMapping;
      skyTexture.colorSpace = THREE.SRGBColorSpace;
      scene.background = skyTexture;
      scene.backgroundIntensity = 1;
      scene.backgroundBlurriness = 0;
      // Match Blender's +Y forward sky bake to glTF's -Z forward view.
      scene.backgroundRotation.y = Math.PI / 2;
      scene.add(new THREE.HemisphereLight('#adbee2', '#15151b', .24));
      const sunlight = new THREE.DirectionalLight('#dce6ff', 3.2);
      sunlight.position.set(-28, 45, 28);
      sunlight.castShadow = true;
      sunlight.shadow.mapSize.set(1024, 1024);
      sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -24;
      sunlight.shadow.camera.right = sunlight.shadow.camera.top = 24;
      sunlight.shadow.camera.near = 1; sunlight.shadow.camera.far = 120;
      sunlight.shadow.normalBias = .035; sunlight.shadow.bias = -.00015;
      scene.add(sunlight, sunlight.target);
      const beacon = new THREE.PointLight('#ffbb6c', 9, 8, 2);
      beacon.position.set(-.72, .94, -1.42); scene.add(beacon);
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        const skyObject = objectMaterials.some(material => /earth|star|galaxy|sky/i.test(material.name));
        const terrain = objectMaterials.some(material => /regolith|terrain|moon dust/i.test(material.name));
        object.castShadow = !skyObject && !terrain;
        object.receiveShadow = !skyObject;
        for (const material of objectMaterials) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.envMapIntensity = .22;
          if (material.map) material.map.anisotropy = Math.min(8, renderer!.capabilities.getMaxAnisotropy());
          if (material.map && /regolith|fractured basalt rock/i.test(material.name)) {
            material.bumpMap = material.map;
            material.bumpScale = /regolith/i.test(material.name) ? .014 : .006;
            material.needsUpdate = true;
          }
        }
      });
      // The refined surface shares a handful of rock meshes across thousands of
      // placements. Keep the detail while reducing them to a few static draws.
      batchStaticMeshes(model, 'Lunar rock field');
      scene.add(model);
      const astronautResponse = await fetch('/models/lunar-astronaut-supplied.glb?v=wrist2', { signal: abort.signal });
      if (!astronautResponse.ok) throw new Error('宇航员模型加载失败。');
      const astronautBytes = await astronautResponse.arrayBuffer();
      if (disposed || abort.signal.aborted) throw new Error('三维场景加载已停止。');
      const astronautGltf = await new GLTFLoader().parseAsync(astronautBytes, new URL('/models/', document.baseURI).href);
      const astronaut = astronautGltf.scene;
      companionObject=astronaut;
      collect(astronaut);
      if (disposed || abort.signal.aborted) throw new Error('三维场景加载已停止。');
      astronaut.name = 'Lunar astronaut companion';
      astronaut.scale.setScalar(1.6);
      astronaut.position.set(-1.6, 0, -.3);
      astronaut.updateMatrixWorld(true);
      const groundRay = new THREE.Raycaster(new THREE.Vector3(-1.6, 5, -.3), new THREE.Vector3(0, -1, 0));
      const groundHit = groundRay.intersectObject(model, true)[0];
      astronaut.position.y = (groundHit?.point.y ?? 0) + .012;
      astronaut.traverse(object => {
        if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      scene.add(astronaut);
      kittenAnchor = new THREE.Object3D();
      kittenAnchor.position.set(0, .82, 0);
      astronaut.add(kittenAnchor);
      const waveClip = astronautGltf.animations[0];
      if (!waveClip) throw new Error('宇航员挥手动画未能加载。');
      kittenMixer = new THREE.AnimationMixer(astronaut);
      const waveAction = kittenMixer.clipAction(waveClip);
      waveAction.setLoop(THREE.LoopOnce, 1); waveAction.clampWhenFinished = true;
      let previousTime = 0;
      animateKitten = time => {
        if (greetRequested || time - lastWave > 18) {
          waveAction.reset().play(); lastWave = time; greetRequested = false;
        }
        kittenMixer!.update(Math.max(0, Math.min(time - previousTime, .1)));
        previousTime = time;
        renderer!.shadowMap.needsUpdate = true;
      };
      renderer.shadowMap.needsUpdate = true;
    } else {
    scene.add(new THREE.HemisphereLight('#e8f2ff', '#b79a75', 1.7));
    const daylight = new THREE.DirectionalLight('#fff2d9', 2.4);
    daylight.position.set(-6, 10, -12); scene.add(daylight);
    const interiorFill = new THREE.DirectionalLight('#ffe1ae', .5);
    interiorFill.position.set(4, 4, 5); scene.add(interiorFill);

    const response = await fetch('/models/quiet-window.glb', { signal: abort.signal });
    if (!response.ok) throw new Error(`窗边场景加载失败（${response.status}）。`);
    const bytes = await response.arrayBuffer();
    if (disposed) throw new Error('三维场景的图形连接已中断。');
    const gltf = await new GLTFLoader().parseAsync(bytes, new URL('/models/', document.baseURI).href);
    model = gltf.scene;
    if (disposed || abort.signal.aborted) {
      collect(model);
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      geometries.clear(); materials.clear(); textures.clear();
      throw new Error('三维场景加载已停止。');
    }
    refineRoomMaterials(model);
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false; object.receiveShadow = false;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.envMapIntensity = .75;
        // Refraction and Blender's glass nodes are unnecessarily costly for this seated mobile view.
        if (/glass|glazing|pane/i.test(material.name)) {
          material.transparent = true; material.opacity = .09; material.depthWrite = false;
          material.roughness = .18; material.metalness = 0;
          if (material instanceof THREE.MeshPhysicalMaterial) material.transmission = 0;
        } else if (/water|lake/i.test(material.name)) {
          material.color.set('#6d969c'); material.roughness = .3; material.metalness = .18;
          material.envMapIntensity = 1;
        }
      }
    });
    // Shared Blender foliage arrives as repeated mesh nodes. Batch those nodes so
    // mobile GPUs draw a grove once per geometry/material rather than once per tree.
    batchStaticMeshes(model, 'Window grove');
    scene.add(model); collect(model);

    const rearResponse = await fetch('/models/quiet-window-rear.glb', { signal: abort.signal });
    if (!rearResponse.ok) throw new Error(`房间后景加载失败（${rearResponse.status}）。`);
    const rearBytes = await rearResponse.arrayBuffer();
    if (disposed || abort.signal.aborted) throw new Error('三维场景加载已停止。');
    const rearGltf = await new GLTFLoader().parseAsync(rearBytes, new URL('/models/', document.baseURI).href);
    const rearRoom = rearGltf.scene;
    collect(rearRoom);
    if (disposed || abort.signal.aborted) throw new Error('三维场景加载已停止。');
    refineRoomMaterials(rearRoom);
    model.add(rearRoom);

    if (companion === 'dog') {
    try {
      const supportRay = new THREE.Raycaster(new THREE.Vector3(1.35, 1.3, -3.92), new THREE.Vector3(0, -1, 0));
      const seat = supportRay.intersectObject(model, true).find(hit => hit.point.y > .3 && hit.point.y < 1.15)?.point.y ?? .76;
      dog = await addSceneDog(scene, {
        position: [1.35, seat + .006, -3.92], height: .85, face: [1.6, 4.3], signal: abort.signal,
        castShadow: false, contactShadow: true, autoGreet: false,
        chat: { host: host.parentElement || host, camera, viewport: renderer.domElement, onOpen: () => focusDog(true), onClose: () => focusDog(false) },
        onWake: () => { dirty = true; schedule(); }
      });
      dog.bindInteraction(surface, camera, renderer.domElement);
      host.dataset.companionDog = 'ready';
    } catch (error) { if (!disposed) { console.warn('Window dog unavailable', error); host.dataset.companionDog = 'error'; } }
    } else {
    // Keep the companion separate from the room's material overrides and foliage batching.
    // Its GLB includes the supplied colour texture and skeleton in the original greeting pose.
    const kittenResponse = await fetch('/models/window-kitten-rebound.glb', { signal: abort.signal });
    if (!kittenResponse.ok) throw new Error(`窗边小猫加载失败（${kittenResponse.status}）。`);
    const kittenBytes = await kittenResponse.arrayBuffer();
    if (disposed || abort.signal.aborted) throw new Error('三维场景加载已停止。');
    const kittenGltf = await new GLTFLoader().parseAsync(kittenBytes, new URL('/models/', document.baseURI).href);
    const kitten = kittenGltf.scene;
    companionObject=kitten;
    collect(kitten);
    if (disposed || abort.signal.aborted) {
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      throw new Error('三维场景加载已停止。');
    }
    kitten.name = 'Window kitten companion';
    kitten.scale.setScalar(1.1);
    kitten.rotation.y = THREE.MathUtils.degToRad(18);
    kitten.position.set(.3, 0, -.15);
    kitten.updateMatrixWorld(true);
    kitten.position.y += .065 - new THREE.Box3().setFromObject(kitten).min.y;
    kitten.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.roughness = .72;
          material.envMapIntensity = .45;
        }
      }
    });
    model.add(kitten);
    kittenAnchor = new THREE.Object3D();
    kittenAnchor.position.set(0, .78, 0);
    kitten.add(kittenAnchor);
    kitten.updateMatrixWorld(true);
    const findBone = (suffix: string) => {
      let found: THREE.Bone | undefined;
      kitten.traverse(object => { if (object instanceof THREE.Bone && object.name.endsWith(suffix)) found = object; });
      return found;
    };
    const spine = findBone('Spine1');
    const spineScale = spine?.scale.clone();
    const waveClip = kittenGltf.animations.find(clip => clip.name === 'Kitten_Wave_Rebound');
    if (!waveClip) throw new Error('小猫挥手动画未能加载。');
    kittenMixer = new THREE.AnimationMixer(kitten);
    const waveAction = kittenMixer.clipAction(waveClip);
    waveAction.setLoop(THREE.LoopOnce, 1); waveAction.clampWhenFinished = true;
    let previousTime = 0;
    animateKitten = time => {
      if (greetRequested || time - lastWave > 12) {
        waveAction.reset().play(); lastWave = time; greetRequested = false;
      }
      kittenMixer!.update(Math.max(0, Math.min(time - previousTime, .1)));
      previousTime = time;
      if (spine && spineScale) spine.scale.copy(spineScale).multiplyScalar(1 + Math.sin(time * 1.6) * .003);
    };
    // A soft contact shadow anchors the paws without adding a full-room shadow pass on mobile.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d');
    if (shadowContext) {
      const gradient = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(58,43,29,.28)');
      gradient.addColorStop(1, 'rgba(58,43,29,0)');
      shadowContext.fillStyle = gradient;
      shadowContext.fillRect(0, 0, 128, 128);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, .7), new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false,
      }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(.3, .067, -.15);
      model.add(shadow); collect(shadow);
    }
    }
    }
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', visibilityChanged);
    surface.addEventListener('pointerdown', pointerDown);
    surface.addEventListener('pointermove', pointerMove, { passive: false });
    surface.addEventListener('pointerup', pointerEnd);
    surface.addEventListener('pointercancel', pointerEnd);
    surface.addEventListener('lostpointercapture', pointerEnd);
    surface.addEventListener('keydown', keyDown);
    loaded = true; host.dataset.viewportState = 'ready';
    resize();
    return { resume, pause, resetView, reactToReply, greet, greetDog: () => active && !disposed && !!dog?.greet(), talkDog: () => active && !disposed && !!dog?.talk(), dispose };
  } catch (error) {
    if (!disposed) host.dataset.viewportState = 'error';
    dispose();
    // A loader can finish after a scene switch disposed its viewport. Release any
    // assets that arrived after that disposal rather than retaining a stale room.
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
    geometries.clear(); materials.clear(); textures.clear();
    throw error;
  } finally { clearTimeout(loadTimeout); }
}
