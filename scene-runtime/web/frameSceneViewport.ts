import type { WindowViewport } from './ambientWindowViewport';
import { isSceneBackground } from './embeddedSceneBridge.ts';

/** The accepted room/camp renderer sits behind the same AI composer used by the lunar scene. */
export async function createFrameSceneViewport(host: HTMLElement, surface: HTMLElement, kind: 'forest'|'bedroom', cancellation?: AbortSignal): Promise<WindowViewport> {
  const lifetime = new AbortController();
  const frame = document.createElement('iframe'); frame.className = 'ambient-scene-frame';
  frame.title = kind === 'forest' ? '森林营地与小狗' : '温暖卧室与小狗'; frame.tabIndex = -1;
  const oldTouch = surface.style.touchAction, oldTab = surface.getAttribute('tabindex');
  let active = false, disposed = false, ready=false, pointer: { id: number; x: number; y: number; startX:number; startY:number } | undefined;
  let rejectLoad: (reason: Error) => void = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const command = (command: string, detail: Record<string, unknown> = {}) => frame.contentWindow?.postMessage({ type: 'nuo-scene:command', command, ...detail }, location.origin);
  function releasePointer() { if(pointer){try{surface.releasePointerCapture(pointer.id);}catch{/* Already released. */}}pointer=undefined;delete surface.dataset.dragging; }
  function pause() { active = false; releasePointer(); surface.style.touchAction = oldTouch; command('active', { value:false }); }
  function dispose() {
    if(disposed)return;disposed=true;pause();lifetime.abort();clearTimeout(timeout);
    cancellation?.removeEventListener('abort', cancel);
    if(oldTab===null)surface.removeAttribute('tabindex');else surface.setAttribute('tabindex',oldTab);
    frame.remove();rejectLoad(new DOMException('Scene closed','AbortError'));
  }
  const cancel = () => dispose();
  cancellation?.throwIfAborted();cancellation?.addEventListener('abort',cancel,{once:true});
  if(oldTab===null)surface.tabIndex=0;
  const opt = { signal:lifetime.signal };
  surface.addEventListener('pointerdown', e=>{
    if(!active||!e.isPrimary||e.button!==0||!isSceneBackground(e.target))return;
    pointer={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};
    try{surface.setPointerCapture(e.pointerId);}catch{/* Continue in surface. */}surface.dataset.dragging='true';
  },opt);
  surface.addEventListener('pointermove',e=>{
    if(!active||!pointer||e.pointerId!==pointer.id)return;
    command('rotate',{dx:(e.clientX-pointer.x)/Math.max(320,host.clientWidth),dy:(e.clientY-pointer.y)/Math.max(320,host.clientWidth)});
    pointer.x=e.clientX;pointer.y=e.clientY;e.preventDefault();
  },{...opt,passive:false});
  surface.addEventListener('pointerup',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-pointer.startX,e.clientY-pointer.startY)<=7){const rect=host.getBoundingClientRect();command('tap',{x:(e.clientX-rect.left)/rect.width*2-1,y:1-(e.clientY-rect.top)/rect.height*2});}
    releasePointer();
  },opt);
  for(const name of ['pointercancel','lostpointercapture'])surface.addEventListener(name,releasePointer,opt);
  surface.addEventListener('keydown',e=>{
    if(!active||!isSceneBackground(e.target)||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==='Home')command('reset');
    else if(e.key.startsWith('Arrow'))command('rotate',{dx:e.key==='ArrowLeft'?.06:e.key==='ArrowRight'?-.06:0,dy:e.key==='ArrowUp'?.04:e.key==='ArrowDown'?-.04:0});
    else return;e.preventDefault();
  },opt);
  try {
    await new Promise<void>((resolve,reject)=>{
      rejectLoad=reject;
      timeout=setTimeout(()=>reject(new Error('场景加载较慢，请重试。')),90000);
      window.addEventListener('message',event=>{
        if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
        const data=event.data;
        if(data?.type==='nuo-scene:ready'){ready=true;clearTimeout(timeout);host.dataset.viewportState='ready';resolve();}
        if(data?.type==='nuo-scene:error'){if(ready){dispose();host.dispatchEvent(new CustomEvent('ambient-viewport-error'));}else reject(new Error('场景角色暂时没能加载。'));}
        if(data?.type==='nuo-scene:activate')host.dispatchEvent(new CustomEvent('ambient-character-activate'));
        if(data?.type==='nuo-scene:anchor'&&Number.isFinite(data.x)&&Number.isFinite(data.y))host.dispatchEvent(new CustomEvent('ambient-kitten-anchor',{detail:{x:data.x*host.clientWidth,y:data.y*host.clientHeight,visible:data.visible===true}}));
      },opt);
      frame.src=`/scene-runtime/${kind==='forest'?'forest':'bedroom'}/index.html?ambient=1`;host.append(frame);
    });
    cancellation?.throwIfAborted();
    return {resume(){if(disposed)return;const entering=!active;active=true;surface.style.touchAction='none';command('active',{value:true});if(entering)command('greet');},pause,dispose,resetView:()=>command('reset'),greet:()=>command('greet'),reactToReply(){command('greet');},greetDog(){command('greet');return active;},talkDog(){command('greet');return active;}};
  } catch(error) {dispose();throw error;}
}
