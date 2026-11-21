import { roomStorageSuffix } from './bedroomIdentity';
export interface MemoryImage { id: string; dataUrl: string; width: number; height: number }
export type BoardKind='photo'|'ticket'|'note'|'goal'|'todo';
export interface BoardItem {id:string;kind:BoardKind;title:string;text:string;image?:MemoryImage;done:boolean;createdAt:string}
export interface Notebook { id: string; title: string; color: string; createdAt: string }
export interface JournalPage { id: string; notebookId: string; text: string; date: string; images: MemoryImage[] }
export interface WallPhoto { slot: number; image: MemoryImage; caption: string }
export interface Memories { notebooks: Notebook[]; pages: JournalPage[]; photos: WallPhoto[] }
const DB_NAME = 'nuo-bedroom-memories'+roomStorageSuffix();
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  database ??= new Promise((resolve,reject) => {
    const request = indexedDB.open(DB_NAME,2);
    request.onupgradeneeded = () => {
      for (const name of ['notebooks','pages','photos','meta','board']) if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:name === 'photos' ? 'slot' : 'id'});
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('请关闭其他打开的卧室页面后重试。')); };
  });
  return database;
}
function result<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve,reject) => { request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error); }); }
function complete(tx: IDBTransaction): Promise<void> { return new Promise((resolve,reject) => { tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('保存中断')); }); }
export async function loadMemories(): Promise<Memories> {
  const database = await db();
  const tx = database.transaction(['notebooks','pages','photos','meta'],'readonly');
  const [notebooks,pages,photos,migration,initialized] = await Promise.all([
    result(tx.objectStore('notebooks').getAll()) as Promise<Notebook[]>, result(tx.objectStore('pages').getAll()) as Promise<JournalPage[]>,
    result(tx.objectStore('photos').getAll()) as Promise<WallPhoto[]>,result(tx.objectStore('meta').get('legacy-migration')),
    result(tx.objectStore('meta').get('notebooks-initialized')),
  ]);
  const now=new Date().toISOString();
  if (!notebooks.length && !initialized) {
    const titles=['日常碎片','小小开心','心事收纳','新的尝试','想念的人','慢慢长大'];
    const colors=['#b47c65','#8e9c81','#8d9daa','#b8a07b','#a48b9d','#7f9b98'];
    titles.forEach((title,i)=>notebooks.push({id:i===0?'daily':`notebook-${i}`,title,color:colors[i],createdAt:now}));
  }
  if (!migration && !roomStorageSuffix()) {
    try {
      const old=JSON.parse(localStorage.getItem('nuo_bedroom_diary_v1') || '[]');
      if (Array.isArray(old)) old.forEach((entry,i)=> { if(typeof entry?.text==='string' && typeof entry?.date==='string') pages.push({id:`legacy-${i}-${entry.date}`,notebookId:'daily',text:entry.text,date:entry.date,images:[]}); });
    } catch { /* A malformed legacy value must not prevent opening the bookshelf. */ }
  }
  const write=database.transaction(['notebooks','pages','meta'],'readwrite');const saved=complete(write);
  notebooks.forEach(n=>write.objectStore('notebooks').put(n));
  write.objectStore('meta').put({id:'notebooks-initialized',done:true});
  if (!migration) { pages.filter(p=>p.id.startsWith('legacy-')).forEach(p=>write.objectStore('pages').put(p)); write.objectStore('meta').put({id:'legacy-migration',done:true}); }
  await saved;
  return {notebooks:notebooks.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)),pages:pages.sort((a,b)=>a.date.localeCompare(b.date)),photos};
}
async function put(store: string,value: unknown): Promise<void> { const database=await db(),tx=database.transaction(store,'readwrite'),done=complete(tx);tx.objectStore(store).put(value);await done; }
export const saveNotebook=(notebook:Notebook)=>put('notebooks',notebook);
export const savePage=(page:JournalPage)=>put('pages',page);
export const savePhoto=(photo:WallPhoto)=>put('photos',photo);
export const saveBoardItem=(item:BoardItem)=>put('board',item);
export async function loadBoardItems():Promise<BoardItem[]> {const database=await db();return result(database.transaction('board','readonly').objectStore('board').getAll());}
export async function removeBoardItem(id:string):Promise<void> {const database=await db(),tx=database.transaction('board','readwrite'),done=complete(tx);tx.objectStore('board').delete(id);await done;}
export async function removePhoto(slot:number):Promise<void> { const database=await db(),tx=database.transaction('photos','readwrite'),done=complete(tx);tx.objectStore('photos').delete(slot);await done; }
export async function removePage(id:string):Promise<void> { const database=await db(),tx=database.transaction('pages','readwrite'),done=complete(tx);tx.objectStore('pages').delete(id);await done; }
export async function removeNotebook(id:string):Promise<void> {
  const database=await db(),tx=database.transaction(['notebooks','pages'],'readwrite'),done=complete(tx);
  tx.objectStore('notebooks').delete(id);
  const cursor=tx.objectStore('pages').openCursor();
  cursor.onsuccess=()=>{const row=cursor.result;if(row){if((row.value as JournalPage).notebookId===id)row.delete();row.continue();}};
  await done;
}

/** Images stay local. Decode and resize before IndexedDB storage, rather than using localStorage. */
export async function prepareImage(file:File):Promise<MemoryImage> {
  if (!file.type.startsWith('image/') || file.size>20*1024*1024) throw new Error('请选择不超过 20 MB 的图片。');
  const url=URL.createObjectURL(file),image=new Image();
  try {
    image.src=url;await image.decode();
    const ratio=Math.min(1,1280/Math.max(image.naturalWidth,image.naturalHeight));
    const width=Math.max(1,Math.round(image.naturalWidth*ratio)),height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('图片处理暂时不可用。');
    ctx.fillStyle='#fffaf2';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
    return {id:crypto.randomUUID(),dataUrl:canvas.toDataURL('image/jpeg',.86),width,height};
  } catch(error) { if(error instanceof Error && error.message.includes('20 MB')) throw error;throw new Error('这张图片暂时无法读取，请使用 JPG、PNG 或 WebP。'); }
  finally { URL.revokeObjectURL(url); }
}
