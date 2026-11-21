import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createCampEnvironment, CAMP_PALETTE } from './environment360.js';
import { createCameraSafety } from './cameraSafety.js';
import { createExpandedMeadow } from './meadowExtension.js';
import { addSceneDog } from '../../web/sceneDog.ts';
import { createEmbeddedSceneBridge } from '../../web/embeddedSceneBridge.ts';

const stage=document.querySelector('#stage');
const status=document.querySelector('#status');
const fallback=document.querySelector('#fallback');
const motionButton=document.querySelector('#motion');
const backgroundButton=document.querySelector('#background');
const wireButton=document.querySelector('#wireframe');
const qualityButton=document.querySelector('#quality');
const preference=matchMedia('(prefers-reduced-motion: reduce)');
const listeners=new AbortController();
const time={value:0};
const scene=new THREE.Scene();scene.background=new THREE.Color(CAMP_PALETTE.sky);scene.fog=new THREE.Fog(CAMP_PALETTE.haze,43,100);
const camera=new THREE.PerspectiveCamera(32.27,16/9,.10,700);
const states={
  main:{position:[0,3.4,24],target:[-.6,1.15,-4],fov:32.27},
  side:{position:[-28,3.4,-4],target:[-.6,1.15,-4],fov:32.27},
  tent:{position:[2,3.8,10],target:[8.8,1.8,-4],fov:28},
  fire:{position:[3.1,1.9,5.3],target:[.15,.55,.6],fov:24},
  rear:{position:[-.6,3.4,-32],target:[-.6,1.15,-4],fov:32.27},
  right:{position:[27,3.4,-4],target:[-.6,1.15,-4],fov:32.27},
  dog:{position:[4.3,2.4,7.6],target:[2.6,1.0,1.8],fov:32.27},
};
let renderer,controls,model,resizeObserver,safety,frameId=null;
let dog=null;
let ambientActive=true;
const sceneBridge=createEmbeddedSceneBridge({camera,character:()=>dog?.root,height:1.9,
  rotate(dx,dy){if(!controls)return;const offset=camera.position.clone().sub(controls.target),sphere=new THREE.Spherical().setFromVector3(offset);sphere.theta-=dx*Math.PI;sphere.phi=THREE.MathUtils.clamp(sphere.phi-dy*Math.PI*.8,.3,Math.PI/2-.055);camera.position.copy(controls.target).add(offset.setFromSpherical(sphere));controls.update();request();},
  reset(){view('companion');},greet(){dog?.greet();request();},active(value){ambientActive=value;if(value){lastAt=null;request();}else{if(frameId!==null)cancelAnimationFrame(frameId);frameId=null;}}
});
if(sceneBridge.embedded){states.companion={position:[4.3,2.6,10],target:[2.6,1.15,1.8],fov:40};document.querySelector('.forest-controls')?.setAttribute('hidden','');}
let ready=false,disposed=false,moving=!preference.matches,chosenMotion=false,background=true,wireframe=false;
let activeView='main',lastAt=null,lastDraw=-Infinity,dirty=true;
let fineQuality=true;
let measureStart=null,measureFrames=0;
const ownedMaterials=new Set(),geometries=new Set(),textures=new Set();
const backdrops=[],heroMeshes=[];
const environment=createCampEnvironment(scene,geometries,ownedMaterials);backdrops.push(environment.extension);
const turfMeshes=[];
let sourceTerrain=null,sourceRiver=null;
let turfFineGeometry=null,turfDistanceGeometry=null,turfFineMaterial=null,turfDistanceMaterial=null;
const wireMaterial=new THREE.MeshBasicMaterial({color:'#395c70',wireframe:true});ownedMaterials.add(wireMaterial);

