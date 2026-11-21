import * as THREE from 'three';
import { roomStorageSuffix } from './bedroomIdentity';
interface PlantState { waterings:number; lastWatered:string|null }
interface Hooks { scene:THREE.Scene;body:HTMLElement;open:()=>void;notify:(text:string)=>void;reducedMotion:boolean }
const KEY='nuo_bedroom_plant_v1'+roomStorageSuffix();
const day=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export function createBedroomPlant(hooks:Hooks){
  let state:PlantState={waterings:0,lastWatered:null};
  try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(raw&&Number.isFinite(raw.waterings))state={waterings:Math.max(0,Math.min(5,Math.floor(raw.waterings))),lastWatered:typeof raw.lastWatered==='string'?raw.lastWatered:null};}catch{/* A fresh seedling is available even when storage is unavailable. */}
  let foliage:THREE.Object3D|undefined;
  const leaves:THREE.Object3D[]=[];
  let scale=.44+.56*state.waterings/5;
  let target=scale;
  const position=new THREE.Vector3(1.32,.36,.83);
  const positions=new Float32Array(36*3),speeds=new Float32Array(36);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const particles=new THREE.Points(geometry,new THREE.PointsMaterial({color:0x98cad1,size:.038,transparent:true,opacity:.85,depthWrite:false}));particles.visible=false;hooks.scene.add(particles);
  let waterTime=0;
  const order=[12,10,11,8,6,9,7,4,5,2,3,0,1];
  const stageNames=['刚刚发芽','冒出新叶','慢慢舒展','绿意渐浓','枝叶茂盛','长成小树'];
  function refresh(){
    target=.44+.56*state.waterings/5;
    const visible=order.slice(0,3+state.waterings*2);
    leaves.forEach(o=>{o.visible=visible.includes(o.userData.plantLeafIndex);});
    if(hooks.reducedMotion){scale=target;foliage?.scale.setScalar(scale);}
  }
  function attach(model:THREE.Object3D){model.traverse(o=>{if(o.userData.isPlantFoliage)foliage=o;if(Number.isInteger(o.userData.plantLeafIndex))leaves.push(o);});refresh();foliage?.scale.setScalar(scale);}
  function sprinkle(){
    if(hooks.reducedMotion)return;
    for(let i=0;i<36;i++){positions[i*3]=position.x-.18+Math.random()*.36;positions[i*3+1]=position.y+.32+Math.random()*.70;positions[i*3+2]=position.z-.18+Math.random()*.36;speeds[i]=.6+Math.random()*.6;}
    waterTime=1.8;particles.visible=true;geometry.attributes.position.needsUpdate=true;
  }
  function water(){
    sprinkle();
    if(state.lastWatered===day()){hooks.notify('今天已经喝过水啦，再陪它待一会儿。');return;}
    const next={waterings:Math.min(5,state.waterings+1),lastWatered:day()};
    try{localStorage.setItem(KEY,JSON.stringify(next));state=next;}
    catch{hooks.notify('暂时无法保存养护进度，请检查浏览器存储空间。');return;}
    refresh();render();hooks.notify(state.waterings===5?'它已经长成一棵小树，往后也陪你慢慢过。':'喝到水了，小绿植又长出了一点新绿。');
  }
  function render(){
    hooks.body.replaceChildren();
    const intro=document.createElement('p');intro.textContent='一点水，一点陪伴，让这里慢慢长出绿意。';
    const card=document.createElement('div');card.className='bedroom-plant-card';
    card.innerHTML=`<div class="bedroom-plant-symbol" aria-hidden="true">❧</div><strong>${stageNames[state.waterings]}</strong><span>已经一起养护 ${state.waterings} 天</span><div class="bedroom-plant-progress" role="progressbar" aria-label="植物成长进度" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${state.waterings}"><i style="width:${state.waterings/5*100}%"></i></div>`;
    const waterButton=document.createElement('button');waterButton.type='button';waterButton.className='bedroom-primary';waterButton.textContent=state.lastWatered===day()?'再洒一点水':'浇一点水';waterButton.onclick=water;
    const hint=document.createElement('p');hint.className='bedroom-small';hint.textContent=state.lastWatered===day()?'今天的养护已收好。每天第一次浇水会累计成长，再浇也可以看看水滴。':'每天第一次浇水，会长高一点、展开更多叶片。几天不来，它也会等你。';
    hooks.body.append(intro,card,waterButton,hint);
  }
  return {
    attach,
    open:()=>{hooks.open();render();},
    tick:(dt:number)=>{
      if(Math.abs(scale-target)>.0001){scale=THREE.MathUtils.damp(scale,target,2.5,dt);foliage?.scale.setScalar(scale);}
      if(waterTime>0){waterTime-=dt;for(let i=0;i<36;i++){positions[i*3+1]-=speeds[i]*dt;if(positions[i*3+1]<position.y)positions[i*3+1]=position.y+.8;}geometry.attributes.position.needsUpdate=true;if(waterTime<=0)particles.visible=false;}
    },
    dispose:()=>{hooks.scene.remove(particles);geometry.dispose();(particles.material as THREE.Material).dispose();},
  };
}
