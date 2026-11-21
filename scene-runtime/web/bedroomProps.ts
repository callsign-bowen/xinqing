import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {Memories,Notebook,WallPhoto} from './bedroomStorage';

/** User-owned photos and notebook covers are composed locally; no uploads or remote assets. */
export function createMemoryProps(scene:THREE.Scene) {
  const root=new THREE.Group();root.name='Personal memories';scene.add(root);
  const books=new THREE.Group(),photos=new THREE.Group();root.add(books,photos);
  let bookSignature='';
  let generation=0;
  let alive=true;
  const photoIds=new Map<number,string>();
  function clear(group:THREE.Group){
    group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{Object.values(m).forEach(v=>{if(v instanceof THREE.Texture)v.dispose();});m.dispose();});}});
    group.clear();
  }
  function addBook(book:Notebook,index:number){
    const group=new THREE.Group();group.userData={action:'journal',notebookId:book.id};
    const col=index%6,row=Math.floor(index/6);group.position.set(.58+col*.148,row ? 1.505 : 1.18,-1.59);
    // Slight variation in height and lean makes the shelf feel used rather than machine-perfect.
    const height=.245+(index%3)*.009;group.rotation.z=(index%3-1)*.035;
    const cover=new THREE.MeshStandardMaterial({color:book.color,roughness:.87});
    const paper=new THREE.MeshStandardMaterial({color:0xf2e6cc,roughness:1});
    const block=new THREE.Mesh(new RoundedBoxGeometry(.105,height-.025,.20,3,.008),paper);block.castShadow=true;block.position.z=-.008;group.add(block);
    for(const x of [-.06,.06]){const side=new THREE.Mesh(new RoundedBoxGeometry(.016,height,.235,3,.006),cover);side.position.x=x;side.castShadow=true;group.add(side);}
    const spine=new THREE.Mesh(new RoundedBoxGeometry(.134,height,.018,3,.007),cover);spine.position.z=.115;group.add(spine);
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=book.color;ctx.fillRect(0,0,128,256);ctx.fillStyle='#fff5db';ctx.globalAlpha=.7;ctx.fillRect(14,25,100,2);ctx.fillRect(14,229,100,2);ctx.globalAlpha=1;
    ctx.font='23px "Microsoft YaHei", sans-serif';ctx.textAlign='center';
    Array.from(book.title).slice(0,7).forEach((char,i)=>ctx.fillText(char,64,55+i*23));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;
    const face=new THREE.Mesh(new THREE.PlaneGeometry(.116,height-.013),new THREE.MeshStandardMaterial({map:texture,roughness:1}));face.position.z=.125;group.add(face);
    books.add(group);
  }
  async function setPhoto(photo:WallPhoto,token:number){
    if(photoIds.get(photo.slot)===photo.image.id)return;
    const image=new Image();image.src=photo.image.dataUrl;
    try{await image.decode();}catch{return;}
    if(!alive||token!==generation)return;
    const previous=photos.children.find(o=>o.userData.photoSlot===photo.slot);if(previous){photos.remove(previous);const g=new THREE.Group();g.add(previous);clear(g);}
    const canvas=document.createElement('canvas');canvas.width=448;canvas.height=528;const ctx=canvas.getContext('2d')!;
    const scale=Math.max(canvas.width/image.width,canvas.height/image.height),w=image.width*scale,h=image.height*scale;
    ctx.drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.345,.407),new THREE.MeshStandardMaterial({map:texture,roughness:.82,polygonOffset:true,polygonOffsetFactor:-2}));
    mesh.position.set(-1.93+(photo.slot%3)*.58,2.41-Math.floor(photo.slot/3)*.65,-1.971);
    mesh.userData={action:'photos',photoSlot:photo.slot};photos.add(mesh);photoIds.set(photo.slot,photo.image.id);
  }
  function update(state:Memories){
    if(!alive)return;
    const signature=JSON.stringify(state.notebooks.map(b=>[b.id,b.title,b.color]));
    if(signature!==bookSignature){clear(books);state.notebooks.slice(0,12).forEach(addBook);bookSignature=signature;}
    const token=++generation;
    for(const mesh of [...photos.children])if(!state.photos.some(p=>p.slot===mesh.userData.photoSlot)){photos.remove(mesh);photoIds.delete(mesh.userData.photoSlot);const g=new THREE.Group();g.add(mesh);clear(g);}
    state.photos.forEach(photo=>void setPhoto(photo,token));
  }
  return {root,update,dispose:()=>{alive=false;generation++;clear(books);clear(photos);scene.remove(root);}};
}
