import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createRoomCamera } from './bedroomCamera';
import { bedroomAssets } from './bedroomAssets';
import { createBedroomMemories } from './bedroomMemories';
import { createMemoryProps } from './bedroomProps';
import { createBedroomPlant } from './bedroomPlant';
import './bedroom.css';
import { createCompanionChat } from './bedroomCompanionChat';
import { roomStorageSuffix } from './bedroomIdentity';
import { createBedroomBoard } from './bedroomBoard';
import { refineRoomMaterials } from './bedroomMaterials';
import { createCompanionMotion } from './bedroomMotion';
import { watchRoomViewport } from './bedroomViewport';
import { addSceneDog, type SceneDog } from './sceneDog';
import { createEmbeddedSceneBridge } from './embeddedSceneBridge';

type Weather = 'sun' | 'rain' | 'night';
type Bedding = 'clay' | 'sage' | 'linen';
type Action = 'lamp' | 'window' | 'journal' | 'bed' | 'nuo' | 'photos' | 'plant' | 'board';
interface RoomSettings { weather: Weather; lamp: boolean; bedding: Bedding }
const SETTINGS_KEY = 'nuo_bedroom_settings_v1'+roomStorageSuffix();
const paths: Record<string, string> = {
  back: '<path d="m14 6-6 6 6 6"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  lamp: '<path d="m8 3-4 10h16L16 3ZM12 13v7M8 21h8"/>',
  window: '<rect x="4" y="3" width="16" height="17" rx="2"/><path d="M12 3v17M4 12h16M2 21h20"/>',
  journal: '<path d="M5 3h13v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 3v18M10 8h5M10 12h5"/>',
  photos: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-5 4 6"/>',
  board: '<rect x="3" y="4" width="18" height="15" rx="3"/><path d="m8 8 3 1-1 6-4-1ZM14 8h4v6h-4M7 22l2-3m8 3-2-3"/>',
  plant: '<path d="M8 15h8l-1 6H9ZM12 15V7M12 11C5 12 4 8 5 5c5 0 7 2 7 6ZM12 8c0-5 3-6 7-5 1 4-2 7-7 5Z"/>',
  bed: '<path d="M3 18V8m18 10V8M3 14h18M5 14V5h14v9M3 18h18M7 10h3m4 0h3"/>',
  nuo: '<path d="M5 11 4 3l6 4h4l6-4-1 8a8 8 0 1 1-14 0Z"/><path d="M8 13h.01M16 13h.01M11 16h2M2 14l4 1m12 0 4-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  rain: '<path d="M6 15a5 5 0 1 1 1-10 6 6 0 0 1 11 3 3.5 3.5 0 0 1 0 7M8 17l-1 3m6-3-1 3m6-3-1 3"/>',
  night: '<path d="M20 14A8 8 0 0 1 10 4a8.5 8.5 0 1 0 10 10Z"/>',
  send: '<path d="m4 12 16-8-6 16-3-7-7-1ZM11 13l9-9"/>',
  sound: '<path d="M4 10h4l5-4v12l-5-4H4ZM16 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  paw: '<ellipse cx="12" cy="15.5" rx="5" ry="4"/><ellipse cx="5.5" cy="9" rx="2" ry="2.5"/><ellipse cx="10" cy="5.5" rx="2" ry="2.5"/><ellipse cx="15" cy="5.5" rx="2" ry="2.5"/><ellipse cx="19" cy="9" rx="2" ry="2.5"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.nuo}</svg>`;
function read(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
let opened = false;

/** Full viewport, portrait-first room. Blender objects carry action extras in the GLB. */
export function openBedroom(): void {
  if (opened) return;
  opened = true;
  const raw = read(SETTINGS_KEY) as Partial<RoomSettings> | null;
  const settings: RoomSettings = {
    weather: raw && ['sun','rain','night'].includes(raw.weather || '') ? raw.weather! : 'sun',
    bedding: raw && ['clay','sage','linen'].includes(raw.bedding || '') ? raw.bedding! : 'clay',
    lamp: typeof raw?.lamp === 'boolean' ? raw.lamp : true,
  };
  let alive = true;
  let renderer: THREE.WebGLRenderer | undefined;
  let controls: ReturnType<typeof createRoomCamera> | undefined;
  let model: THREE.Group | undefined;
  let companion: THREE.Group | undefined;
  let dog: SceneDog | undefined;
  const dogLifetime = new AbortController();
  let motion: ReturnType<typeof createCompanionMotion> | undefined;
  let tail: THREE.Object3D | undefined;
  let tailRotation = 0;
  let resizeObserver: ResizeObserver | undefined;
  let breathTimer: ReturnType<typeof setInterval> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let audio: AudioContext | undefined;
  let noise: AudioBufferSourceNode | undefined;
  let sound = false;
  let lastFocus: HTMLElement | null = null;
  const previousFocus = document.activeElement as HTMLElement | null;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const root = document.createElement('section');
  root.className = 'bedroom';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '我的卧室');
  root.innerHTML = `
    <div class="bedroom-stage" aria-label="可拖动查看的三维卧室"></div>
    <header class="bedroom-top"><button class="bedroom-back" aria-label="返回 AI 页面">${icon('back')}</button><div class="bedroom-heading"><small>NUO · MY LITTLE WORLD</small><h1>我的卧室</h1></div><div class="bedroom-status"><i></i><span>属于你的片刻</span></div></header>
    <div class="bedroom-welcome"><h2>欢迎回到自己的房间。</h2><span>左右拖动环顾 · 点击物件靠近</span><button class="bedroom-home-view" type="button">回到房间入口</button></div>
    <div class="bedroom-bottom"><div class="bedroom-whisper" aria-live="polite"><span>Nuo 在这里，陪你待一会儿。</span></div><div class="bedroom-quick-actions"><button type="button" data-action="nuo">${icon('nuo')}和 Nuo 聊聊</button><details class="bedroom-objects"><summary>${icon('journal')}房间物件</summary><nav class="bedroom-tools" aria-label="卧室互动">${(['lamp','window','photos','journal','plant','bed','nuo'] as Action[]).map((a,i) => `<button type="button" class="bedroom-tool" data-action="${a}" aria-label="${['开关台灯','天气与布置','照片墙','日记书架','照顾小绿植','休息一下','和 Nuo 聊聊'][i]}">${icon(a)}<span>${['台灯','窗外','照片墙','日记书','绿植','休息','Nuo'][i]}</span></button>`).join('')}</nav></details><button type="button" class="bedroom-hints" aria-label="显示物件提示" aria-pressed="false">${icon('photos')}<span>提示</span></button></div></div>
    <div class="bedroom-loading" role="status">${icon('nuo')}<p>正在为你打开房间…</p></div>
    <aside class="bedroom-panel" hidden aria-label="物件互动面板"><div class="bedroom-panel-handle"></div><div class="bedroom-panel-head"><h2></h2><button aria-label="收起面板">${icon('close')}</button></div><div class="bedroom-panel-body"></div></aside>
    <div class="bedroom-toast" role="status"></div>`;
  document.body.appendChild(root);
  const stopViewport = watchRoomViewport(root);
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const stage = q('.bedroom-stage');
  const panel = q('.bedroom-panel');
  const panelBody = q('.bedroom-panel-body');
  const loading = q('.bedroom-loading');
  const whisper = q('.bedroom-whisper span');
  const objectsMenu = q<HTMLDetailsElement>('.bedroom-objects');
  const hints = q<HTMLButtonElement>('.bedroom-hints');
  const greetButton = document.createElement('button');
  greetButton.type = 'button'; greetButton.className = 'bedroom-dog-greet'; greetButton.disabled = true;
  greetButton.setAttribute('aria-label', '和小狗聊天'); greetButton.title = '和小狗聊天';
  greetButton.innerHTML = `${icon('paw')}<span>和小狗聊聊</span>`;
  q('.bedroom-quick-actions').insertBefore(greetButton, hints);
  greetButton.onclick = () => {
    dog?.talk();
  };
  hints.onclick = () => {
    const enabled = root.dataset.hints !== 'true';
    root.dataset.hints = String(enabled);
    hints.setAttribute('aria-pressed', String(enabled));
    hints.setAttribute('aria-label', enabled ? '隐藏物件提示' : '显示物件提示');
  };
  const returnButton = q<HTMLButtonElement>('.bedroom-back');
  const homeView=q<HTMLButtonElement>('.bedroom-home-view');homeView.textContent='归位';homeView.setAttribute('aria-label','回到房间入口');q('.bedroom-top').append(homeView);
  returnButton.focus();
  const save = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { toast('浏览器存储空间不足，暂时无法保存。'); return false; }
  };
  function toast(text: string): void {
    q('.bedroom-toast').textContent = text;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { if (alive) q('.bedroom-toast').textContent = ''; }, 3500);
  }
  function disposeModel(group: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    group.traverse(o => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        geometries.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          materials.add(m); Object.values(m).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
        });
      }
      if (o instanceof THREE.Light && 'shadow' in o) (o as THREE.DirectionalLight).shadow?.dispose();
    });
    textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose());
  }
  function close(): void {
    if (!alive) return;
    alive = false; opened = false; sceneBridge.dispose(); chat.dispose(); clearInterval(breathTimer); clearTimeout(toastTimer);
    dogLifetime.abort(); dog?.dispose();
    stopViewport(); resizeObserver?.disconnect(); controls?.dispose(); motion?.dispose(); renderer?.setAnimationLoop(null); renderer?.dispose();
    memories.invalidate(); memoryProps.dispose(); plant.dispose(); board.dispose(); disposeModel(scene);
    noise?.stop(); void audio?.close(); root.remove();
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  returnButton.addEventListener('click', close);
  const scene = new THREE.Scene();
  // Complete the enclosing architecture for a viewpoint inside the room.
  const plaster=new THREE.MeshStandardMaterial({color:0xe8d7bd,roughness:.95});
  const ceilingMaterial=new THREE.MeshStandardMaterial({color:0xf4ecdc,roughness:1});
  function architecture(name:string,size:[number,number,number],position:[number,number,number],material:THREE.Material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.name=name;mesh.position.set(...position);mesh.receiveShadow=true;scene.add(mesh);}
  architecture('Interior right wall',[.16,3.05,4.6],[2.58,1.5,0],plaster);
  architecture('Interior entrance wall',[5.2,3.05,.16],[0,1.5,2.3],plaster);
  architecture('Interior ceiling',[5.2,.12,4.6],[0,3.02,0],ceilingMaterial);
  const doorMaterial=new THREE.MeshStandardMaterial({color:0xb5916b,roughness:.85});
  architecture('Bedroom entrance door',[.96,2.25,.035],[.65,1.12,2.205],doorMaterial);
  const trimMaterial=new THREE.MeshStandardMaterial({color:0xf1e7d3,roughness:.8});
  architecture('Right skirting',[.06,.16,4.4],[2.47,.13,0],trimMaterial);
  const fillLight=new THREE.PointLight(0xffedd7,1.4,6,2);fillLight.position.set(.3,2.6,.8);scene.add(fillLight);
  const memoryProps = createMemoryProps(scene);
  const memories = createBedroomMemories({body:panelBody,open:openPanel,notify:toast,changed:state=>memoryProps.update(state),talk:showChat,isAlive:()=>alive});
  void memories.ready().catch(error=>console.warn('Bedroom memories unavailable',error));
  const camera = new THREE.PerspectiveCamera(53, 1, .1, 100);
  let ambientActive = true;
  const sceneBridge = createEmbeddedSceneBridge({ camera, character:()=>dog?.root, height:.70,
    rotate:(dx,dy)=>controls?.turn(dx,dy),reset:()=>controls?.focus('dog'),greet:()=>{dog?.greet();},active:value=>{ambientActive=value;}
  });
  if(sceneBridge.embedded){root.dataset.ambient='true';window.addEventListener('pagehide',close,{once:true});}
  const ambient = new THREE.HemisphereLight(0xfff6e5, 0x9d8064, 2.7); scene.add(ambient);
  const sunlight = new THREE.DirectionalLight(0xffecd2, 3.2); sunlight.position.set(-2, 7, 5); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024,1024); sunlight.shadow.camera.left = -5; sunlight.shadow.camera.right = 5; sunlight.shadow.camera.top = 5; sunlight.shadow.camera.bottom = -5;
  sunlight.shadow.normalBias = .025; scene.add(sunlight);
  const lamp = new THREE.PointLight(0xffbd75, 5, 4, 2); lamp.position.set(-.04, 1.04, -.69); scene.add(lamp);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:0xd8c4a8,roughness:1}));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.015; ground.receiveShadow = true; scene.add(ground);
  const rainPositions = new Float32Array(90 * 3);
  for (let i=0;i<90;i++) { rainPositions[i*3] = -.03+Math.random()*1.35; rainPositions[i*3+1] = 1.35+Math.random()*1.20; rainPositions[i*3+2] = -2.08; }
  const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
  const rain = new THREE.Points(rainGeometry,new THREE.PointsMaterial({color:0xe7f5ff,size:.025,transparent:true,opacity:.8})); scene.add(rain);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plant=createBedroomPlant({scene,body:panelBody,open:()=>openPanel('plant','给小绿植一点水'),notify:toast,reducedMotion});
  const board=createBedroomBoard({scene,body:panelBody,open:()=>openPanel('board','右墙 · 回忆留言角'),notify:toast,alive:()=>alive});
  const boardButton=document.createElement('button');boardButton.className='bedroom-tool';boardButton.dataset.action='board';boardButton.setAttribute('aria-label','回忆留言墙');boardButton.innerHTML=icon('board')+'<span>回忆墙</span>';q('.bedroom-tools').insertBefore(boardButton,q('.bedroom-tool[data-action="nuo"]'));
  const chat=createCompanionChat(root,{closePanel,play:playCompanion,canAnimate:()=>!!motion&&!reducedMotion});
  function playCompanion(name: string): void {
    motion?.play(name);
  }
  const materialColors: Record<Bedding, number> = {clay:0xb37560,sage:0x8c9c83,linen:0xe1d4b9};
  const skyColors: Record<Weather, number> = {sun:0xa1c6ca,rain:0x718c9f,night:0x243653};
  const pins: { element: HTMLButtonElement; pos: THREE.Vector3 }[] = [];
  for (const [action,label,pos] of [
    ['lamp','一盏暖光',[-.04,1.4,-.69]],['journal','写下今天',[1.2,1.23,-1.06]],
    ['nuo','Nuo 在这里',[.14,.95,0]],['window','窗外的天气',[.65,2.85,-2.05]],
    ['board','回忆留言墙',[2.4,1.75,-.12]],
    ['photos','我的照片墙',[-1.3,2.5,-1.97]],['journal','日记书架',[.97,1.85,-1.48]],
  ] as [Action,string,[number,number,number]][]) {
    const element = document.createElement('button'); element.className = 'bedroom-pin'; element.dataset.action = action;
    element.innerHTML = `<i></i><span>${label}</span>`; element.hidden = true;
    stage.appendChild(element); pins.push({element,pos:new THREE.Vector3(...pos)});
  }
  function updateRoom(): void {
    const night = settings.weather === 'night';
    scene.background = new THREE.Color(night ? 0x45464b : settings.weather === 'rain' ? 0xb6bfbd : 0xeee1cb);
    scene.fog = new THREE.Fog(scene.background,15,45);
    ambient.intensity = night ? .85 : settings.weather === 'rain' ? 1.7 : 2.1;
    sunlight.intensity = night ? .25 : settings.weather === 'rain' ? 1 : 2.3;
    fillLight.intensity = night ? .45 : 1;
    lamp.intensity = settings.lamp ? (night ? 5 : 2.2) : 0;
    rain.visible = settings.weather === 'rain';
    model?.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      materials.forEach(m => {
        if (!(m instanceof THREE.MeshStandardMaterial)) return;
        if (m.name === 'Bedding') m.color.setHex(materialColors[settings.bedding]);
        if (m.name === 'WindowSky') { m.color.setHex(skyColors[settings.weather]); m.emissive.setHex(skyColors[settings.weather]); m.emissiveIntensity = night ? .15 : .3; }
        if (m.name === 'LampGlow') { m.emissiveIntensity = settings.lamp ? 1.2 : 0; m.color.setHex(settings.lamp ? 0xffdc9d : 0xd2b58a); }
      });
    });
    root.dataset.weather = settings.weather;
    q('.bedroom-status span').textContent = {sun:'午后的暖阳',rain:'窗外正在下雨',night:'晚安，慢慢来'}[settings.weather];
    q('.bedroom-status i').style.background = night ? '#9b9ab9' : settings.weather === 'rain' ? '#8ca2ad' : '#9ca47d';
    q('.bedroom-tool[data-action="lamp"]').dataset.active = String(settings.lamp);
    q('.bedroom-tool[data-action="lamp"]').setAttribute('aria-pressed',String(settings.lamp));
    q('.bedroom-pin[data-action="lamp"]').setAttribute('aria-pressed',String(settings.lamp));
    root.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.weather === settings.weather)));
    root.querySelectorAll<HTMLButtonElement>('[data-bedding]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.bedding === settings.bedding)));
  }
  function closePanel(): void {
    memories.invalidate(); board.invalidate(); clearInterval(breathTimer); breathTimer = undefined; panel.hidden = true; root.dataset.panel = 'false';
    if (lastFocus?.closest('.bedroom-objects') && !objectsMenu.open) objectsMenu.querySelector('summary')?.focus();
    else lastFocus?.focus();
  }
  q('.bedroom-panel-head button').addEventListener('click',closePanel);
  function openPanel(action: Action, title: string): void {
    chat.close(); board.invalidate(); memories.invalidate(); clearInterval(breathTimer); breathTimer = undefined; lastFocus = document.activeElement as HTMLElement;
    panel.dataset.kind = action; panel.hidden = false; root.dataset.panel = 'true'; q('.bedroom-panel-head h2').textContent = title; panelBody.replaceChildren();
    q<HTMLButtonElement>('.bedroom-panel-head button').focus();
  }
  function showWeather(): void {
    openPanel('window','让房间，像你喜欢的样子');
    panelBody.innerHTML = `<p>窗外什么天气，都由你决定。</p><label>窗外的时刻</label><div class="bedroom-options">${(['sun','rain','night'] as Weather[]).map((w,i)=>`<button class="bedroom-option" data-weather="${w}" aria-pressed="false">${icon(w)}${['晴日','雨天','夜晚'][i]}</button>`).join('')}</div><label>换一套床品</label><div class="bedroom-options">${(['clay','sage','linen'] as Bedding[]).map((b,i)=>`<button class="bedroom-option" data-bedding="${b}" aria-pressed="false"><i style="background:${['#b37560','#8c9c83','#e1d4b9'][i]}"></i>${['赤陶','鼠尾草','亚麻'][i]}</button>`).join('')}</div><button class="bedroom-secondary" data-sound aria-pressed="${sound}">${sound ? '关闭雨声' : '听听雨声'}</button><button class="bedroom-secondary" data-reset>回到最初的视角</button><p class="bedroom-small">房间偏好保存在这台设备上。</p>`;
    panelBody.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(b => b.onclick = () => { settings.weather = b.dataset.weather as Weather; updateRoom(); save(SETTINGS_KEY,settings); });
    panelBody.querySelectorAll<HTMLButtonElement>('[data-bedding]').forEach(b => b.onclick = () => { settings.bedding = b.dataset.bedding as Bedding; updateRoom(); save(SETTINGS_KEY,settings); });
    panelBody.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = resetCamera;
    panelBody.querySelector<HTMLButtonElement>('[data-sound]')!.onclick = async () => {
      try {
        if (sound) { noise?.stop(); noise = undefined; sound = false; }
        else {
          audio ??= new AudioContext(); await audio.resume(); if (!alive) return;
          const buffer = audio.createBuffer(1,audio.sampleRate*3,audio.sampleRate); const data = buffer.getChannelData(0);
          for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1)*.18;
          noise = audio.createBufferSource(); noise.buffer = buffer; noise.loop = true;
          const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1300;
          const gain = audio.createGain(); gain.gain.value = .25; noise.connect(filter).connect(gain).connect(audio.destination); noise.start(); sound = true;
        }
        const b = panelBody.querySelector<HTMLButtonElement>('[data-sound]'); if (b) { b.textContent = sound ? '关闭雨声' : '听听雨声'; b.setAttribute('aria-pressed',String(sound)); }
      } catch { toast('暂时无法播放声音，请检查浏览器声音权限。'); }
    };
    updateRoom();
  }
  function showRest(): void {
    openPanel('bed','现在，可以歇一会儿');
    panelBody.innerHTML = '<p>跟着圆圈，自然地呼吸。随时可以停下。</p><div class="bedroom-breath"><div class="bedroom-breath-orb">准备好了吗</div></div><button class="bedroom-primary" data-breathe>开始一分钟休息</button><p class="bedroom-small" data-count>轻轻吸气，慢慢呼气，不需要屏住呼吸。</p>';
    const btn = panelBody.querySelector<HTMLButtonElement>('[data-breathe]')!;
    btn.onclick = () => {
      const orb = panelBody.querySelector<HTMLElement>('.bedroom-breath-orb')!; const count = panelBody.querySelector('[data-count]')!;
      if (breathTimer) { clearInterval(breathTimer); breathTimer = undefined; orb.dataset.running = 'false'; orb.textContent = '按自己的节奏'; btn.textContent = '重新开始'; return; }
      let seconds = 0; orb.dataset.running = 'true'; orb.textContent = '轻轻吸气'; btn.textContent = '结束休息'; count.textContent = '还剩 60 秒';
      breathTimer = setInterval(() => { seconds++; if (seconds >= 60) { clearInterval(breathTimer); breathTimer = undefined; orb.dataset.running = 'false'; orb.textContent = '辛苦了'; count.textContent = '留一点安静给自己，也很好。'; btn.textContent = '再休息一会儿'; } else { orb.textContent = seconds % 8 < 4 ? '轻轻吸气' : '慢慢呼气'; count.textContent = `还剩 ${60-seconds} 秒`; } },1000);
    };
  }
  function showChat(prefill = ''): void { chat.open(prefill); }
  function interact(action: Action, notebookId?: string, photoSlot?: number,boardId?:string): void {
    objectsMenu.open = false;
    root.dataset.exploring='true';
    controls?.focus(action);
    if (action === 'lamp') { settings.lamp = !settings.lamp; updateRoom(); save(SETTINGS_KEY,settings); whisper.textContent = settings.lamp ? '留一盏暖光，给此刻的自己。' : '灯熄了，安静也可以陪着你。'; }
    if (action === 'window') showWeather();
    if (action === 'journal') { if(notebookId)memories.readBook(notebookId);else memories.library(); }
    if (action === 'photos') memories.photos(photoSlot);
    if (action === 'plant') plant.open();
    if (action === 'board') void board.open(boardId);
    if (action === 'bed') showRest();
    if (action === 'nuo') { playCompanion('Wave');showChat(); }
  }
  root.addEventListener('click',e => { const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (button) interact(button.dataset.action as Action); });
  root.addEventListener('keydown',e => {
    if (e.key === 'Escape') { e.preventDefault(); if (objectsMenu.open) objectsMenu.open = false; else if (chat.isOpen()) chat.close(); else if (!panel.hidden) closePanel(); else close(); }
    if (e.key === 'Tab') {
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('button,input,textarea,a[href]')).filter(el => !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  });
  function resetCamera(): void {
      controls?.reset();
  }
  q('.bedroom-home-view').onclick=()=>{root.dataset.exploring='false';chat.close();closePanel();controls?.reset(true);};
  updateRoom();
  async function init(): Promise<void> {
    try {
      renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.8)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      sunlight.shadow.radius = 3;
      sunlight.shadow.bias = -.00015;
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
      renderer.domElement.setAttribute('aria-label','卧室三维场景，可拖动查看；也可使用下方按钮操作物件');
      stage.prepend(renderer.domElement);
      controls = createRoomCamera(camera,renderer.domElement,reducedMotion);
      resetCamera();
      resizeObserver = new ResizeObserver(() => { if (!renderer) return; const w = stage.clientWidth,h = stage.clientHeight; camera.aspect = w / h; controls?.resize(); renderer.setSize(w,h,false); });
      resizeObserver.observe(stage);
      const gltf = await new GLTFLoader().loadAsync('/models/nuo-bedroom.glb');
      if (!alive) { disposeModel(gltf.scene); return; }
      model = gltf.scene;
      refineRoomMaterials(model);
      model.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; if (o.name.startsWith('Floating_room_foundation') || o.name.startsWith('Floating room foundation')) o.visible = false; } });
      scene.add(model); plant.attach(model); resetCamera();
      const placeholderParts: THREE.Object3D[] = [];
      model.traverse(o => { if (o.userData.action === 'nuo') placeholderParts.push(o); });
      companion = new THREE.Group(); companion.name = 'Bedroom companion'; companion.userData.action = 'nuo'; companion.position.set(.14,0,0); scene.add(companion);
      placeholderParts.forEach(o => companion!.attach(o));
      tail = placeholderParts.find(o => o.name.toLowerCase().includes('tail')); tailRotation = tail?.rotation.y || 0;
      if (sceneBridge.embedded) companion.visible = false;
      if (bedroomAssets.companionModelUrl && !sceneBridge.embedded) {
        try {
          const asset = await new GLTFLoader().loadAsync(bedroomAssets.companionModelUrl);
          if (!alive) { disposeModel(asset.scene); return; }
          const bounds = new THREE.Box3().setFromObject(asset.scene); const size = bounds.getSize(new THREE.Vector3());
          if (size.y > 0) {
            asset.scene.scale.setScalar(bedroomAssets.companionHeight/size.y);
            const fitted = new THREE.Box3().setFromObject(asset.scene), center = fitted.getCenter(new THREE.Vector3());
            asset.scene.position.set(-center.x,-fitted.min.y,-center.z);
            placeholderParts.forEach(o => o.visible = false); tail = undefined;
            asset.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
            companion.add(asset.scene);
            motion = createCompanionMotion(companion, asset.animations, reducedMotion);
          } else disposeModel(asset.scene);
        } catch (error) { console.warn('Companion model unavailable, keeping placeholder',error); }
      }
      try {
        dog = await addSceneDog(scene, { position: [.55, .026, -.75], height: .70, face: [.65, 1.88], signal: dogLifetime.signal, chat: sceneBridge.embedded ? undefined : { host: root, camera, viewport: renderer.domElement, onOpen() { chat.close(); closePanel(); objectsMenu.open = false; controls?.focus('dog'); } } });
        greetButton.disabled = false;
        stage.dataset.companionDog = 'ready';
      } catch (error) { if (alive) { console.warn('Bedroom dog unavailable', error); stage.dataset.companionDog = 'error'; } }
      if (!alive) return;
      updateRoom(); loading.remove();controls?.reset(true);
      if(sceneBridge.embedded){controls?.focus('dog');if(dog)sceneBridge.ready();else sceneBridge.error();}
      const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let startX = 0,startY = 0;
      renderer.domElement.addEventListener('pointerdown',e => { startX=e.clientX;startY=e.clientY; objectsMenu.open = false; });
      renderer.domElement.addEventListener('pointermove',e => { if (e.buttons && Math.hypot(e.clientX-startX,e.clientY-startY)>7) root.dataset.exploring='true'; });
      renderer.domElement.addEventListener('pointerup',e => {
        if (Math.hypot(e.clientX-startX,e.clientY-startY)>7 || !model) return;
        const rect = stage.getBoundingClientRect(); pointer.set(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
        raycaster.setFromCamera(pointer,camera); const hit = raycaster.intersectObjects([model,...(companion?[companion]:[]),...(dog?[dog.root]:[]),memoryProps.root,board.root],true).find(h=>h.object.visible);
        let obj = hit?.object; while(obj) { if (obj.userData.companion==='dog') { dog?.talk(); break; } if (obj.userData.action) { dog?.closeChat(); interact(obj.userData.action as Action,obj.userData.notebookId,obj.userData.photoSlot,obj.userData.boardId); break; } obj = obj.parent || undefined; }
      });
      let last: number | undefined; const projection = new THREE.Vector3();
      renderer.setAnimationLoop(now => {
        if (!alive || !ambientActive || document.hidden) { last = undefined; return; }
        const dt = last === undefined ? 0 : Math.min(Math.max((now-last)/1000, 0), .1);
        last = now; controls?.update(dt);
        dog?.update(dt);
        plant.tick(dt);
        if (!reducedMotion) {
          motion?.update(dt);
          if (!motion && companion) companion.scale.y = 1 + Math.sin(now*.0016)*.012;
          if (tail) tail.rotation.y = tailRotation + Math.sin(now*.0012)*.10;
        }
        if (rain.visible && !reducedMotion) { for (let i=0;i<90;i++) { rainPositions[i*3+1]-=dt*.7; if (rainPositions[i*3+1]<1.35) rainPositions[i*3+1]=2.55; } rainGeometry.attributes.position.needsUpdate=true; }
        chat.layout(camera,stage.clientWidth,stage.clientHeight);
        const occupied: { x:number;y:number }[] = [];
        pins.forEach(p => { projection.copy(p.pos).project(camera); const x=(projection.x*.5+.5)*stage.clientWidth,y=(-projection.y*.5+.5)*stage.clientHeight; const overlaps = occupied.some(point=>Math.abs(x-point.x)<115 && Math.abs(y-point.y)<42); p.element.hidden = root.dataset.hints!=='true' || projection.z>1 || projection.z< -1 || x<65 || x>stage.clientWidth-65 || y<180 || y>stage.clientHeight-140 || overlaps; if(!p.element.hidden)occupied.push({x,y}); p.element.style.left=`${x}px`;p.element.style.top=`${y}px`; });
        renderer!.render(scene,camera);sceneBridge.anchor();
      });
    } catch (err) {
      if (!alive) return;
      sceneBridge.error();console.error('Bedroom could not load',err);
      loading.innerHTML = `${icon('nuo')}<p>房间暂时没有打开</p><p class="bedroom-error-detail">请检查网络，或使用支持 WebGL 的浏览器重试。</p><button>返回再试</button>`;
      loading.querySelector('button')!.onclick = close;
    }
  }
  void init();
}
