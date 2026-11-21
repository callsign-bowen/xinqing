import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OCEAN_VERTEX, OCEAN_FRAGMENT, CANOPY_VERTEX, CANOPY_FRAGMENT, createWaterCanopyGeometry, KELP_PALETTE, kelpPaletteIndex } from './oceanAppearance';
import { OCTOPUS_LAYOUT, loadOceanOctopus, addOctopusShadow, disposeOctopus } from './oceanOctopus';
import { isSceneBackground } from './embeddedSceneBridge';
import './oceanViewport.css';

export interface OceanViewport { dispose(): void; reset(): void; resume(): void; pause(): void; greet(): void }
interface SharedOceanUI {
  surface: HTMLElement;
  onAnchor(point:{x:number;y:number;visible:boolean}):void;
  onActivate():void;
  onCharacterState?(state:'loading'|'ready'|'error'):void;
}
type Quality = 'fine' | 'mobile';
const ASSETS = '/scenes/ocean/';

function discardGeometry(root: THREE.Object3D): void {
  const geometry = new Set<THREE.BufferGeometry>(), material = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { geometry.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => material.add(m)); } });
  root.removeFromParent(); geometry.forEach(g => g.dispose()); material.forEach(m => m.dispose());
}

/** Real exported Blender meshes and object-local paint coordinates; no screenshot substitute. */
export async function createOceanViewport(host: HTMLElement, signal?: AbortSignal, shared?:SharedOceanUI): Promise<OceanViewport> {
  signal?.throwIfAborted();
  const lifetime = new AbortController(), opt = { signal: lifetime.signal };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let quality: Quality = coarse || innerWidth < 700 ? 'mobile' : 'fine';
  let disposed = false, generation = 0, loading: AbortController | undefined, asset: THREE.Group | undefined;
  let raf = 0, moving = !reduced.matches, last = 0, time = 0, active = true, greeting = 0, octopusBaseY = 0;
  let yaw = 0, pitch = 0, zoom = 1;
  const origin = new THREE.Vector3(), referenceRotation = new THREE.Quaternion();
  const worldUp = new THREE.Vector3(0, 1, 0), localRight = new THREE.Vector3(1, 0, 0), localForward = new THREE.Vector3(0, 0, 1);
  const lookYaw = new THREE.Quaternion(), lookPitch = new THREE.Quaternion(), leafSway = new THREE.Quaternion();
  let referenceFov = 35.1;
  const textureSet = new Set<THREE.Texture>(), materials = new Map<string, THREE.ShaderMaterial>();
  const leaves: Array<{ object: THREE.Object3D; rotation: THREE.Quaternion; phase: number }> = [];
  host.classList.add('ocean-viewport');host.dataset.state = 'loading';
  host.innerHTML = '<div class="ocean-surface" tabindex="0" role="region" aria-label="水彩海底三维场景，可拖动环视、双指缩放，按 Home 键归位"><img class="ocean-poster" src="/scenes/ocean/poster.webp" alt="水彩海底的海草、珊瑚与礁石"><p class="ocean-loading" role="status">正在准备水彩海底…</p><span class="ocean-hint">拖动看看四周 · 双指缩放</span></div><nav class="ocean-controls" aria-label="海底场景控制"><button type="button" data-ocean="reset">视角归位</button><button type="button" data-ocean="quality">画质：精细</button><button type="button" data-ocean="motion" aria-pressed="false">轻柔动态</button></nav>';
  const surface = host.querySelector<HTMLElement>('.ocean-surface')!;
  const gestureSurface = shared?.surface || surface;
  const status = host.querySelector<HTMLElement>('.ocean-loading')!;
  const qualityButton = host.querySelector<HTMLButtonElement>('[data-ocean="quality"]')!;
  const motionButton = host.querySelector<HTMLButtonElement>('[data-ocean="motion"]')!;
  if(shared){host.dataset.shared='true';surface.tabIndex=-1;host.querySelector<HTMLElement>('.ocean-controls')!.hidden=true;host.querySelector<HTMLElement>('.ocean-hint')!.hidden=true;}
  const scene = new THREE.Scene();scene.background = new THREE.Color('#b8e1e9');
  // Ocean paint shaders remain unlit; soft lights illuminate only the supplied PBR character.
  scene.add(new THREE.HemisphereLight('#e6f7fa', '#cabd96', 1.25));
  const characterLight = new THREE.DirectionalLight('#fff6ee', 1.7); characterLight.position.set(-4, 9, 8); scene.add(characterLight);
  const characterFill = new THREE.DirectionalLight('#c8e8ec', .45); characterFill.position.set(6, 5, -3); scene.add(characterFill);
  let octopus: THREE.Group | undefined, octopusLoading = false;
  const octopusNotice = document.createElement('div'); octopusNotice.className = 'ocean-octopus-notice'; octopusNotice.hidden = true;
  const octopusStatus = document.createElement('span'); octopusStatus.setAttribute('role', 'status'); octopusStatus.setAttribute('aria-live', 'polite');
  const octopusRetry = document.createElement('button'); octopusRetry.type = 'button'; octopusRetry.textContent = '重新加载小章鱼'; octopusRetry.hidden = true;
  octopusNotice.append(octopusStatus, octopusRetry); surface.append(octopusNotice);
  const camera = new THREE.PerspectiveCamera(referenceFov, 16 / 9, .05, 240);
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: !coarse, powerPreference: 'high-performance' }); }
  catch (error) { lifetime.abort(); host.dataset.state = 'error';status.textContent = '三维画面暂时无法打开，请重试。';throw error; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.style.opacity = '0';
  renderer.setClearColor('#b8e1e9');renderer.domElement.setAttribute('aria-hidden', 'true');surface.append(renderer.domElement);
  const decoder = new DRACOLoader();decoder.setDecoderPath(ASSETS + 'draco/');decoder.setWorkerLimit(coarse ? 1 : 2);
  const loader = new GLTFLoader();loader.setDRACOLoader(decoder);
  const textureLoader = new THREE.TextureLoader();
  function texture(name: string, flipY: boolean, repeat = false): Promise<THREE.Texture> {
    return textureLoader.loadAsync(ASSETS + name).then(t => {
      if (disposed) { t.dispose();throw new DOMException('Scene closed', 'AbortError'); }
      t.colorSpace = THREE.SRGBColorSpace;t.flipY = flipY;t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      if (repeat) { t.wrapS = THREE.RepeatWrapping;t.wrapT = THREE.RepeatWrapping; }
      textureSet.add(t);return t;
    });
  }
  function fit(): void {
    const { width, height } = surface.getBoundingClientRect();
    if (!width || !height || disposed) return;
    const aspect = width / height;
    camera.aspect = aspect;
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(referenceFov) / 2) * (16 / 9));
    const vertical = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    camera.fov = THREE.MathUtils.clamp(Math.min(vertical, 86) * zoom, 19, 103);camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'fine' ? 1.65 : 1.25));
    renderer.setSize(width, height, false);wake();
  }
  const resize = new ResizeObserver(fit);resize.observe(surface);
  function renderFrame(now: number): void {
    raf = 0;if (disposed || !active || document.hidden) return;
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;last = now;time += dt;
    if (moving && asset) leaves.forEach(({ object, rotation, phase }) => {
      object.quaternion.copy(rotation).multiply(leafSway.setFromAxisAngle(localForward, Math.sin(time * .40 + phase) * .009));
    });
    // Turn around world up so the inclined reference camera never rolls sideways.
    lookYaw.setFromAxisAngle(worldUp, yaw);lookPitch.setFromAxisAngle(localRight, pitch);
    camera.position.copy(origin);camera.quaternion.copy(referenceRotation).premultiply(lookYaw).multiply(lookPitch);
    if(octopus){
      if(greeting>0){greeting=Math.max(0,greeting-dt);octopus.position.y=octopusBaseY+Math.sin((1-greeting/1.2)*Math.PI)*.08;}else octopus.position.y=octopusBaseY;
    }
    renderer.render(scene, camera);
    if(octopus&&shared){const p=new THREE.Vector3(0,1.75,0).applyMatrix4(octopus.matrixWorld).project(camera);shared.onAnchor({x:(p.x+1)/2*host.clientWidth,y:(1-p.y)/2*host.clientHeight,visible:Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1});}
    host.dataset.triangles = String(renderer.info.render.triangles);
    if ((moving && asset)||greeting>0) raf = requestAnimationFrame(renderFrame);
  }
  function wake(): void { if (!raf && !disposed && active && !document.hidden) raf = requestAnimationFrame(renderFrame); }
  function reset(): void { yaw = 0;pitch = 0;zoom = 1;fit(); }
  function pause():void{active=false;cancelAnimationFrame(raf);raf=0;for(const id of points.keys()){try{gestureSurface.releasePointerCapture(id);}catch{/* Already released. */}}points.clear();press=undefined;}
  function resume():void{if(disposed)return;active=true;last=0;fit();wake();}
  function greet():void{if(!octopus||disposed)return;greeting=reduced.matches?0:1.2;last=0;wake();}
  function dispose(): void {
    if (disposed) return;disposed = true;generation++;loading?.abort();lifetime.abort();resize.disconnect();
    signal?.removeEventListener('abort', dispose);cancelAnimationFrame(raf);
    if (octopus) { disposeOctopus(octopus); octopus = undefined; }
    const geometries = new Set<THREE.BufferGeometry>(), usedMaterials = new Set<THREE.Material>();
    scene.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry);(Array.isArray(o.material) ? o.material : [o.material]).forEach(m => usedMaterials.add(m)); } });
    geometries.forEach(g => g.dispose());usedMaterials.forEach(m => m.dispose());materials.forEach(m => m.dispose());textureSet.forEach(t => t.dispose());
    decoder.dispose();
    renderer.dispose();renderer.forceContextLoss();host.replaceChildren();host.classList.remove('ocean-viewport');
  }
  signal?.addEventListener('abort', dispose, { once: true });
  renderer.domElement.addEventListener('webglcontextlost', event => {
    if (disposed) return;event.preventDefault();cancelAnimationFrame(raf);raf = 0;host.dataset.state = 'error';status.textContent = '画面暂时中断，请返回后重试。';status.hidden = false;
  }, opt);
  document.addEventListener('visibilitychange', () => { cancelAnimationFrame(raf);raf = 0;last = 0;if (!document.hidden) wake(); }, opt);
  const points = new Map<number, { x: number; y: number }>();let pinch = 0, press:{x:number;y:number;id:number}|undefined;
  gestureSurface.addEventListener('pointerdown', event => {
    if (!active || event.button !== 0 || !isSceneBackground(event.target)) return;
    if(!shared)surface.focus({ preventScroll: true });try{gestureSurface.setPointerCapture(event.pointerId);}catch{/* Native capture may be unavailable. */}
    if(event.isPrimary)press={x:event.clientX,y:event.clientY,id:event.pointerId};
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });pinch = 0;
  }, opt);
  gestureSurface.addEventListener('pointermove', event => {
    if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>7)press=undefined;
    const before = points.get(event.pointerId);if (!before) return;
    const current = { x: event.clientX, y: event.clientY };points.set(event.pointerId, current);
    if (points.size > 1) {
      const [a, b] = [...points.values()];const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) { zoom = THREE.MathUtils.clamp(zoom * pinch / Math.max(distance, 1), .62, 1.25);fit(); }pinch = distance;
    } else {
      yaw -= (current.x - before.x) * .0035;pitch = THREE.MathUtils.clamp(pitch - (current.y - before.y) * .0024, -.48, .48);wake();
    }
  }, opt);
  const release = (event: PointerEvent) => {
    if(active&&event.type==='pointerup'&&press?.id===event.pointerId&&points.size===1&&octopus&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<=7){
      const rect=surface.getBoundingClientRect(),ray=new THREE.Raycaster();camera.updateMatrixWorld(true);octopus.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
      if(ray.intersectObject(octopus,true).length){greet();shared?.onActivate();}
    }
    if(press?.id===event.pointerId)press=undefined;points.delete(event.pointerId);pinch = 0;
  };
  gestureSurface.addEventListener('pointerup', release, opt);gestureSurface.addEventListener('pointercancel', release, opt);gestureSurface.addEventListener('lostpointercapture', release, opt);
  gestureSurface.addEventListener('wheel', event => { if(!active||!isSceneBackground(event.target))return;event.preventDefault();zoom = THREE.MathUtils.clamp(zoom * Math.exp(event.deltaY * .001), .62, 1.25);fit(); }, { ...opt, passive: false });
  gestureSurface.addEventListener('keydown', event => {
    if(!active||!isSceneBackground(event.target))return;
    if (event.key === 'Home') { event.preventDefault();reset();return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw += .10;if (event.key === 'ArrowRight') yaw -= .10;
    if (event.key === 'ArrowUp') pitch = Math.min(.48, pitch + .06);if (event.key === 'ArrowDown') pitch = Math.max(-.48, pitch - .06);
    if (event.key === '+' || event.key === '=') zoom = Math.max(.62, zoom - .08);if (event.key === '-') zoom = Math.min(1.25, zoom + .08);
    fit();
  }, opt);
  host.querySelector('[data-ocean="reset"]')!.addEventListener('click', reset, opt);
  motionButton.addEventListener('click', () => {
    moving = !moving;motionButton.setAttribute('aria-pressed', String(moving));
    if (!moving) leaves.forEach(({ object, rotation }) => object.quaternion.copy(rotation));wake();
  }, opt);
  reduced.addEventListener('change', () => { if (reduced.matches) { moving = false;motionButton.setAttribute('aria-pressed', 'false');leaves.forEach(({ object, rotation }) => object.quaternion.copy(rotation));wake(); } }, opt);
  motionButton.setAttribute('aria-pressed', String(moving));

  async function prepareOctopus(): Promise<void> {
    if (disposed || octopus || octopusLoading || !asset) return;
    octopusLoading = true; host.dataset.octopus = 'loading';
    shared?.onCharacterState?.('loading');
    octopusNotice.hidden = false; octopusRetry.hidden = true; octopusStatus.textContent = '正在请小章鱼过来…';
    const request = new AbortController();
    const cancel = () => request.abort(); lifetime.signal.addEventListener('abort', cancel, { once: true });
    const timeout = window.setTimeout(() => request.abort(), 60000);
    try {
      const sand: THREE.Object3D[] = [];
      asset.traverse(o => { if (o instanceof THREE.Mesh && o.userData.paintKind === 'sand') sand.push(o); });
      const ray = new THREE.Raycaster(new THREE.Vector3(OCTOPUS_LAYOUT.x, 8, OCTOPUS_LAYOUT.z), new THREE.Vector3(0, -1, 0));
      const groundY = ray.intersectObjects(sand, false)[0]?.point.y ?? 0;
      const created = await loadOceanOctopus(request.signal, groundY);
      if (disposed || request.signal.aborted) { disposeOctopus(created); return; }
      addOctopusShadow(created, groundY); octopus = created; octopusBaseY=created.position.y; scene.add(octopus);
      host.dataset.octopus = 'ready'; octopusNotice.hidden = true; shared?.onCharacterState?.('ready'); wake();
    } catch {
      if (!disposed) { host.dataset.octopus = 'error'; octopusStatus.textContent = '小章鱼暂时没能加载，请再试一次。'; octopusRetry.hidden = false; shared?.onCharacterState?.('error'); }
    } finally {
      clearTimeout(timeout); lifetime.signal.removeEventListener('abort', cancel); octopusLoading = false;
    }
  }
  octopusRetry.addEventListener('click', () => { void prepareOctopus(); }, opt);

  try {
    const [atlas, sand, foreground, distant] = await Promise.all([
      texture('pigment-atlas.png', true), texture('sand-wash.png', true, true), texture('foreground.png', false), texture('distant-reef.png', false, true)
    ]);
    signal?.throwIfAborted();
    function material(kind: string, sourceName = ''): THREE.ShaderMaterial {
      const palette = kind === 'leaf' ? kelpPaletteIndex(sourceName) : 0;
      const key = kind === 'leaf' ? `leaf:${palette}` : kind;
      if (materials.has(key)) return materials.get(key)!;
      const config = {
        stone: { code: 0, tile: [0, .5], wash: .13, flat: .58 }, coral: { code: 0, tile: [.5, .5], wash: .25, flat: .68 },
        leaf: { code: 5, tile: [.5, 0], wash: .015, flat: .88 }, sand: { code: 1, tile: [0, 0], wash: 0, flat: .78 },
        near: { code: 2, tile: [0, 0], wash: 0, flat: 1 }, far: { code: 3, tile: [0, 0], wash: 0, flat: 1 },
        lavender: { code: 4, tile: [0, 0], wash: 0, flat: .65 }, lavenderTip: { code: 4, tile: [0, 0], wash: 0, flat: .65 }, rose: { code: 4, tile: [0, 0], wash: 0, flat: .65 }
      }[kind] || { code: 0, tile: [0, .5], wash: .13, flat: .58 };
      const m = new THREE.ShaderMaterial({
        defines: { PAINT_KIND: config.code, ROCK_DETAIL: kind === 'stone' ? 1 : 0 }, vertexShader: OCEAN_VERTEX, fragmentShader: OCEAN_FRAGMENT, side: THREE.DoubleSide,
        transparent: kind === 'near' || kind === 'far', depthWrite: kind !== 'near' && kind !== 'far',
        uniforms: {
          atlas: { value: atlas }, sand: { value: sand }, artwork: { value: kind === 'near' ? foreground : distant },
          tile: { value: new THREE.Vector2(...config.tile as [number, number]) },
          pigmentTint: { value: new THREE.Color(kind === 'leaf' ? '#729b96' : '#f1e9d6') },
          foliageTint: { value: new THREE.Color(KELP_PALETTE[palette]) },
          solidColor: { value: new THREE.Color(kind === 'rose' ? '#d6adc8' : kind === 'lavenderTip' ? '#ddd0ec' : '#b1a5d3') },
          wash: { value: config.wash }, flatness: { value: config.flat }, detailStrength: { value: quality === 'fine' ? 1 : .65 }
        }
      });m.name = `Ocean painted ${key}`;materials.set(key, m);return m;
    }
    // A broad underlay prevents the accepted study's finite ground edge appearing behind the camera.
    const underlay = new THREE.PlaneGeometry(260, 260);underlay.rotateX(-Math.PI / 2);underlay.translate(0, -.20, 0);
    const pos = underlay.getAttribute('position'), p: number[] = [], n: number[] = [], c: number[] = [];
    for (let i = 0; i < pos.count; i++) { p.push(pos.getX(i), -pos.getZ(i), pos.getY(i));n.push(0, 0, 1);c.push(0, 0, 0); }
    underlay.setAttribute('_paintpos', new THREE.Float32BufferAttribute(p, 3));underlay.setAttribute('_paintnormal', new THREE.Float32BufferAttribute(n, 3));underlay.setAttribute('_paintcoord', new THREE.Float32BufferAttribute(c, 3));
    const seabed = new THREE.Mesh(underlay, material('sand'));seabed.name = 'Ocean extended seabed';scene.add(seabed);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 24), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, vertexShader: 'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 d;void main(){float h=clamp(normalize(d).y,0.,1.);gl_FragColor=vec4(mix(vec3(.48,.72,.80),vec3(.66,.85,.87),h),1.);\n#include <colorspace_fragment>\n}'
    }));sky.name = 'Continuous underwater light dome';sky.renderOrder = -20;scene.add(sky);
    // The curved cap shares the painted cylinder's exact rim, angle, texture row and wash.
    const overhead = new THREE.Mesh(createWaterCanopyGeometry(), new THREE.ShaderMaterial({
      side: THREE.DoubleSide, depthWrite: false,
      vertexShader: CANOPY_VERTEX, fragmentShader: CANOPY_FRAGMENT,
      uniforms: { water: { value: distant } }
    }));overhead.name = 'Continuous painted water canopy';overhead.renderOrder = -15;scene.add(overhead);

    async function load(next: Quality): Promise<void> {
      const ticket = ++generation;loading?.abort();loading = new AbortController();const request = loading;
      qualityButton.disabled = true;status.hidden = false;status.textContent = '正在准备珊瑚与礁石…';host.dataset.state = 'loading';
      let gltf: GLTF | undefined;
      try {
        const response = await fetch(`${ASSETS}ocean-open-front-${next}.glb`, { signal: request.signal });
        if (!response.ok) throw new Error(`海底模型载入失败（${response.status}）`);
        const bytes = await response.arrayBuffer();request.signal.throwIfAborted();
        gltf = await loader.parseAsync(bytes, new URL(ASSETS, location.href).href);
        if (disposed || ticket !== generation || request.signal.aborted) { discardGeometry(gltf.scene);return; }
        gltf.scene.traverse(o => {
          if (!(o instanceof THREE.Mesh)) return;
          const kind = String(o.userData.paintKind || 'stone');
          if (!o.geometry.getAttribute('_paintcoord') || !o.geometry.getAttribute('_paintnormal') || !o.geometry.getAttribute('_paintpos')) throw new Error('海底模型的水彩坐标不完整');
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());o.material = material(kind, String(o.userData.sourceName || o.name));
          if (kind === 'far') o.renderOrder = -10;if (kind === 'near') o.renderOrder = 5;
        });
        if (asset) { scene.remove(asset);
          // Shared paint materials belong to the viewport, only dispose old geometry here.
          const oldGeometry = new Set<THREE.BufferGeometry>();asset.traverse(o => { if (o instanceof THREE.Mesh) oldGeometry.add(o.geometry); });oldGeometry.forEach(g => g.dispose());
        }
        asset = gltf.scene;scene.add(asset);asset.updateMatrixWorld(true);
        const sourceCamera = gltf.cameras[0];
        if (!(sourceCamera instanceof THREE.PerspectiveCamera)) throw new Error('海底场景缺少参考视角');
        sourceCamera.getWorldPosition(origin);sourceCamera.getWorldQuaternion(referenceRotation);referenceFov = sourceCamera.fov;
        leaves.length = 0;asset.traverse(o => { if (o.name.startsWith('Curled')) leaves.push({ object: o, rotation: o.quaternion.clone(), phase: leaves.length * 1.7 }); });
        quality = next;materials.forEach(m => { m.uniforms.detailStrength.value = next === 'fine' ? 1 : .65; });
        host.dataset.quality = next;qualityButton.textContent = next === 'fine' ? '画质：精细' : '画质：流畅';
        fit();cancelAnimationFrame(raf);raf = 0;renderFrame(performance.now());renderer.domElement.style.opacity = '1';host.dataset.state = 'ready';status.hidden = true;host.querySelector<HTMLElement>('.ocean-poster')!.hidden = true;
      } catch (error) { if (!disposed && ticket === generation && !request.signal.aborted) { host.dataset.state = 'error';status.hidden = false;status.textContent = '海底暂时没能打开，可以重试。';throw error; } }
      finally { if (!disposed && ticket === generation) qualityButton.disabled = false; }
    }
    qualityButton.addEventListener('click', () => { void load(quality === 'fine' ? 'mobile' : 'fine').catch(() => { status.textContent = '画质切换暂时失败，请再试一次或返回聊天。'; }); }, opt);
    await load(quality);
    // Show the environment immediately. The larger character loads independently,
    // and a character error must never tear down an already usable ocean.
    signal?.throwIfAborted();
    void prepareOctopus();
    return { dispose, reset, pause, resume, greet };
  } catch (error) { if (!disposed) { dispose();host.dataset.state = 'error'; }throw error; }
}