async function addContinuousTurf(loader){
  const [patch,binary]=await Promise.all([
    loader.loadAsync(new URL('./turf-patch.glb',import.meta.url).href),
    fetch(new URL('./turf-instances.bin',import.meta.url)).then(response=>{if(!response.ok)throw new Error(`Turf HTTP ${response.status}`);return response.arrayBuffer();})
  ]);
  const header=new DataView(binary);const magic=new TextDecoder().decode(new Uint8Array(binary,0,4));
  if(magic!=='TURF'||header.getUint32(4,true)!==1||header.getUint32(12,true)!==6)throw new Error('Invalid turf layout');
  const count=header.getUint32(8,true);if(binary.byteLength!==16+count*24)throw new Error('Incomplete turf data');
  patch.scene.updateMatrixWorld(true);const pieces=[];
  patch.scene.traverse(object=>{
    if(!object.isMesh)return;
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    const pos=geometry.attributes.position;const colors=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){
      const shade=.73+.27*THREE.MathUtils.smoothstep(pos.getY(i),0,.25);
      colors[i*3]=object.material.color.r*shade;colors[i*3+1]=object.material.color.g*shade;colors[i*3+2]=object.material.color.b*shade;
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(geometry);
  });
  const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());geometries.add(geometry);
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:0,side:THREE.DoubleSide});ownedMaterials.add(material);
  // Every patch remains present. At distance, three cards use an actual render
  // of the same sixteen blades, avoiding millions of sub-pixel triangles.
  const atlas=await new THREE.TextureLoader().loadAsync(new URL('./turf-distance.png',import.meta.url).href);
  atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.add(atlas);
  const cards=[];
  for(let i=0;i<3;i++)cards.push(new THREE.PlaneGeometry(.65,.42).translate(0,.18,0).rotateY(i*Math.PI/3));
  const distantGeometry=mergeGeometries(cards,false);cards.forEach(g=>g.dispose());geometries.add(distantGeometry);
  const distantMaterial=new THREE.MeshBasicMaterial({map:atlas,color:'#c9e0ba',side:THREE.DoubleSide,alphaTest:.16,alphaToCoverage:true,toneMapped:false});ownedMaterials.add(distantMaterial);
  turfFineGeometry=geometry;turfDistanceGeometry=distantGeometry;turfFineMaterial=material;turfDistanceMaterial=distantMaterial;
  const data=new Float32Array(binary,16);const buckets=new Map();
  for(let i=0;i<count;i++){
    const x=data[i*6],y=data[i*6+1];const key=`${Math.floor(x/8)},${Math.floor(y/8)}`;
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);
  }
  const position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),matrix=new THREE.Matrix4(),up=new THREE.Vector3(0,1,0);
  for(const [key,records] of buckets){
    const object=new THREE.InstancedMesh(geometry,material,records.length);object.name=`Continuous turf | ${key}`;
    records.forEach((index,i)=>{
      const n=index*6;position.set(data[n],data[n+2],-data[n+1]);rotation.setFromAxisAngle(up,data[n+3]);scale.set(data[n+4],data[n+5],data[n+4]);
      if(Math.hypot(position.x-2.6,position.z-1.8)<1.1)scale.y*=.22;
      matrix.compose(position,rotation,scale);object.setMatrixAt(i,matrix);
    });
    object.instanceMatrix.needsUpdate=true;object.computeBoundingSphere();object.boundingSphere.radius+=.5;object.castShadow=false;object.receiveShadow=true;scene.add(object);turfMeshes.push(object);
  }
  if(sourceTerrain&&sourceRiver){
    scene.remove(environment.ground);
    const meadow=createExpandedMeadow({scene,terrain:sourceTerrain,water:sourceRiver,grassAssets:{geometry,distantGeometry,material,distantMaterial},geometries,materials:ownedMaterials,textures});
    turfMeshes.push(...meadow.grassMeshes);stage.dataset.meadowExtension=JSON.stringify(meadow.stats);
  }
  stage.dataset.turfPatches=String(count);stage.dataset.turfBlades=String(count*16);stage.dataset.turfChunks=String(buckets.size);
}

function updateTurfLOD(){
  const radius=fineQuality?10:6;
  for(const object of turfMeshes){
    const assets=object.userData.meadowAssets;
    const detailed=camera.position.distanceTo(object.boundingSphere.center)<radius;
    object.geometry=detailed?(assets?.geometry??turfFineGeometry):(assets?.distantGeometry??turfDistanceGeometry);
    object.material=detailed?(assets?.material??turfFineMaterial):(assets?.distantMaterial??turfDistanceMaterial);
    object.receiveShadow=detailed;
  }
}

