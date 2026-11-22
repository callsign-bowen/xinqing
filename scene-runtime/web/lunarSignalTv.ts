/**
 * 月面观星：信号接收锅 + 电视机（模型由 tools/blender/signal_tv.py 在 Blender 里生成）。
 *
 * 小故事：场景打开时电视没有信号、满屏雪花；接收锅转动搜星，指示灯黄色闪烁。
 * 锁定信号后指示灯变绿，信号沿线缆流向电视，电视开始播放“地球频道”。
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ScreenProp } from './screenProps';

/** 摆放位置（场景坐标，米）。相机在 (-0.8, 1.65, 5.2) 朝 -Z 看，宇航员在 (-1.6, 0, -0.3)。 */
const DISH_AT = new THREE.Vector2(2.75, -2.2);
/** 找不到天上的地球时，锅口朝这个方向。 */
const FALLBACK_TARGET = new THREE.Vector3(45, 54, -190);
const TV_AT = new THREE.Vector2(0.55, 0.75);
const SEARCH_SECONDS = 5.5;
const LOCK_SECONDS = 0.9;
const BARS_SECONDS = 0.8;
const SCREEN_W = 192, SCREEN_H = 144;

export interface SignalTv {
  root: THREE.Group;
  /** 可点击观看的电视（对话演绎在它的屏幕上播放） */
  prop: ScreenProp;
  update(time: number): void;
  /** 关闭动态效果时：直接摆成“已收到信号、正在播放”的静态画面。 */
  settle(): void;
}

function groundHeight(ground: THREE.Object3D, x: number, z: number): number {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObject(ground, true)[0]?.point.y ?? 0;
}

function findEarth(ground: THREE.Object3D): THREE.Vector3 {
  let found: THREE.Object3D | undefined;
  ground.traverse(object => {
    if (found || !(object instanceof THREE.Mesh)) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    if (list.some(material => /earth/i.test(material.name))) found = object;
  });
  return found ? found.getWorldPosition(new THREE.Vector3()) : FALLBACK_TARGET.clone();
}

function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

