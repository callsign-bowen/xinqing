import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export type CabinDevice = 'journal' | 'chat' | 'emotion' | 'profile'
export type EmotionSnapshot = { days: string; streak: string; levels: number[] }
export type LabelFactory = (text: string, width: number, height: number, color?: string) => THREE.Mesh

const CYAN = 0x61dfff

function roundedPath(x: number, y: number, w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(x + r, y); s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

export function buildCabin(label: LabelFactory, initial: EmotionSnapshot) {
  const root = new THREE.Group(); root.name = 'modeled-starship-interior'
  const devices = {} as Record<CabinDevice, THREE.Group>
  const white = new THREE.MeshPhysicalMaterial({ color: 0xe9eff3, roughness: .34, metalness: .18, clearcoat: .5 })
  const pearl = new THREE.MeshPhysicalMaterial({ color: 0xf7f5ef, roughness: .44, metalness: .08 })
  const silver = new THREE.MeshStandardMaterial({ color: 0x9caebc, roughness: .29, metalness: .68 })
  const seam = new THREE.MeshStandardMaterial({ color: 0x71899c, roughness: .6, metalness: .3 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x29465b, roughness: .5, metalness: .3 })
  const glow = new THREE.MeshStandardMaterial({ color: 0xaff4ff, emissive: CYAN, emissiveIntensity: 2.2, roughness: .2, metalness: .25 })
  const warm = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffcf91, emissiveIntensity: 2.4 })
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9cecff, roughness: .13, metalness: .06, transmission: .55, transparent: true, opacity: .45, thickness: .16, ior: 1.32, depthWrite: false, side: THREE.DoubleSide })
  const ink = new THREE.MeshBasicMaterial({ color: 0xb6f4ff, transparent: true, opacity: .8 })
  const glows: THREE.MeshStandardMaterial[] = [glow, warm]

  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, name = '') {
    const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); m.name = name
    m.castShadow = material === white || material === pearl || material === silver
    m.receiveShadow = m.castShadow; parent.add(m); return m
  }
  function box(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, radius = .08, name = '') {
    return mesh(parent, new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)), material, x, y, z, name)
  }
  function sphere(parent: THREE.Object3D, material: THREE.Material, position: number[], scale: number[], name = '') {
    const m = mesh(parent, new THREE.SphereGeometry(1, 32, 24), material, ...position as [number, number, number], name)
    m.scale.set(...scale as [number, number, number]); return m
  }
  function tube(parent: THREE.Object3D, points: number[][], radius: number, material: THREE.Material, name = '') {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number])))
    return mesh(parent, new THREE.TubeGeometry(curve, 40, radius, 6, false), material, 0, 0, 0, name)
  }
  function ring(parent: THREE.Object3D, radius: number, thickness: number, y: number, material = glow) {
    const m = mesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 80), material, 0, y, 0)
    m.rotation.x = Math.PI / 2; return m
  }
  function frame(parent: THREE.Object3D, w: number, h: number, radius: number, depth: number, material: THREE.Material, x = 0, y = 0, z = 0, border = .12) {
    const shape = roundedPath(-w / 2, -h / 2, w, h, radius)
    shape.holes.push(roundedPath(-w / 2 + border, -h / 2 + border, w - border * 2, h - border * 2, Math.max(.03, radius - border)))
    return mesh(parent, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, curveSegments: 16, steps: 1 }), material, x, y, z)
  }
  function text(parent: THREE.Object3D, value: string, w: number, h: number, x: number, y: number, z: number, color?: string) {
    const m = label(value, w, h, color); m.position.set(x, y, z); m.userData.ignorePick = true; parent.add(m); return m
  }
  function device(key: CabinDevice, position: number[]) {
    const g = new THREE.Group(); g.name = `device-${key}`; g.userData.device = key
    g.position.set(...position as [number, number, number]); devices[key] = g; root.add(g); return g
  }

  // Solid shell with actual openings, recessed bays, curved ribs and panel joints.
  const back = roundedPath(-6.1, -.1, 12.2, 6.6, .65)
  back.holes.push(roundedPath(-.85, 1.5, 6.55, 4.0, .7))
  back.holes.push(roundedPath(-4.12, 2.05, 2.57, 2.68, .28))
  mesh(root, new THREE.ExtrudeGeometry(back, { depth: .3, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 3, curveSegments: 20 }), white, 0, 0, -3.9, 'rear-wall-with-window-and-recess')
  frame(root, 6.85, 4.3, .85, .17, silver, 2.425, 3.5, -3.68, .2)
  frame(root, 6.5, 3.95, .65, .035, glow, 2.425, 3.5, -3.49, .025)
  const windowGlass = box(root, 6.15, 3.6, .035, new THREE.MeshPhysicalMaterial({ color: 0xc8edff, roughness: .03, metalness: .02, transmission: 1, transparent: true, opacity: .09, depthWrite: false }), 2.425, 3.5, -3.53)
  windowGlass.userData.ignorePick = true
  box(root, 12.3, .3, 12, white, 0, -.18, 1.1, .1, 'solid-floor')
  box(root, 12.3, .3, 12, pearl, 0, 6.5, 1.1, .1, 'ceiling')
  box(root, .3, 6.7, 12, white, -6.12, 3.2, 1.1, .1, 'left-wall')
  box(root, .3, 6.7, 12, white, 6.12, 3.2, 1.1, .1, 'right-wall')
  for (const z of [-3.2, .25, 3.8]) {
    frame(root, 12.0, 6.6, 1.05, .17, pearl, 0, 3.2, z, .17).name = 'rounded-structural-rib'
    for (const x of [-5.93, 5.93]) box(root, .025, 4.6, .055, seam, x, 2.9, z + .2, .005)
  }
  for (const x of [-4, -2, 0, 2, 4]) box(root, .014, .012, 10.8, seam, x, .001, 1.1, .002)
  for (const z of [-1.5, 1.5, 4.5]) box(root, 11.7, .012, .015, seam, 0, .002, z, .002)
  for (const x of [-5.85, 5.85]) box(root, .035, .045, 10.5, glow, x, .16, 1, .01)
  for (const z of [-1.9, 2.2]) for (const x of [-3.3, 3.3]) {
    box(root, 2.2, .12, .65, silver, x, 6.27, z, .035)
    box(root, 2.02, .055, .48, warm, x, 6.19, z, .02)
  }
  // Side wall pockets and small utility details add depth without noisy decoration.
  for (const x of [-5.91, 5.91]) {
    box(root, .1, 1.0, .65, silver, x, 2.7, .4, .03)
    for (let i = 0; i < 3; i++) box(root, .12, .18, .4, i === 0 ? glow : white, x + (x < 0 ? .04 : -.04), 2.45 + i * .25, .4, .03)
  }

  // Raised desk and its supports, controls and under-desk cove lighting.
  box(root, 10.4, .28, 1.65, white, -.1, 1.45, -2.2, .13, 'central-console')
  box(root, 9.7, .06, 1.35, silver, -.1, 1.62, -2.2, .025)
  box(root, 9.75, .035, .045, glow, -.1, 1.36, -1.36, .01)
  for (const x of [-4.65, 1.35, 4.65]) box(root, .3, 1.36, 1.1, white, x, .68, -2.3, .07)
  for (const x of [-.95, 1.05]) {
    box(root, .6, .04, .3, dark, x, 1.67, -1.75, .015)
    for (let i = 0; i < 3; i++) box(root, .1, .025, .15, i === 0 ? glow : silver, x - .15 + i * .16, 1.705, -1.75, .01)
  }

  // Foreground chair: padded seat/back, arms, stem and five castors.
  const chair = new THREE.Group(); chair.name = 'modeled-padded-chair'; chair.position.set(-2.8, 0, .95); chair.rotation.y = -.23; root.add(chair)
  const upholstery = new THREE.MeshStandardMaterial({ color: 0xa9b6c3, roughness: .86, metalness: .02 })
  mesh(chair, new THREE.CylinderGeometry(.09, .12, .8, 24), silver, 0, .5, 0)
  box(chair, 1.2, .27, 1.15, upholstery, 0, 1, 0, .13)
  const chairBack = box(chair, 1.18, 1.7, .26, upholstery, 0, 1.97, .47, .12)
  chairBack.rotation.x = -.13
  box(chair, .95, .5, .3, pearl, 0, 2.55, .52, .12)
  for (const x of [-.73, .73]) {
    box(chair, .12, .65, .17, silver, x, 1.18, .28, .045)
    box(chair, .25, .16, .9, pearl, x, 1.5, -.02, .07)
  }
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5
    const leg = box(chair, .1, .1, .72, silver, Math.sin(angle) * .31, .17, Math.cos(angle) * .31, .035)
    leg.rotation.y = angle
    sphere(chair, dark, [Math.sin(angle) * .65, .12, Math.cos(angle) * .65], [.1, .1, .1])
  }

  // Magnetic storage: the bay is behind the real wall opening.
  const storage = device('profile', [-2.84, 3.35, -3.56])
  box(storage, 2.57, 2.68, .48, dark, 0, 0, -.5, .16, 'recessed-storage-back')
  frame(storage, 2.7, 2.82, .32, .18, silver, 0, 0, -.1, .12)
  const storageModules: THREE.Group[] = []
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const module = new THREE.Group(); module.name = 'independent-magnetic-module'; module.position.set((col - .5) * 1.15, (.5 - row) * 1.2, 0); storage.add(module); storageModules.push(module)
    box(module, 1.02, 1.05, .32, white, 0, 0, -.15, .1)
    box(module, .84, .87, .055, glass, 0, 0, .055, .025)
    frame(module, .91, .94, .1, .022, glow, 0, 0, .08, .018)
    const symbol = mesh(module, row === 0 ? new THREE.IcosahedronGeometry(.18, 0) : new THREE.TorusGeometry(.17, .027, 8, 24), glow, 0, .06, .13)
    symbol.rotation.z = col ? .3 : -.2
    box(module, .22, .035, .04, silver, 0, -.31, .12, .01)
  }
  const lid = new THREE.Group(); lid.name = 'hinged-storage-lid'; lid.position.set(0, 1.44, -.05); storage.add(lid)
  box(lid, 2.6, .76, .12, white, 0, .39, 0, .05)
  frame(lid, 2.35, .54, .08, .02, silver, 0, .39, .07, .03)
  lid.rotation.x = -.18

  // Pedestal is a turned solid model, not a textured plane.
  const companion = device('chat', [3.05, 0, -.25])
  const baseProfile = [[0, 0], [1.0, 0], [1.15, .15], [1.2, .35], [1.16, .9], [1.02, 1.16], [0, 1.16]]
  mesh(companion, new THREE.LatheGeometry(baseProfile.map(p => new THREE.Vector2(p[0], p[1])), 80), white, 0, 0, 0, 'nuo-solid-pedestal')
  ring(companion, 1.05, .04, .18, silver); ring(companion, .99, .025, 1.18)
  mesh(companion, new THREE.CylinderGeometry(.9, .93, .06, 80), glass, 0, 1.18, 0)
  ring(companion, .8, .018, 1.23); ring(companion, 1.12, .013, .4)
  box(companion, .45, .12, .06, dark, 0, .63, 1.12, .03)
  box(companion, .22, .035, .075, glow, 0, .63, 1.155, .01)
  const nuo = new THREE.Group(); nuo.name = 'nuo-volumetric-character'; nuo.position.y = 2.05; companion.add(nuo)
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xd4f3ff, roughness: .2, metalness: .04, clearcoat: 1, clearcoatRoughness: .2, transmission: .12, thickness: .65, ior: 1.35, emissive: 0x52caff, emissiveIntensity: .12 })
  const body = sphere(nuo, skin, [0, .08, 0], [.5, .66, .36], 'nuo-rounded-body')
  const head = new THREE.Group(); head.name = 'nuo-head-rig'; head.position.y = 1.05; nuo.add(head)
  const headCurve = new THREE.SplineCurve([[0,-.64],[.4,-.6],[.73,-.43],[.88,-.05],[.83,.35],[.6,.62],[.23,.79],[.08,.91],[0,.98]].map(p => new THREE.Vector2(p[0], p[1])))
  const headPoints = headCurve.getPoints(60).map(p => new THREE.Vector2(Math.max(0, p.x), p.y))
  const headMesh = mesh(head, new THREE.LatheGeometry(headPoints, 80), skin, 0, 0, 0, 'nuo-sculpted-head')
  headMesh.castShadow = true; body.castShadow = true
  const eyes: THREE.Mesh[] = []
  const eyeInk = new THREE.MeshPhysicalMaterial({ color: 0x122b42, roughness: .12, clearcoat: 1 })
  const whiteEye = new THREE.MeshBasicMaterial({ color: 0xffffff })
  for (const sign of [-1, 1]) {
    const eye = sphere(head, eyeInk, [sign * .31, .03, .785], [.125, .18, .075], 'nuo-blinking-eye')
    sphere(eye, whiteEye, [-.24, .36, .84], [.25, .22, .2]); eyes.push(eye)
    sphere(head, new THREE.MeshStandardMaterial({ color: 0xf8b9cf, roughness: .6 }), [sign * .55, -.19, .65], [.145, .065, .04], 'nuo-pink-cheek')
    sphere(nuo, skin, [sign * .25, -.51, .04], [.19, .29, .24], 'nuo-foot')
  }
  tube(head, [[-.12,-.17,.835],[-.07,-.23,.855],[0,-.25,.86],[.08,-.22,.855],[.13,-.16,.835]], .02, eyeInk, 'nuo-smile')
  const arms: THREE.Group[] = []
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sign * .43, .36, 0); arm.rotation.z = sign * .9; nuo.add(arm); arms.push(arm)
    const armMesh = mesh(arm, new THREE.CapsuleGeometry(.13, .35, 6, 16), skin, 0, -.22, .015, 'nuo-arm'); armMesh.castShadow = true
  }
  // Fresnel + scan-line surface shell follows the 3D head's actual normals.
  const aura = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 }, color: { value: new THREE.Color(CYAN) } },
    vertexShader: 'varying vec3 n; varying vec3 v; varying vec3 p; void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;n=normalize(mat3(modelMatrix)*normal);v=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'uniform float time;uniform vec3 color;varying vec3 n;varying vec3 v;varying vec3 p;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.7);float line=pow(.5+.5*sin(p.y*170.-time*1.4),18.)*.045;gl_FragColor=vec4(color,rim*.36+line);}' })
  const headAura = mesh(head, headMesh.geometry, aura); headAura.scale.setScalar(1.008); headAura.userData.ignorePick = true
  const orbit = new THREE.Group(); orbit.position.set(0, 4.36, .08); companion.add(orbit)
  for (let i = 0; i < 3; i++) sphere(orbit, glow, [(i - 1) * .16, 0, 0], [.035, .035, .035], 'nuo-thinking-orbit')

  // Central holographic book: spine, covers, stacked leaves and hinged page.
  const journal = device('journal', [.05, 1.69, -1.95])
  mesh(journal, new THREE.CylinderGeometry(.95, 1.1, .12, 64), silver, 0, 0, 0, 'journal-projector-base')
  ring(journal, .84, .025, .08); ring(journal, .66, .015, .11)
  const book = new THREE.Group(); book.name = 'holographic-book-rig'; book.position.set(0, 1.0, .12); book.rotation.x = -.12; journal.add(book)
  const pageMaterial = glass.clone(); pageMaterial.color.setHex(0x328bac); pageMaterial.opacity = .55; pageMaterial.transmission = .18; pageMaterial.emissive.setHex(0x164b72); pageMaterial.emissiveIntensity = .1
  const innerPageMaterial = pageMaterial.clone(); innerPageMaterial.opacity = .16; innerPageMaterial.transmission = .1
  const bookPages: THREE.Group[] = []
  for (const sign of [-1, 1]) {
    const half = new THREE.Group(); half.name = 'book-open-leaf-stack'; half.rotation.y = sign * -.4; book.add(half); bookPages.push(half)
    box(half, .99, 1.5, .09, glass, sign * .51, 0, -.09, .04, 'book-thick-cover')
    for (let layer = 0; layer < 5; layer++) box(half, .94 - layer * .006, 1.44 - layer * .009, .016, layer === 4 ? pageMaterial : innerPageMaterial, sign * .5, 0, -.045 + layer * .023, .005, 'book-page-layer')
    frame(half, .94, 1.44, .04, .012, glow, sign * .5, 0, .062, .012)
    for (let row = 0; row < 8; row++) box(half, row === 0 ? .55 : .63 - (row % 3) * .06, .012, .008, ink, sign * .5, .48 - row * .13, .09, .003)
    text(half, sign < 0 ? '此刻的心情' : '留给自己的话', .65, .16, sign * .5, .62, .1)
  }
  const spine = mesh(book, new THREE.CylinderGeometry(.045, .045, 1.53, 20), glow, 0, 0, -.035, 'book-three-dimensional-spine')
  spine.rotation.z = .015
  const turningPage = new THREE.Group(); turningPage.name = 'book-turning-page'; book.add(turningPage)
  box(turningPage, .9, 1.4, .018, pageMaterial, .46, 0, .075, .006)
  // Light shaft geometry has radial falloff and vertically fades to transparency.
  const beamMaterial = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform float time;void main(){float a=pow(sin(vUv.x*3.14159),2.)*.07*(1.-vUv.y)*(.85+.15*sin(time));gl_FragColor=vec4(.32,.85,1.,a);}' })
  const beam = mesh(journal, new THREE.CylinderGeometry(.9, .35, 1.9, 48, 1, true), beamMaterial, 0, 1.02, 0); beam.userData.ignorePick = true
  const companionBeam = mesh(companion, new THREE.CylinderGeometry(.92, .7, 2.9, 48, 1, true), beamMaterial, 0, 2.6, 0); companionBeam.userData.ignorePick = true

  // Multilayer floating emotion glass, true 3D chart tubes, raised calendar cells.
  const emotion = device('emotion', [-4.48, 3.35, -1.45]); emotion.rotation.y = .32
  const panelGlass = glass.clone(); panelGlass.color.setHex(0x205375); panelGlass.opacity = .5; panelGlass.transmission = .12; panelGlass.emissive.setHex(0x12344d); panelGlass.emissiveIntensity = .15
  for (let i = 0; i < 2; i++) box(emotion, 2.22, 3.04, .055, panelGlass, i * -.05, i * .04, -.11 - i * .11, .02, 'emotion-glass-layer')
  frame(emotion, 2.28, 3.12, .2, .035, glow, 0, 0, -.04, .024)
  text(emotion, '心 情 轨 迹', 1.55, .22, 0, 1.25, .045)
  text(emotion, 'NUO  /  EMOTION OBSERVATORY', 1.85, .1, 0, 1.02, .05)
  const metrics = new THREE.Group(); metrics.position.set(0, .73, .06); emotion.add(metrics)
  const chart = new THREE.Group(); chart.position.set(0, -.87, .09); emotion.add(chart)
  const calendar = new THREE.InstancedMesh(new RoundedBoxGeometry(.15, .12, .028, 2, .008), ink, 28)
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < 28; i++) { matrix.makeTranslation((i % 7 - 3) * .265, .25 - Math.floor(i / 7) * .23, .07); calendar.setMatrixAt(i, matrix) }
  emotion.add(calendar)
  for (const y of [-.4, -.7, -1.0, -1.3]) box(emotion, 1.8, .005, .006, ink, 0, y, .04, .001)
  const chartFlow = sphere(chart, glow, [0, 0, .03], [.035, .035, .035])
  let graphCurve: THREE.CatmullRomCurve3
  function disposeSubtree(group: THREE.Group) {
    group.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(mat => { if (mat.userData.ownedLabel) { (mat as THREE.MeshBasicMaterial).map?.dispose(); mat.dispose() } }) } })
    group.clear()
  }
  function updateEmotion(snapshot: EmotionSnapshot) {
    disposeSubtree(metrics)
    text(metrics, `${snapshot.days}记录   ·   ${snapshot.streak}连续`, 1.8, .2, 0, 0, 0)
    const oldLine = chart.getObjectByName('emotion-chart-curve')
    if (oldLine instanceof THREE.Mesh) { oldLine.geometry.dispose(); chart.remove(oldLine) }
    const levels = snapshot.levels.length > 1 ? snapshot.levels.slice(-12) : [2.1, 2.3, 2.15, 2.4, 2.35, 2.6, 2.5]
    graphCurve = new THREE.CatmullRomCurve3(levels.map((level, i) => new THREE.Vector3(-.86 + i / (levels.length - 1) * 1.72, (level - 2.5) * .15, .03)))
    mesh(chart, new THREE.TubeGeometry(graphCurve, 70, .014, 6, false), glow, 0, 0, 0, 'emotion-chart-curve')
    const oldCaption = emotion.getObjectByName('chart-caption'); if (oldCaption) { emotion.remove(oldCaption); disposeSubtree(new THREE.Group().add(oldCaption)) }
    text(emotion, snapshot.levels.length > 1 ? '最近记录 · 心情轨迹' : '尚无连续记录 · 光谱示意', 1.8, .12, 0, -1.36, .05).name = 'chart-caption'
  }
  updateEmotion(initial)

  // Small airborne projection motes, actual points in 3D world space.
  const particles = new THREE.BufferGeometry(), particlePositions = new Float32Array(90 * 3)
  for (let i = 0; i < 90; i++) {
    const a = i * 2.39996, radius = .2 + (i % 11) * .085
    particlePositions[i * 3] = Math.cos(a) * radius + (i % 2 ? .05 : 3.05)
    particlePositions[i * 3 + 1] = 1.8 + (i % 19) / 19 * 2.5
    particlePositions[i * 3 + 2] = Math.sin(a) * radius - (i % 2 ? 1.95 : .25)
  }
  particles.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
  const motes = new THREE.Points(particles, new THREE.PointsMaterial({ color: 0xa7f1ff, size: .022, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false })); motes.name = 'projection-particles'; root.add(motes)

  const anchors: Record<CabinDevice, THREE.Vector3> = {
    emotion: new THREE.Vector3(-4.45, 1.55, -1.0), profile: new THREE.Vector3(-2.8, 1.87, -3.1),
    journal: new THREE.Vector3(.05, 1.62, -.8), chat: new THREE.Vector3(3.05, .78, .95)
  }
  let hovered: CabinDevice | null = null, reactionUntil = -1, thinking = false, chatting = false
  const basePositions = new Map(Object.values(devices).map(g => [g, g.position.clone()]))
  function animate(t: number, dt: number, reduced: boolean) {
    const time = reduced ? 0 : t
    glows[0].emissiveIntensity = 2.0 + Math.sin(time * .85) * .18
    glows[1].emissiveIntensity = 2.3 + Math.sin(time * .28) * .1
    book.position.y = 1.0 + Math.sin(time * .9) * .045
    book.rotation.z = Math.sin(time * .47) * .012
    const pagePhase = time % 17
    turningPage.rotation.y = pagePhase > 13 ? -Math.PI * Math.sin((pagePhase - 13) / 4 * Math.PI) : 0
    turningPage.visible = pagePhase > 13 && !reduced
    nuo.position.y = 2.05 + Math.sin(time * 1.2) * .065
    nuo.rotation.z = Math.sin(time * .65) * .018
    nuo.scale.setScalar(THREE.MathUtils.damp(nuo.scale.x, hovered === 'chat' ? 1.035 : 1, 5, dt))
    body.scale.y = .66 * (1 + Math.sin(time * 1.6) * .018)
    head.rotation.z = chatting ? -.035 + Math.sin(time * .8) * .018 : Math.sin(time * .7) * .012
    const blink = time % 5.3; const blinkScale = blink > 5.08 ? Math.max(.07, Math.abs((blink - 5.19) / .11)) : 1
    eyes.forEach(eye => { eye.scale.y = .18 * blinkScale })
    const replying = time < reactionUntil
    arms[0].rotation.z = -.85 + Math.sin(time * (replying ? 5 : 1.1)) * (replying ? .32 : .045)
    arms[1].rotation.z = .85 + Math.sin(time * (thinking ? 2.2 : 1.0)) * (thinking ? .13 : .04)
    orbit.visible = thinking; orbit.rotation.y = time * 1.4
    orbit.children.forEach((child, i) => { child.position.y = Math.sin(time * 3 + i) * .05 })
    aura.uniforms.time.value = time; beamMaterial.uniforms.time.value = time
    chartFlow.position.copy(graphCurve.getPoint((time * .12) % 1))
    motes.position.y = Math.sin(time * .3) * .1
    lid.rotation.x = THREE.MathUtils.damp(lid.rotation.x, hovered === 'profile' ? -.65 : -.18, 5, dt)
    storageModules.forEach((module, i) => { module.position.z = THREE.MathUtils.damp(module.position.z, hovered === 'profile' ? .09 + i * .015 : 0, 5, dt) })
    Object.entries(devices).forEach(([key, group]) => {
      const base = basePositions.get(group)!
      group.position.y = THREE.MathUtils.damp(group.position.y, base.y + (hovered === key && key !== 'chat' ? .04 : 0), 6, dt)
    })
  }
  return { root, devices, anchors, updateEmotion, animate,
    faceAnchor(target: THREE.Vector3) { return head.localToWorld(target.set(0, .1, .85)) },
    hover(key: CabinDevice | null) { hovered = key },
    activity(pending: boolean, open: boolean, t: number, responded = false) { thinking = pending; chatting = open; if (responded) reactionUntil = t + 2.5 },
    motionState(t: number) { return thinking ? 'thinking' : t < reactionUntil ? 'responding' : chatting ? 'listening' : 'idle' },
    geometrySummary() { let meshes = 0, vertices = 0; root.traverse(o => { if (o instanceof THREE.Mesh) { meshes++; vertices += o.geometry.getAttribute('position')?.count || 0 } }); return { meshes, vertices } }
  }
}