function listen(target,type,fn){target.addEventListener(type,fn,{signal:listeners.signal});}
function updateStatus(){if(ready)status.textContent=wireframe?'中景线框 · 拖动可查看真实网格':`${background?'原版远景 · 360°延展＋真实3D中景':'只显示真实3D模型'} · ${moving?'轻柔动态':'静态画面'}`;}
function request(){dirty=true;if(!disposed&&ambientActive&&!document.hidden&&frameId===null)frameId=requestAnimationFrame(tick);}
function tick(now){
  frameId=null;if(disposed||!ambientActive||document.hidden||!renderer)return;
  const changed=controls?.update();
  const constrained=safety?.constrain();
  if(dirty||changed||constrained||(moving&&ready&&now-lastDraw>1000/30-.8)){
    const dt=lastAt===null?0:Math.min((now-lastAt)/1000,.10);
    if(moving)time.value+=dt;
    dog?.update(moving?dt:0);
    lastAt=now;updateTurfLOD();renderer.render(scene,camera);sceneBridge.anchor();lastDraw=now;dirty=false;
    if(ready){
      if(measureStart===null)measureStart=now;
      measureFrames++;
      if(now-measureStart>2000){stage.dataset.previewFps=String(Math.round(measureFrames*1000/(now-measureStart)));stage.dataset.drawnTriangles=String(renderer.info.render.triangles);stage.dataset.cameraSafety=JSON.stringify(safety.stats());measureStart=now;measureFrames=0;}
    }
  }
  if((moving||changed)&&frameId===null)frameId=requestAnimationFrame(tick);
}
function resize(){
  if(!renderer)return;
  const box=stage.getBoundingClientRect();const aspect=Math.max(.1,box.width/Math.max(1,box.height));camera.aspect=aspect;
  const fov=states[activeView].fov;
  camera.fov=sceneBridge.embedded?(aspect<1?70:54):aspect>=1.65?fov:THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*16/9/aspect));
  camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min((devicePixelRatio||1)*(fineQuality?1.35:1),fineQuality?2:1.25));renderer.setSize(box.width,box.height,false);request();
}
function view(name){
  safety?.resetPath();
  activeView=name;const state=states[name];camera.position.fromArray(state.position);controls.target.fromArray(state.target);controls.update();
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));resize();
}
function setMotion(next){moving=next;lastAt=null;motionButton.setAttribute('aria-pressed',String(next));motionButton.textContent=next?'轻柔动态':'静态画面';updateStatus();request();}
function metadata(object){for(let node=object;node&&node!==model.parent;node=node.parent){if(node.userData.motion_role||node.userData.component||node.userData.is_distant_backdrop)return node.userData;}return {};}
function shader(object,data){
  const role=data.motion_role;if(!['flame','tree_crown','water'].includes(role))return;
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());
  const root=Array.isArray(data.root)?new THREE.Vector3(data.root[0],data.root[2],-data.root[1]):new THREE.Vector3(bounds.min.x,bounds.min.y,bounds.min.z);
  const uniforms={campTime:time,campRoot:{value:root},campHeight:{value:Number(data.tree_height)||Math.max(.05,size.y)},campLow:{value:bounds.min.y},campSpan:{value:Math.max(.05,size.y)},campPhase:{value:Number(data.phase)||0},campInverse:{value:new THREE.Matrix3().setFromMatrix4(object.matrixWorld).invert()}};
  const declaration=`uniform float campTime;uniform vec3 campRoot;uniform float campHeight;uniform float campLow;uniform float campSpan;uniform float campPhase;uniform mat3 campInverse;`;
  const deform=role==='flame'?`float w=pow(clamp((worldPoint.y-campLow)/campSpan,0.,1.),1.5);vec3 offset=vec3(sin(campTime*1.3+campPhase)*.10*w,sin(campTime*1.8+campPhase)*.06*w,cos(campTime*1.1+campPhase)*.05*w);`
    :role==='tree_crown'?`float w=pow(clamp((worldPoint.y-campRoot.y)/campHeight,0.,1.),2.2);vec3 offset=vec3(sin(campTime*.65+campPhase)*.09*w,0.,cos(campTime*.57+campPhase)*.04*w);`
    :`vec3 offset=vec3(0.,sin(worldPoint.x*.9+worldPoint.z*.8+campTime*.4)*.005,0.);`;
  const configure=mat=>{
    mat.onBeforeCompile=program=>{Object.assign(program.uniforms,uniforms);program.vertexShader=program.vertexShader.replace('#include <common>',`#include <common>\n${declaration}`).replace('#include <begin_vertex>',`#include <begin_vertex>\nvec3 worldPoint=(modelMatrix*vec4(transformed,1.)).xyz;${deform}transformed+=campInverse*offset;`);};
    mat.customProgramCacheKey=()=>`camp-natural-motion-${role}`;ownedMaterials.add(mat);return mat;
  };
  if(role==='flame'){
    object.material=configure(new THREE.MeshBasicMaterial({color:'#fff2d8',vertexColors:Boolean(object.geometry.attributes.color),transparent:true,opacity:.65,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}));object.castShadow=false;object.receiveShadow=false;
  }else{
    const copy=mat=>configure(mat.clone());object.material=Array.isArray(object.material)?object.material.map(copy):copy(object.material);
    if(role==='water'){(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>{m.roughness=.24;m.metalness=.20;});object.castShadow=false;}
  }
  object.geometry.computeBoundingSphere();object.geometry.boundingSphere.radius+=.15;
}

