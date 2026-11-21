import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadBoardItems,saveBoardItem,removeBoardItem,prepareImage,type BoardItem,type BoardKind,type MemoryImage } from './bedroomStorage';
import './bedroomBoard.css';
const labels:Record<BoardKind,string>={photo:'照片',ticket:'票根',note:'便签',goal:'小目标',todo:'待办'};
const make=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const el=document.createElement(tag);el.textContent=text;el.className=className;return el;};
const button=(text:string,run:()=>void,className='memory-button')=>{const el=make('button',text,className);el.type='button';el.onclick=run;return el;};
interface Hooks{scene:THREE.Scene;body:HTMLElement;open:()=>void;notify:(text:string)=>void;alive:()=>boolean}
export function createBedroomBoard(hooks:Hooks){
  let items:BoardItem[]=[],page=0,alive=true,view=0,drawVersion=0;
  const size=12,papers=new THREE.Group(),board=new THREE.Group();board.name='Pinned memories wall';board.position.set(2.465,1.72,-.12);board.rotation.y=-Math.PI/2;board.userData.action='board';hooks.scene.add(board);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#bf9c72';ctx.fillRect(0,0,256,256);
  let seed=1701;for(let i=0;i<9000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%256;seed=(seed*1664525+1013904223)>>>0;ctx.fillStyle=i%2?'#a17e5524':'#e5c69560';ctx.fillRect(x,seed%256,2,2);}
  const cork=new THREE.CanvasTexture(canvas);cork.colorSpace=THREE.SRGBColorSpace;cork.wrapS=cork.wrapT=THREE.RepeatWrapping;cork.repeat.set(3,2);
  const corkMaterial=new THREE.MeshStandardMaterial({map:cork,roughness:1}),wood=new THREE.MeshStandardMaterial({color:0xb88d60,roughness:.8});
  function box(name:string,w:number,h:number,d:number,x:number,y:number,z:number,material:THREE.Material){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(w,h,d)*.24),material);mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;mesh.castShadow=true;board.add(mesh);}
  box('Warm cork pinboard',3.12,1.82,.045,0,0,0,corkMaterial);
  box('Upper rounded wood rail',3.22,.065,.075,0,.94,.01,wood);box('Lower wood rail',3.22,.065,.075,0,-.94,.01,wood);
  box('Left wood rail',.065,1.87,.075,-1.58,0,.01,wood);box('Right wood rail',.065,1.87,.075,1.58,0,.01,wood);
  box('Memory ledge',3.2,.07,.24,0,-1.02,.08,wood);
  board.add(papers);
  const pinGeometry=new THREE.SphereGeometry(.026,12,8),pinMaterial=new THREE.MeshStandardMaterial({color:0xa66b52,roughness:.4,metalness:.25});
  function clearPapers(){papers.traverse(o=>{if(o instanceof THREE.Mesh){if(o.geometry!==pinGeometry)o.geometry.dispose();if(o.material!==pinMaterial){const material=o.material as THREE.MeshStandardMaterial;material.map?.dispose();material.dispose();}}});papers.clear();}
  async function redraw(){
    const version=++drawVersion;clearPapers();
    const selected=items.slice(page*size,(page+1)*size);
    if(!selected.length){
      const sample=make('canvas');sample.width=512;sample.height=240;const c=sample.getContext('2d')!;c.fillStyle='#fff7dc';c.fillRect(0,0,512,240);c.fillStyle='#846c4f';c.textAlign='center';c.font='28px sans-serif';c.fillText('把喜欢的日子，钉在这里。',256,105);c.font='20px sans-serif';c.fillText('照片 · 票根 · 小目标',256,155);const texture=new THREE.CanvasTexture(sample);texture.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1.7,.8),new THREE.MeshStandardMaterial({map:texture,roughness:1}));mesh.position.z=.04;mesh.rotation.z=-.035;papers.add(mesh);return;
    }
    await Promise.all(selected.map(async(item,index)=>{
      const paper=document.createElement('canvas');paper.width=384;paper.height=432;const c=paper.getContext('2d')!;
      c.fillStyle=item.kind==='note'?'#fff0bd':item.kind==='goal'?'#e2ecd8':item.kind==='todo'?'#e1eaf0':'#fffcf2';c.fillRect(0,0,384,432);
      if(item.image){const image=new Image();image.src=item.image.dataUrl;try{await image.decode();const ratio=Math.min(344/image.width,300/image.height);c.drawImage(image,20+(344-image.width*ratio)/2,20+(300-image.height*ratio)/2,image.width*ratio,image.height*ratio);}catch{/* Retain its caption when an image cannot be decoded. */}}
      c.fillStyle='#75624e';c.font='18px sans-serif';c.fillText(`${labels[item.kind]}${item.done?' · 已完成':''}`,24,item.image?345:50);
      c.font='25px sans-serif';const chars=Array.from(item.title||item.text||labels[item.kind]);const start=item.image?385:105;
      for(let row=0;row<(item.image?1:6);row++)c.fillText(chars.slice(row*12,(row+1)*12).join(''),24,start+row*42,336);
      if(!alive||version!==drawVersion)return;
      const texture=new THREE.CanvasTexture(paper);texture.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.61,.66),new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide}));
      const x=-1.13+(index%4)*.75,y=.56-Math.floor(index/4)*.57;mesh.scale.y=.78;mesh.position.set(x,y,.055+(index%3)*.003);mesh.rotation.z=((index*7%11)-5)*.015;mesh.castShadow=true;mesh.userData.action='board';mesh.userData.boardId=item.id;papers.add(mesh);
      const pin=new THREE.Mesh(pinGeometry,pinMaterial);pin.position.set(x,y+.22,.105);papers.add(pin);
    }));
  }
  const ready=loadBoardItems().then(data=>{items=data.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));if(alive)void redraw();}).catch(()=>hooks.notify('回忆墙暂时无法读取，请稍后重试。'));
  async function open(id?:string){hooks.open();const token=++view;hooks.body.replaceChildren(make('p','正在打开回忆墙…'));await ready;if(!alive||token!==view||!hooks.alive())return;if(id&&items.some(i=>i.id===id))detail(id);else library();}
  function nav(){const row=make('div','','board-pagination');const pages=Math.max(1,Math.ceil(items.length/size));const prev=button('← 上一面',()=>{page--;void redraw();library();});prev.disabled=page===0;const next=button('下一面 →',()=>{page++;void redraw();library();});next.disabled=page>=pages-1;row.append(prev,make('span',`${page+1} / ${pages}`),next);return row;}
  function library(){
    hooks.body.replaceChildren(make('p','把照片、票根和想做的小事留在这里。每面墙展示 12 件，可以继续添加和翻看。'));
    const add=make('div','','board-add');for(const kind of Object.keys(labels) as BoardKind[])add.append(button(`＋ ${labels[kind]}`,()=>edit(undefined,kind)));hooks.body.append(add);
    const grid=make('div','','board-grid');items.slice(page*size,(page+1)*size).forEach(item=>{const tile=button('',()=>detail(item.id),'board-tile');
      if(item.image){const image=make('img');image.src=item.image.dataUrl;image.alt=item.title||labels[item.kind];tile.append(image);}
      tile.append(make('small',labels[item.kind]+(item.done?' · 已完成':'')),make('strong',item.title||item.text||'留下一段回忆'));grid.append(tile);
    });hooks.body.append(grid);if(!items.length)hooks.body.append(make('p','墙上还是空白的，先放一张照片或一张票根吧。'));hooks.body.append(nav(),make('p','回忆仅保存在当前账号的此浏览器中。清理网站数据前请保留原件。','bedroom-small'));
  }
  function detail(id:string){
    const item=items.find(i=>i.id===id);if(!item)return;hooks.body.replaceChildren();
    const article=make('article','','board-detail');article.append(make('small',labels[item.kind]),make('h3',item.title||'一段回忆'));
    if(item.image){const image=make('img');image.src=item.image.dataUrl;image.alt=item.title||labels[item.kind];article.append(image);}
    if(item.text)article.append(make('p',item.text));hooks.body.append(article);
    if(item.kind==='todo'||item.kind==='goal'){
      const label=make('label','','board-check'),check=make('input');check.type='checkbox';check.checked=item.done;
      check.onchange=async()=>{check.disabled=true;try{const updated={...item,done:check.checked};await saveBoardItem(updated);Object.assign(item,updated);void redraw();}catch{check.checked=item.done;hooks.notify('保存失败，请重试。');}finally{check.disabled=false;}};label.append(check,make('span',item.kind==='goal'?'这个目标已经完成':'这件事已经做完'));hooks.body.append(label);
    }
    hooks.body.append(button('编辑这一件',()=>edit(item),'bedroom-primary'),button('返回回忆墙',library,'bedroom-secondary'),button('移除这一件',()=>{
      const confirmation=make('div','','memory-confirm');confirmation.append(make('p','确定移除这一件回忆吗？文字和上传的图片都会删除，无法撤销。'));
      const remove=button('确认移除',()=>void(async()=>{remove.disabled=true;try{await removeBoardItem(id);items=items.filter(i=>i.id!==id);page=Math.min(page,Math.max(0,Math.ceil(items.length/size)-1));void redraw();if(alive&&remove.isConnected)library();}catch{remove.disabled=false;hooks.notify('删除失败，请重试。');}})());confirmation.append(remove,button('保留',()=>detail(id)));hooks.body.replaceChildren(confirmation);
    },'memory-link'));
  }
  function edit(existing?:BoardItem,kind:BoardKind=existing?.kind||'photo'){
    hooks.body.replaceChildren(make('p',`留下一${kind==='ticket'?'张票根':kind==='photo'?'张照片':'件'+labels[kind]}，以后回来看。`));
    const title=make('input','','memory-input');title.maxLength=80;title.value=existing?.title||'';const titleLabel=make('label','名字或日期');titleLabel.append(title);
    const text=make('textarea','','memory-compose');text.maxLength=2000;text.value=existing?.text||'';text.placeholder='那一天发生了什么？或者，写下想完成的小事…';const textLabel=make('label','想记住的话');textLabel.append(text);
    let image:MemoryImage|undefined=existing?.image,busy=false;
    const preview=make('div','','board-preview'),file=make('input');file.type='file';file.accept='image/*';file.hidden=true;
    const refresh=()=>{preview.replaceChildren();if(image){const img=make('img');img.src=image.dataUrl;img.alt='待保存的回忆图片';preview.append(img,button('去掉这张图片',()=>{image=undefined;refresh();},'memory-link'));}};refresh();
    const upload=button(image?'换一张图片':'选择照片或票根图片',()=>file.click(),'bedroom-secondary');
    file.onchange=async()=>{const selected=file.files?.[0];if(!selected)return;busy=true;upload.disabled=true;save.disabled=true;try{image=await prepareImage(selected);if(file.isConnected)refresh();}catch(error){hooks.notify(error instanceof Error?error.message:'图片无法读取。');}finally{busy=false;upload.disabled=false;save.disabled=false;file.value='';}};
    const save=button('用图钉挂上墙',()=>void(async()=>{
      if(busy)return;if((kind==='photo'||kind==='ticket')&&!image){hooks.notify('先选择一张照片或票根图片。');return;}if(!title.value.trim()&&!text.value.trim()&&!image){hooks.notify('写一点内容再挂上墙吧。');return;}
      save.disabled=true;upload.disabled=true;const item:BoardItem={id:existing?.id||crypto.randomUUID(),kind,title:title.value.trim(),text:text.value.trim(),image,done:existing?.done||false,createdAt:existing?.createdAt||new Date().toISOString()};
      try{await saveBoardItem(item);if(existing)items=items.map(i=>i.id===item.id?item:i);else items.push(item);page=Math.floor(items.findIndex(i=>i.id===item.id)/size);void redraw();if(alive&&save.isConnected){library();hooks.notify('已经帮你钉在回忆墙上。');}}
      catch{save.disabled=false;upload.disabled=false;hooks.notify('保存失败，请检查浏览器存储空间。');}
    })(),'bedroom-primary');hooks.body.append(titleLabel,textLabel,preview,file,upload,save,button('取消',()=>existing?detail(existing.id):library(),'bedroom-secondary'));title.focus();
  }
  return {root:board,open,dispose(){alive=false;view++;drawVersion++;clearPapers();pinGeometry.dispose();pinMaterial.dispose();board.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});cork.dispose();corkMaterial.dispose();wood.dispose();board.removeFromParent();},invalidate(){view++;},ready};
}
