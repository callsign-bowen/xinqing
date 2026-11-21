import {loadMemories,saveNotebook,savePage,savePhoto,removePhoto,removePage,removeNotebook,prepareImage,type Memories,type JournalPage,type MemoryImage} from './bedroomStorage';
import './bedroomMemories.css';
interface Hooks {
  body:HTMLElement;
  open:(kind:'journal'|'photos',title:string)=>void;
  notify:(text:string)=>void;
  changed:(state:Memories)=>void;
  talk:(text:string)=>void;
  isAlive:()=>boolean;
}
const node=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>{const el=document.createElement(tag);el.className=className;el.textContent=text;return el;};
const button=(text:string,action:()=>void,className='memory-button')=>{const el=node('button',className,text);el.type='button';el.onclick=action;return el;};
const message=(error:unknown)=>error instanceof Error?error.message:'保存失败，请检查浏览器存储空间。';
export function createBedroomMemories(hooks:Hooks) {
  let state:Memories={notebooks:[],pages:[],photos:[]};
  let pending:Promise<void>|undefined;
  let viewToken=0;
  let managing=false;
  let draft:{bookId:string;text:string;images:MemoryImage[]}|undefined;
  const ready=()=>pending??=(async()=>{state=await loadMemories();if(hooks.isAlive())hooks.changed(state);})();
  function show(title:string,kind:'journal'|'photos'='journal') { viewToken++;hooks.open(kind,title); }
  async function loadView(run:()=>void,title:string,kind:'journal'|'photos'='journal') {
    show(title,kind);const token=viewToken;hooks.body.append(node('p','','正在打开你的回忆…'));
    try { await ready();if(token===viewToken && hooks.isAlive()){hooks.body.replaceChildren();run();} }
    catch(error){pending=undefined;if(token===viewToken && hooks.isAlive()){hooks.body.replaceChildren(node('p','',message(error)),button('重试',()=>void loadView(run,title,kind)));}}
  }
  function pageCount(id:string){return state.pages.filter(p=>p.notebookId===id).length;}
  function library(){void loadView(renderLibrary,'书架里的日常');}
  function renderLibrary(){
    hooks.body.replaceChildren();
    hooks.body.append(node('p','','每一本书，留给生活里不同的片刻。点开封面，就能读或写。'));
    if(state.notebooks.length)hooks.body.append(button(managing?'完成管理':'管理日记本',()=>{managing=!managing;renderLibrary();},'memory-link'));
    const shelf=node('div','memory-library');
    state.notebooks.forEach(book=>{
      const cover=button('',()=>readBook(book.id),'memory-cover');cover.style.setProperty('--book-color',book.color);cover.setAttribute('aria-label',`打开日记本：${book.title}`);
      cover.append(node('span','memory-cover-rule'),node('strong','',book.title),node('small','',pageCount(book.id)?`${pageCount(book.id)} 篇日记`:'还在等第一篇'));
      const item=node('div','memory-library-item');item.append(cover);
      if(managing)item.append(button(`删除《${book.title}》`,()=>confirmDelete(book.id),'memory-delete-book'));
      shelf.append(item);
    });hooks.body.append(shelf);
    if(!state.notebooks.length)hooks.body.append(node('p','memory-empty','书架现在空着，可以添一本新日记本，重新开始记录。'));
    if(state.notebooks.length<12)hooks.body.append(button('＋ 添一本新日记本',newNotebook,'bedroom-secondary'));
    hooks.body.append(node('p','bedroom-small','照片与文字仅存于此浏览器。清理网站数据会删除这些回忆，重要内容请保留原件。'));
  }
  function confirmDelete(id:string){
    const book=state.notebooks.find(b=>b.id===id);if(!book)return;
    show('删除日记本');hooks.body.replaceChildren();
    const pages=state.pages.filter(p=>p.notebookId===id),images=pages.reduce((sum,p)=>sum+p.images.length,0);
    hooks.body.append(node('p','',`确定删除《${book.title}》吗？里面的 ${pages.length} 篇日记和 ${images} 张图片会一起删除，无法撤销。照片墙不受影响。`));
    const confirm=button('确认删除整本日记',()=>void(async()=>{
      confirm.disabled=true;
      try{await removeNotebook(id);state.notebooks=state.notebooks.filter(b=>b.id!==id);state.pages=state.pages.filter(p=>p.notebookId!==id);if(draft?.bookId===id)draft=undefined;hooks.changed(state);if(hooks.isAlive()&&confirm.isConnected){library();hooks.notify('日记本已从书架移除。');}}
      catch(error){hooks.notify(message(error));confirm.disabled=false;}
    })(),'bedroom-primary');hooks.body.append(confirm,button('保留这本日记',library,'bedroom-secondary'));
  }
  function newNotebook(){
    show('给新日记本起个名字');
    const label=node('label','','封面上的名字'),input=node('input','memory-input');input.maxLength=12;input.placeholder='例如：我的小确幸';label.append(input);
    let color='#b47c65';const colors=node('div','memory-colors');
    ['#b47c65','#8e9c81','#8d9daa','#b8a07b','#a48b9d','#7f9b98'].forEach(c=>{const b=button('',()=>{color=c;colors.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));},'memory-color');b.style.background=c;b.setAttribute('aria-label',`选择封面颜色 ${c}`);b.setAttribute('aria-pressed',String(c===color));colors.append(b);});
    const create=button('把它放上书架',()=>void(async()=>{
      if(!input.value.trim()){input.focus();return;}
      create.disabled=true;
      try {const book={id:crypto.randomUUID(),title:input.value.trim(),color,createdAt:new Date().toISOString()};await saveNotebook(book);state.notebooks.push(book);hooks.changed(state);readBook(book.id);}
      catch(error){hooks.notify(message(error));create.disabled=false;}
    })(),'bedroom-primary');
    hooks.body.append(label,colors,create,button('返回书架',library,'bedroom-secondary'));input.focus();
  }
  function readBook(id:string){void loadView(()=>renderBook(id,0),state.notebooks.find(b=>b.id===id)?.title || '我的日记本');}
  type Leaf={entry:JournalPage;text?:string;image?:MemoryImage;first:boolean};
  function leaves(id:string):Leaf[]{
    const list:Leaf[]=[];
    state.pages.filter(p=>p.notebookId===id).forEach(entry=>{
      const chars=Array.from(entry.text);let first=true;
      for(let i=0;i<chars.length;i+=240){list.push({entry,text:chars.slice(i,i+240).join(''),first});first=false;}
      entry.images.forEach(image=>{list.push({entry,image,first});first=false;});
    });return list;
  }
  function renderBook(id:string,index:number,direction=0){
    const book=state.notebooks.find(b=>b.id===id);if(!book)return;
    hooks.body.replaceChildren();
    const pages=leaves(id),current=pages[Math.min(Math.max(index,0),Math.max(0,pages.length-1))];
    const heading=node('div','memory-book-heading');heading.append(node('span','','手写生活 · '+`${state.pages.filter(p=>p.notebookId===id).length} 篇`),button('所有日记本',library,'memory-link'));hooks.body.append(heading);
    const spread=node('article','memory-paper');spread.style.setProperty('--book-color',book.color);
    if(direction) {spread.dataset.direction=String(direction);spread.classList.add('memory-turn');}
    if(current){
      spread.append(node('time','memory-date',new Date(current.entry.date).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'})));
      if(current.text)spread.append(node('div','memory-writing',current.text));
      if(current.image){const image=node('img','memory-page-image');image.src=current.image.dataUrl;image.alt='日记里保存的照片';spread.append(image);if(current.first && !current.entry.text)spread.append(node('p','memory-photo-note','把这一刻，留在纸上。'));}
      spread.append(node('span','memory-folio',`${index+1}`));
    }else{spread.append(node('div','memory-blank-title',book.title),node('p','memory-empty','这里还是空白的。\n写下第一句话，\n你的故事就开始了。'));}
    hooks.body.append(spread);
    const nav=node('div','memory-pagination');const prev=button('← 上一页',()=>renderBook(id,index-1,-1));prev.disabled=index<=0;
    const next=button('下一页 →',()=>renderBook(id,index+1,1));next.disabled=index>=pages.length-1;
    nav.append(prev,node('span','',pages.length?`${index+1} / ${pages.length}`:'等待第一篇'),next);hooks.body.append(nav);
    hooks.body.append(button('＋ 写新的一页',()=>compose(id),'bedroom-primary'));
    if(current){
      const actions=node('div','memory-page-actions');actions.append(button('和 Nuo 聊聊这篇',()=>hooks.talk(current.entry.text ? `我想聊聊日记里的这件事：${current.entry.text.slice(0,1800)}` : '我想聊聊今天的感受。'),'memory-link'));
      actions.append(button('删除这篇日记',()=>{
        const prompt=node('div','memory-confirm');prompt.append(node('p','','删除后，这篇日记的文字和图片都会从书中移除。'));
        const confirm=button('确认删除这篇',()=>void(async()=>{confirm.disabled=true;try{await removePage(current.entry.id);state.pages=state.pages.filter(p=>p.id!==current.entry.id);hooks.changed(state);renderBook(id,0);}catch(error){hooks.notify(message(error));confirm.disabled=false;}})());
        prompt.append(confirm,button('保留这篇',()=>prompt.remove(),'memory-link'));actions.replaceChildren(prompt);
      },'memory-link'));hooks.body.append(actions);
    }
    hooks.body.scrollTop=0;
  }
  function compose(id:string){
    const book=state.notebooks.find(b=>b.id===id);if(!book)return;
    show('在「'+book.title+'」里写一页');
    if(draft?.bookId!==id)draft={bookId:id,text:'',images:[]};
    const currentDraft=draft;
    const label=node('label','','今天，想留下什么？'),text=node('textarea','memory-compose');text.maxLength=5000;text.placeholder='一件小事，一段心情，都可以…';text.value=currentDraft.text;text.oninput=()=>{currentDraft.text=text.value;};label.append(text);
    const gallery=node('div','memory-draft-images');
    function draw(){gallery.replaceChildren();currentDraft.images.forEach((im,i)=>{const tile=node('div','memory-draft-image'),img=node('img');img.src=im.dataUrl;img.alt=`待保存的第 ${i+1} 张照片`;tile.append(img,button('移除',()=>{currentDraft.images.splice(i,1);draw();},'memory-image-remove'));gallery.append(tile);});}
    const input=node('input');input.type='file';input.accept='image/*';input.multiple=true;input.hidden=true;
    const add=button('＋ 放入照片（最多 4 张）',()=>input.click(),'bedroom-secondary');
    input.onchange=async()=>{const files=Array.from(input.files || []);if(!files.length)return;add.disabled=true;save.disabled=true;try{const images=await Promise.all(files.slice(0,4-currentDraft.images.length).map(prepareImage));currentDraft.images.push(...images);if(hooks.isAlive()&&input.isConnected)draw();}catch(error){hooks.notify(message(error));}finally{add.disabled=false;save.disabled=false;input.value='';}};
    const save=button('收进日记本',()=>void(async()=>{
      if(!currentDraft.text.trim()&&!currentDraft.images.length){hooks.notify('写一点文字，或放一张照片吧。');return;}
      save.disabled=true;add.disabled=true;
      const page:JournalPage={id:crypto.randomUUID(),notebookId:id,text:currentDraft.text.trim(),images:[...currentDraft.images],date:new Date().toISOString()};
      try{await savePage(page);state.pages.push(page);hooks.changed(state);if(draft===currentDraft)draft=undefined;if(hooks.isAlive()&&save.isConnected){readBook(id);hooks.notify('这一页，已经替你好好收进书里。');}}
      catch(error){hooks.notify(message(error));save.disabled=false;add.disabled=false;}
    })(),'bedroom-primary');
    hooks.body.append(label,gallery,input,add,save,button('先合上，稍后再写',()=>readBook(id),'bedroom-secondary'),node('p','bedroom-small','文字和图片保存在本机；不会自动发送给 AI。草稿暂存在本次打开的房间中。'));draw();text.focus();
  }
  function photos(slot?:number){void loadView(()=>renderPhotos(slot),'把喜欢的瞬间，挂在墙上','photos');}
  function renderPhotos(selected?:number){
    hooks.body.append(node('p','','选一格，放进你真实的照片。家人、旅行，或平凡的一天。'));
    const grid=node('div','memory-photo-grid');
    for(let slot=0;slot<6;slot++){
      const photo=state.photos.find(p=>p.slot===slot),tile=node('div','memory-photo-tile');if(selected===slot)tile.classList.add('selected');
      const upload=node('input');upload.type='file';upload.accept='image/*';upload.hidden=true;
      const frame=button('',()=>upload.click(),'memory-photo-frame');frame.setAttribute('aria-label',photo?`更换第 ${slot+1} 张墙上照片`:`上传第 ${slot+1} 张墙上照片`);
      if(photo){const im=node('img');im.src=photo.image.dataUrl;im.alt=photo.caption || `照片墙第 ${slot+1} 张照片`;frame.append(im);}else frame.append(node('span','','＋'),node('small','',`回忆 ${String(slot+1).padStart(2,'0')}`));
      const caption=node('input','memory-caption');caption.maxLength=32;caption.placeholder='给这一刻起个名字';caption.value=photo?.caption || '';caption.setAttribute('aria-label',`第 ${slot+1} 张照片的说明`);caption.disabled=!photo;
      caption.onchange=async()=>{const old=state.photos.find(p=>p.slot===slot);if(!old)return;try{const next={...old,caption:caption.value.trim()};await savePhoto(next);Object.assign(old,next);hooks.changed(state);}catch(error){hooks.notify(message(error));}};
      upload.onchange=async()=>{const file=upload.files?.[0];if(!file)return;frame.disabled=true;try{const image=await prepareImage(file);const next={slot,image,caption:caption.value.trim()};await savePhoto(next);state.photos=state.photos.filter(p=>p.slot!==slot).concat(next);hooks.changed(state);if(hooks.isAlive()&&grid.isConnected){hooks.body.replaceChildren();renderPhotos(slot);}hooks.notify('照片已经挂到墙上了。');}catch(error){hooks.notify(message(error));frame.disabled=false;}finally{upload.value='';}};
      tile.append(frame,upload,caption);
      if(photo)tile.append(button('从墙上取下',()=>void(async()=>{try{await removePhoto(slot);state.photos=state.photos.filter(p=>p.slot!==slot);hooks.changed(state);hooks.body.replaceChildren();renderPhotos();}catch(error){hooks.notify(message(error));}})(),'memory-link'));
      grid.append(tile);
    }
    hooks.body.append(grid,node('p','bedroom-small','照片仅保存在这台设备的浏览器中，不上传到服务器。建议保留原图。'));
  }
  return {library,readBook,photos,ready,invalidate:()=>{viewToken++;},getState:()=>state};
}