const hemi=new THREE.HemisphereLight('#e8e6dd','#78866b',1.5);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffe0ad',2.2);sun.position.set(20,22,-18);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);sun.shadow.bias=-.00005;sun.shadow.normalBias=.012;
Object.assign(sun.shadow.camera,{near:.1,far:100,left:-27,right:27,top:27,bottom:-27});scene.add(sun);
const key=new THREE.DirectionalLight('#ffead1',1.0);key.position.set(-9,19,2);scene.add(key);
const fill=new THREE.DirectionalLight('#d8e1ed',.7);fill.position.set(5,12,15);scene.add(fill);
const flameLight=new THREE.PointLight('#ffb062',7,5,2);flameLight.position.set(.15,.8,.6);scene.add(flameLight);
const tentLight=new THREE.PointLight('#ffd59b',11,7,2);tentLight.position.set(9.2,1.5,-4.6);scene.add(tentLight);

async function init(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
    const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label','可拖动环绕和缩放的真实3D森林营地');stage.prepend(canvas);
    controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.12;controls.enablePan=true;controls.minDistance=4.2;controls.maxDistance=42;controls.minPolarAngle=.30;controls.maxPolarAngle=Math.PI/2-.055;controls.autoRotate=false;
    safety=createCameraSafety(camera,controls);
    controls.addEventListener('change',request);controls.addEventListener('start',request);
    document.querySelectorAll('[data-view]').forEach(b=>listen(b,'click',()=>view(b.dataset.view)));
    listen(motionButton,'click',()=>{chosenMotion=true;setMotion(!moving);});
    const greetButton=document.querySelector('#dog-greet');
    if(greetButton)listen(greetButton,'click',()=>{dog?.talk();request();});
    listen(qualityButton,'click',()=>{fineQuality=!fineQuality;qualityButton.setAttribute('aria-pressed',String(fineQuality));qualityButton.textContent=fineQuality?'画质：精细':'画质：流畅';sun.shadow.mapSize.set(fineQuality?4096:2048,fineQuality?4096:2048);sun.shadow.map?.dispose();sun.shadow.map=null;renderer.shadowMap.needsUpdate=true;resize();});
    listen(backgroundButton,'click',()=>{background=!background;backdrops.forEach(o=>o.visible=background);backgroundButton.setAttribute('aria-pressed',String(background));backgroundButton.textContent=`远景背景：${background?'显示':'隐藏'}`;updateStatus();request();});
    listen(wireButton,'click',()=>{wireframe=!wireframe;heroMeshes.forEach(o=>{if(wireframe){o.userData.normalMaterial=o.material;o.material=wireMaterial;}else o.material=o.userData.normalMaterial;});wireButton.setAttribute('aria-pressed',String(wireframe));wireButton.textContent=`中景线框：${wireframe?'开启':'关闭'}`;updateStatus();request();});
    listen(document,'visibilitychange',()=>{lastAt=null;if(document.hidden){if(frameId!==null)cancelAnimationFrame(frameId);frameId=null;}else request();});
    listen(preference,'change',event=>{if(!chosenMotion)setMotion(!event.matches);});
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(stage);view('main');setMotion(moving);
    const loader=new GLTFLoader();
    const gltf=await loader.loadAsync(new URL('../forest-camp-natural-v3/forest-camp-dense-web.glb',import.meta.url).href,event=>{if(event.total)status.textContent=event.loaded===event.total?'模型已下载，正在准备材质…':`正在载入 3D 营地 · ${Math.round(event.loaded/event.total*100)}%`;});
    if(disposed)return;
    model=gltf.scene;scene.add(model);model.updateMatrixWorld(true);
    model.traverse(object=>{
      if(!object.isMesh)return;
      geometries.add(object.geometry);const data=metadata(object);object.castShadow=!object.name.startsWith('Terrain')&&!object.name.startsWith('Grass_v3');object.receiveShadow=true;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      materials.forEach(mat=>{ownedMaterials.add(mat);Object.values(mat).forEach(value=>{if(value?.isTexture){textures.add(value);value.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());}});});
      if(data.is_distant_backdrop){object.visible=true;backdrops.push(object);object.castShadow=false;object.receiveShadow=false;materials.forEach(mat=>{mat.fog=false;mat.toneMapped=false;mat.side=THREE.DoubleSide;});environment.attachOriginal(object);return;}
      if(object.name.startsWith('Terrain'))sourceTerrain=object;
      if(data.motion_role==='water')sourceRiver=object;
      safety.add(object,data);
      shader(object,data);
      if(/^(01|02|03) \|/.test(data.component||''))heroMeshes.push(object);
    });
    status.textContent='正在铺满草坪…';await addContinuousTurf(loader);
    try{
      const footRay=new THREE.Raycaster(new THREE.Vector3(2.6,30,1.8),new THREE.Vector3(0,-1,0));
      const floor=footRay.intersectObject(sourceTerrain,false)[0]?.point.y??0;
      dog=await addSceneDog(scene,{position:[2.6,floor+.012,1.8],height:1.9,face:[0,24],signal:listeners.signal,castShadow:false,contactShadow:true,onWake:()=>{if(!moving&&!preference.matches)setMotion(true);else request();},chat:sceneBridge.embedded?undefined:{host:stage,camera,viewport:canvas,onOpen:()=>view('dog')}});
      if(!sceneBridge.embedded)dog.bindInteraction(canvas,camera);
      dog.root.traverse(object=>{if(object.isMesh)safety.add(object,{component:'01 | Dog companion'});});
      stage.dataset.companionDog='ready';
      if(greetButton)greetButton.disabled=false;
    }catch(error){if(!disposed){console.warn('Camp dog unavailable',error);stage.dataset.companionDog='error';}}
    safety.constrain();renderer.shadowMap.needsUpdate=true;ready=true;fallback.hidden=true;stage.dataset.ready='true';stage.dataset.heroMeshes=String(heroMeshes.length);stage.dataset.backdrops='360';stage.dataset.backdropSource='original';
    if(sceneBridge.embedded){view('companion');if(dog)sceneBridge.ready();else sceneBridge.error();}
    updateStatus();request();
  }catch(error){sceneBridge.error();console.error('Natural campsite viewer:',error);status.textContent='三维暂未载入 · 下方仍可查看实际模型渲染';fallback.hidden=false;}
}
listen(window,'pagehide',()=>{
  disposed=true;listeners.abort();if(frameId!==null)cancelAnimationFrame(frameId);resizeObserver?.disconnect();controls?.dispose();
  sceneBridge.dispose();dog?.dispose();
  geometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer?.dispose();
});
init();
