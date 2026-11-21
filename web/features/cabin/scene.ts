import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { buildCabin, type CabinDevice, type EmotionSnapshot } from './geometry'
import { readChatMotion } from './motion'

export interface CabinSceneOptions {
  open(key: CabinDevice): void
  anchor(key: CabinDevice, x: number, y: number, visible: boolean): void
  speechAnchor?(x: number, y: number, visible: boolean): void
  status(state: 'loading' | 'ready' | 'unavailable' | 'recovering'): void
}

function readEmotion(): EmotionSnapshot {
  const mood = { 'report-happy': 4, 'report-calm': 3, 'report-tired': 2, 'report-anxious': 1.5, 'report-low': 1, 'report-sad': .5 }
  const levels = [...document.querySelectorAll('#report-calendar-grid [data-day]')].flatMap(cell => {
    const entry = Object.entries(mood).find(([name]) => cell.classList.contains(name))
    return entry ? [entry[1]] : []
  })
  return { days: document.getElementById('report-days-value')?.textContent || '0天', streak: document.getElementById('report-streak-value')?.textContent || '0天', levels }
}

function label(text: string, width: number, height: number, color = '#cff6ff'): THREE.Mesh {
  // Text is a texture on a modeled device; characters/props are never billboards.
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = Math.max(64, Math.round(1024 * height / width))
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = color; ctx.font = `500 ${Math.floor(canvas.height * .64)}px "Microsoft YaHei",sans-serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width * .97)
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide }); material.userData.ownedLabel = true
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
}

export function createCabinScene(host: HTMLElement, options: CabinSceneOptions) {
  options.status('loading')
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false })
  renderer.domElement.className = 'cabin-webgl'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = .88; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.info.autoReset = false
  renderer.transmissionResolutionScale = .5
  host.prepend(renderer.domElement)
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07172b)
  const camera = new THREE.PerspectiveCamera(52, 1, .1, 180)
  camera.position.set(.15, 3.45, 9.4)
  const target = new THREE.Vector3(0, 2.9, -1.8)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = new RoomEnvironment()
  let environmentMap = pmrem.fromScene(environment, .06)
  scene.environment = environmentMap.texture; scene.environmentIntensity = .35
  scene.add(new THREE.HemisphereLight(0xe2f5ff, 0x748899, .75))
  const sun = new THREE.DirectionalLight(0xfff1de, 2.1); sun.position.set(-3, 7, 5); sun.castShadow = true
  sun.shadow.mapSize.set(1536, 1536); Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -5, near: .5, far: 24 }); sun.shadow.bias = -.0003; sun.shadow.normalBias = .025; scene.add(sun)
  const windowLight = new THREE.DirectionalLight(0x9fdcff, .8); windowLight.position.set(3.5, 4, -3); scene.add(windowLight)
  const warmLight = new THREE.PointLight(0xffdfb5, 24, 12, 2); warmLight.position.set(-3.5, 5.5, 1); scene.add(warmLight)
  const projectionLight = new THREE.PointLight(0x71dfff, 7, 5, 2); projectionLight.position.set(.1, 2.2, -1.5); scene.add(projectionLight)
  const companionLight = new THREE.PointLight(0x94e7ff, 6, 5, 2); companionLight.position.set(3.05, 1.5, -.25); scene.add(companionLight)
  const cabin = buildCabin(label, readEmotion()); scene.add(cabin.root)

  // Subtle planar reflection under a translucent rough floor finish, plus real
  // shadow receivers. It is intentionally much weaker than a polished mirror.
  const reflector = new Reflector(new THREE.PlaneGeometry(11.8, 11.5), { color: 0x9cadb9, textureWidth: 512, textureHeight: 512, clipBias: .003 })
  reflector.name = 'floor-planar-reflection'; reflector.rotation.x = -Math.PI / 2; reflector.position.set(0, .012, 1.1); reflector.userData.ignorePick = true; scene.add(reflector)
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 11.5), new THREE.MeshStandardMaterial({ color: 0xd4dde4, roughness: .45, metalness: .12, transparent: true, opacity: .89, depthWrite: false }))
  finish.rotation.x = -Math.PI / 2; finish.position.set(0, .018, 1.1); finish.receiveShadow = true; finish.userData.ignorePick = true; scene.add(finish)

  // Three-dimensional starfield and a shaded spherical planet outside the port.
  const starPositions: number[] = []
  for (let i = 0; i < 1000; i++) {
    const a = Math.sin(i * 127.1 + 4) * 43758.5453, b = Math.sin(i * 311.7 + 8) * 96321.987
    starPositions.push(((a - Math.floor(a)) - .5) * 70, ((b - Math.floor(b)) - .24) * 48, -8 - (i % 53))
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xe0edff, size: .048, sizeAttenuation: true, transparent: true, opacity: .8, depthWrite: false })); scene.add(stars)
  const planetMaterial = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vNormal;varying vec3 p;void main(){vNormal=normalize(mat3(modelMatrix)*normal);p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vNormal;varying vec3 p;
      float terrain(vec3 v){return sin(v.x*2.8+sin(v.y*3.7))*sin(v.z*3.2+sin(v.x*1.9))*.5+sin(v.x*7.+v.z*4.1)*.16;}
      void main(){vec3 n=normalize(vNormal);vec3 q=normalize(p);float land=smoothstep(.13,.28,terrain(q*2.7));float cloud=smoothstep(.2,.55,terrain(q*5.+vec3(.2,1.,.4)));
      vec3 water=vec3(.025,.17,.32);vec3 continent=vec3(.24,.47,.53);vec3 col=mix(water,continent,land);col=mix(col,vec3(.82,.91,.98),cloud*.75);float lit=.48+.52*max(0.,dot(n,normalize(vec3(-.5,1.,1.))));gl_FragColor=vec4(col*lit,1.);}` })
  const planet = new THREE.Mesh(new THREE.SphereGeometry(21, 80, 64), planetMaterial); planet.position.set(5, -20, -30); scene.add(planet)
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(21.2, 64, 48), new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: 'varying vec3 n;varying vec3 v;void main(){vec4 w=modelMatrix*vec4(position,1.);n=normalize(mat3(modelMatrix)*normal);v=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'varying vec3 n;varying vec3 v;void main(){float rim=pow(1.-max(0.,dot(normalize(n),normalize(v))),5.);gl_FragColor=vec4(.16,.62,1.,rim*.55);}' })); atmosphere.position.copy(planet.position); scene.add(atmosphere)

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bokeh = new BokehPass(scene, camera, { focus: 11.0, aperture: .000016, maxblur: .0016 }); composer.addPass(bokeh)
  const bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), .18, .45, 2.2); composer.addPass(bloom)
  composer.addPass(new OutputPass())
  let disposed = false, lost = false, ready = false, frame = 0, t = 0, elapsed = 0, samples = 0
  let narrow = false, pan = 0, chatOpen = false, pending = false, assistantCount = 0, lastFrame = -1, balanced = false, slowWindows = 0
  let returnPan: number | null = null
  const pointer = new THREE.Vector2(), follow = new THREE.Vector2(), raycaster = new THREE.Raycaster()
  let hover: CabinDevice | null = null, pointerInside = false
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const pickable: THREE.Mesh[] = []
  cabin.root.traverse(o => { if (o instanceof THREE.Mesh && !o.userData.ignorePick) pickable.push(o) })
  function deviceAt(x: number, y: number): CabinDevice | null {
    const rect = host.getBoundingClientRect()
    raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera)
    const hit = raycaster.intersectObjects(pickable, false)[0]
    let object: THREE.Object3D | null = hit?.object || null
    while (object) { if (object.userData.device) return object.userData.device as CabinDevice; object = object.parent }
    return null
  }
  function setHover(key: CabinDevice | null) {
    if (key === hover) return
    hover = key; cabin.hover(key); host.style.cursor = key ? 'pointer' : 'default'
    host.dataset.hoveredDevice = key || ''
  }
  let down: { x: number; y: number; pan: number; id: number } | null = null
  const canvas = renderer.domElement
  function onMove(event: PointerEvent) {
    const rect = host.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1)
    pointerInside = true
    if (down && narrow && !chatOpen) pan = THREE.MathUtils.clamp(down.pan - (event.clientX - down.x) / rect.width * 3.4, -3.7, 3.6)
    else setHover(deviceAt(event.clientX, event.clientY))
  }
  function onDown(event: PointerEvent) { down = { x: event.clientX, y: event.clientY, pan, id: event.pointerId }; canvas.setPointerCapture(event.pointerId) }
  function onUp(event: PointerEvent) {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8) { const key = deviceAt(event.clientX, event.clientY); if (key) options.open(key) }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    down = null
  }
  function onCancel() { down = null; pointerInside = false; setHover(null) }
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp)
  canvas.addEventListener('pointercancel', onCancel); canvas.addEventListener('pointerleave', onCancel)

  function resize() {
    if (disposed) return
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight)
    const wasNarrow = narrow; narrow = w < 760
    if (wasNarrow !== narrow) { pan = narrow ? (chatOpen ? 2.25 : 1.7) : 0; if (chatOpen) returnPan = narrow ? 1.7 : 0 }
    const ratio = Math.min(devicePixelRatio || 1, narrow || balanced ? 1.0 : 1.4)
    renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); composer.setPixelRatio(ratio); composer.setSize(w, h)
    camera.aspect = w / h; camera.fov = narrow ? 55 : 52; camera.updateProjectionMatrix()
    bokeh.enabled = !narrow && !balanced
    sun.shadow.mapSize.set(narrow ? 1024 : 1536, narrow ? 1024 : 1536)
    host.dataset.layout = narrow ? 'panorama' : 'wide'
  }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize()
  function chatChanged() {
    const messages = document.getElementById('ai-messages')
    const next = readChatMotion([...messages?.querySelectorAll<HTMLElement>('.ai-message') || []].map(element => element.className), { pending, assistantCount })
    pending = next.pending; assistantCount = next.assistantCount
    cabin.activity(pending, chatOpen, t, next.responded)
    host.dataset.nuoState = cabin.motionState(t)
  }
  const chatObserver = new MutationObserver(chatChanged)
  const chatMessages = document.getElementById('ai-messages'); if (chatMessages) chatObserver.observe(chatMessages, { childList: true, subtree: true })
  chatChanged()
  const emotionObserver = new MutationObserver(() => cabin.updateEmotion(readEmotion()))
  const calendar = document.getElementById('report-calendar-grid'); if (calendar) emotionObserver.observe(calendar, { childList: true })
  const projected = new THREE.Vector3()
  function draw(timestamp: number) {
    if (disposed || lost || document.hidden) return
    // Cap background work; a visible chat panel leaves Nuo animated beside it.
    const interval = chatOpen || narrow ? 1000 / 30 : 1000 / 45
    if (lastFrame >= 0 && timestamp - lastFrame < interval - 1) return
    const rawDt = lastFrame < 0 ? 1 / 45 : (timestamp - lastFrame) / 1000
    const dt = Math.min(rawDt, .08); lastFrame = timestamp; t += dt
    follow.lerp(pointerInside && !chatOpen && !reducedMotion.matches ? pointer : new THREE.Vector2(), .035)
    const desiredX = (narrow ? pan : pan * .3) + follow.x * .11
    camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredX + .15, 3, dt)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 3.45 - follow.y * .07, 3, dt)
    target.x = THREE.MathUtils.damp(target.x, narrow ? pan : pan * .7, 3, dt)
    target.y = THREE.MathUtils.damp(target.y, narrow && chatOpen ? 3.35 : 2.9, 3, dt)
    camera.lookAt(target); camera.updateMatrixWorld()
    cabin.animate(t, dt, reducedMotion.matches)
    host.dataset.nuoState = cabin.motionState(t)
    if (!reducedMotion.matches) { stars.rotation.z = Math.sin(t * .009) * .016; stars.rotation.y = t * .0006; planet.rotation.y = t * .002; warmLight.intensity = 24 + Math.sin(t * .3) * .6 }
    Object.entries(cabin.anchors).forEach(([key, point]) => {
      projected.copy(point).project(camera)
      options.anchor(key as CabinDevice, (projected.x * .5 + .5) * host.clientWidth, (-projected.y * .5 + .5) * host.clientHeight, projected.z < 1 && Math.abs(projected.x) < .94 && Math.abs(projected.y) < .93)
    })
    if (chatOpen && options.speechAnchor) {
      cabin.faceAnchor(projected).project(camera)
      options.speechAnchor((projected.x * .5 + .5) * host.clientWidth, (-projected.y * .5 + .5) * host.clientHeight, projected.z < 1 && Math.abs(projected.x) < 1.1)
    }
    // Reflection/shadow refresh is limited along with the main render loop.
    renderer.info.reset(); composer.render(dt); frame++; elapsed += rawDt; samples++
    if (!ready) { ready = true; options.status('ready'); host.dataset.renderer = 'three-webgl2'; const summary = cabin.geometrySummary(); host.dataset.meshes = String(summary.meshes); host.dataset.vertices = String(summary.vertices) }
    if (elapsed >= 1) {
      const fps = samples / elapsed
      host.dataset.fps = String(Math.round(fps)); host.dataset.frames = String(frame); host.dataset.triangles = String(renderer.info.render.triangles)
      host.dataset.quality = narrow || balanced ? 'balanced' : 'high'
      slowWindows = fps < 28 ? slowWindows + 1 : 0
      if (slowWindows >= 3 && !balanced) { balanced = true; resize() }
      elapsed = 0; samples = 0
    }
  }
  renderer.setAnimationLoop(draw)
  function visibility() { lastFrame = -1; renderer.setAnimationLoop(document.hidden ? null : draw) }
  document.addEventListener('visibilitychange', visibility)
  function contextLost(event: Event) { event.preventDefault(); lost = true; renderer.setAnimationLoop(null); options.status('recovering') }
  function contextRestored() {
    if (disposed) return
    environmentMap.dispose(); environmentMap = pmrem.fromScene(environment, .06); scene.environment = environmentMap.texture
    resize(); lost = false; ready = false; lastFrame = -1; renderer.setAnimationLoop(draw)
  }
  canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored)
  function dispose() {
    if (disposed) return
    disposed = true; renderer.setAnimationLoop(null); resizeObserver.disconnect(); chatObserver.disconnect(); emotionObserver.disconnect()
    document.removeEventListener('visibilitychange', visibility)
    canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointerleave', onCancel); canvas.removeEventListener('pointercancel', onCancel)
    canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored)
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)) } })
    geometries.forEach(g => g.dispose()); materials.forEach(m => { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose() })
    environmentMap.dispose(); environment.dispose(); pmrem.dispose(); reflector.getRenderTarget().dispose(); bokeh.dispose(); bloom.dispose(); composer.dispose(); renderer.dispose(); canvas.remove()
  }
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose() })
  return {
    dispose,
    hover: setHover,
    setChatOpen(open: boolean) {
      if (open && !chatOpen) { returnPan = pan; if (narrow) pan = 2.25 }
      if (!open && chatOpen && returnPan !== null) { pan = returnPan; returnPan = null }
      chatOpen = open; chatChanged()
    },
    pan(direction: number) { pan = THREE.MathUtils.clamp(pan + direction * 2.6, -3.7, 3.6) }
  }
}