export async function loadSignalTv(options: {
  ground: THREE.Object3D;
  signal: AbortSignal;
  collect(root: THREE.Object3D): void;
  maxAnisotropy: number;
  camera: THREE.Vector3;
}): Promise<SignalTv> {
  const response = await fetch('/models/lunar-signal-tv.glb', { signal: options.signal });
  if (!response.ok) throw new Error('信号接收锅和电视机模型加载失败。');
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), new URL('/models/', document.baseURI).href);
  options.signal.throwIfAborted();

  const root = new THREE.Group();
  root.name = 'Lunar signal and TV';
  const dish = gltf.scene.getObjectByName('SignalDish');
  const tv = gltf.scene.getObjectByName('SignalTV');
  const head = gltf.scene.getObjectByName('DishHead');
  const led = gltf.scene.getObjectByName('SignalLED');
  const power = gltf.scene.getObjectByName('TVPowerLight');
  const screen = gltf.scene.getObjectByName('TVScreen');
  if (!dish || !tv || !head || !(led instanceof THREE.Mesh) || !(power instanceof THREE.Mesh) || !(screen instanceof THREE.Mesh)) {
    throw new Error('信号接收锅和电视机模型缺少约定的部件。');
  }
  root.add(dish, tv);

  // 摆放：贴地，电视屏幕转向相机，锅口朝向场景深处的天空。
  dish.position.set(DISH_AT.x, groundHeight(options.ground, DISH_AT.x, DISH_AT.y), DISH_AT.y);
  // 锅口对准天上的地球（节目就是从地球传来的）：水平转向 + 调整仰角。
  const earth = findEarth(options.ground);
  const toEarth = earth.sub(dish.position);
  dish.rotation.y = Math.atan2(toEarth.x, toEarth.z);
  const elevation = Math.atan2(toEarth.y - 1.3, Math.hypot(toEarth.x, toEarth.z));
  const tilt = gltf.scene.getObjectByName('Dish_Tilt') ?? gltf.scene.getObjectByName('Dish Tilt');
  if (tilt) tilt.rotation.x = Math.PI / 2 - THREE.MathUtils.clamp(elevation, THREE.MathUtils.degToRad(12), THREE.MathUtils.degToRad(80));
  tv.position.set(TV_AT.x, groundHeight(options.ground, TV_AT.x, TV_AT.y), TV_AT.y);
  tv.rotation.y = Math.atan2(options.camera.x - TV_AT.x, options.camera.z - TV_AT.y);
  root.updateMatrixWorld(true);

  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true; object.receiveShadow = true;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = .35;
  });

  // 两盏指示灯原本共用一个材质，分开后各自变色。
  const ledMaterial = new THREE.MeshBasicMaterial({ color: '#ffb340', toneMapped: false });
  const powerMaterial = new THREE.MeshBasicMaterial({ color: '#ff4a3d', toneMapped: false });
  led.material = ledMaterial; power.material = powerMaterial;

  // 屏幕：画布纹理，运行时画雪花 / 彩条 / 节目。
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W; canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d')!;
  const screenTexture = new THREE.CanvasTexture(canvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.anisotropy = Math.min(4, options.maxAnisotropy);
  screenTexture.flipY = false;
  const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  screen.material = screenMaterial;
  const glow = new THREE.PointLight('#9fc7ff', 0, 2.6, 2);
  screen.getWorldPosition(glow.position);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(tv.getWorldQuaternion(new THREE.Quaternion()));
  glow.position.addScaledVector(forward, .35);
  root.add(glow);

  // 线缆：从锅的接口沿地面拖到电视背后。
  const dishPort = new THREE.Vector3(), tvPort = new THREE.Vector3();
  (gltf.scene.getObjectByName('CablePort') ?? dish).getWorldPosition(dishPort);
  (gltf.scene.getObjectByName('CablePortTV') ?? gltf.scene.getObjectByName('CablePort.TV') ?? tv).getWorldPosition(tvPort);
  const points = [dishPort.clone()];
  for (let i = 1; i <= 8; i++) {
    const p = dishPort.clone().lerp(tvPort, i / 9);
    p.x += Math.sin(i * 1.3) * .12;
    p.y = groundHeight(options.ground, p.x, p.z) + .025;
    points.push(p);
  }
  points.push(tvPort.clone());
  const cableCurve = new THREE.CatmullRomCurve3(points);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 80, .014, 8), new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: .6 }));
  cable.name = 'Signal cable'; cable.castShadow = true; cable.receiveShadow = true;
  root.add(cable);

  // 信号光点：锁定后沿线缆流向电视。
  const pulseMaterial = new THREE.MeshBasicMaterial({ color: '#7ff2ff', transparent: true, opacity: .9, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const pulseGeometry = new THREE.SphereGeometry(.035, 12, 8);
  const pulses = Array.from({ length: 4 }, () => {
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
    pulse.visible = false; root.add(pulse); return pulse;
  });

  options.collect(root);

  // ---------- 屏幕画面 ----------
  const noise = ctx.createImageData(SCREEN_W, SCREEN_H);
  function drawStatic(time: number) {
    const data = noise.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
    ctx.putImageData(noise, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(0, SCREEN_H / 2 - 16, SCREEN_W, 32);
    ctx.fillStyle = Math.floor(time * 2) % 2 ? '#ffffff' : '#ffd36b';
    ctx.font = 'bold 18px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('无信号 · 搜索中', SCREEN_W / 2, SCREEN_H / 2 + 1);
  }
  const BARS = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  function drawBars() {
    BARS.forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(i * SCREEN_W / BARS.length, 0, SCREEN_W / BARS.length + 1, SCREEN_H); });
    ctx.fillStyle = '#111'; ctx.fillRect(0, SCREEN_H * .72, SCREEN_W, SCREEN_H * .28);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('信号已接收', SCREEN_W / 2, SCREEN_H * .86);
  }
  const stars = Array.from({ length: 40 }, (_, i) => ({ x: (i * 73.7) % SCREEN_W, y: (i * 41.3) % (SCREEN_H * .8), p: i * .7 }));
  function drawProgram(time: number) {
    const sky = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
    sky.addColorStop(0, '#071330'); sky.addColorStop(1, '#13284f');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    for (const star of stars) {
      ctx.globalAlpha = .35 + .65 * Math.abs(Math.sin(time * 1.4 + star.p));
      ctx.fillStyle = '#fff'; ctx.fillRect(star.x, star.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
    // 自转的地球
    const cx = SCREEN_W / 2, cy = SCREEN_H * .46, r = SCREEN_H * .3;
    const halo = ctx.createRadialGradient(cx, cy, r * .9, cx, cy, r * 1.35);
    halo.addColorStop(0, 'rgba(120,190,255,.45)'); halo.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, r * 1.35, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#2f7fd6'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#4fae5c';
    const drift = (time * 14) % (r * 4);
    for (const [ox, oy, w, h] of [[0, -.3, .7, .35], [1.1, .2, .5, .45], [2.2, -.1, .8, .3], [3.1, .35, .45, .25]]) {
      for (const wrap of [0, r * 4]) {
        ctx.beginPath();
        ctx.ellipse(cx - r * 2 + ox * r + drift - wrap, cy + oy * r, w * r * .6, h * r * .6, .3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const shade = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    shade.addColorStop(0, 'rgba(0,0,20,0)'); shade.addColorStop(1, 'rgba(0,0,20,.55)');
    ctx.fillStyle = shade; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    // 台标与直播角标
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, SCREEN_H - 26, SCREEN_W, 26);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('地球频道', 10, SCREEN_H - 13);
    ctx.fillStyle = Math.floor(time * 1.5) % 2 ? '#ff4a3d' : '#7a2420';
    ctx.beginPath(); ctx.arc(SCREEN_W - 46, SCREEN_H - 13, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('直播', SCREEN_W - 38, SCREEN_H - 13);
    // CRT 扫描线
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let y = (time * 30) % 3; y < SCREEN_H; y += 3) ctx.fillRect(0, y, SCREEN_W, 1);
  }

  let start: number | undefined;
  let lastDraw = -Infinity;
  const baseYaw = head.rotation.y;

  let lastTime = 0;
  function apply(time: number, force = false) {
    start ??= time;
    lastTime = time;
    const t = time - start;
    const locked = t >= SEARCH_SECONDS;
    const lockedFor = t - SEARCH_SECONDS;

    // 锅头：搜星时左右扫，锁定后缓缓回正停住。
    if (!locked) head!.rotation.y = baseYaw + Math.sin(t * 1.9) * .55 * Math.min(1, t / .8);
    else {
      const from = baseYaw + Math.sin(SEARCH_SECONDS * 1.9) * .55;
      head!.rotation.y = THREE.MathUtils.lerp(from, baseYaw, easeInOut(lockedFor / LOCK_SECONDS));
    }
    ledMaterial.color.set(locked ? '#3dff7a' : Math.floor(t * 3) % 2 ? '#ffb340' : '#4a3210');

    const playing = locked && lockedFor > LOCK_SECONDS;
    powerMaterial.color.set(playing ? '#3dff7a' : '#ff4a3d');
    glow.intensity = playing ? 1.4 + Math.sin(time * 3.1) * .15 : locked ? .6 : .25;
    glow.color.set(playing ? '#9fc7ff' : '#dfe6ee');

    pulses.forEach((pulse, i) => {
      pulse.visible = locked;
      if (locked) pulse.position.copy(cableCurve.getPointAt((lockedFor * .45 + i / pulses.length) % 1));
    });

    // 画面 15 帧/秒就够了，省电。
    if (force || time - lastDraw >= 1 / 15) {
      lastDraw = time;
      if (!locked || lockedFor < LOCK_SECONDS) drawStatic(time);
      else if (lockedFor < LOCK_SECONDS + BARS_SECONDS) drawBars();
      else drawProgram(time);
      screenTexture.needsUpdate = true;
    }
  }

  drawStatic(0);
  screenTexture.needsUpdate = true;
  const prop: ScreenProp = {
    id: 'lunar-tv',
    label: '电视',
    hitTarget: tv,
    screen,
    frame: tv,
    setWatching(watching) {
      // 有信号才能播：还在搜星时被点开，就让接收锅立刻锁定。
      if (watching && start !== undefined && lastTime - start < SEARCH_SECONDS) start = lastTime - SEARCH_SECONDS;
    },
  };
  return {
    root,
    prop,
    update: time => apply(time),
    settle() {
      start = 0;
      apply(SEARCH_SECONDS + LOCK_SECONDS + BARS_SECONDS + 1, true);
      pulses.forEach(pulse => { pulse.visible = false; });
    },
  };
}
