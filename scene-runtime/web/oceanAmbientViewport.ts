import type { WindowViewport } from './ambientWindowViewport';
import { createOceanViewport } from './oceanViewport';

export async function createOceanAmbientViewport(host:HTMLElement,surface:HTMLElement,signal?:AbortSignal):Promise<WindowViewport>{
  const child=document.createElement('div');child.className='ambient-embedded';host.append(child);
  const touch=surface.style.touchAction;
  const tabindex=surface.getAttribute('tabindex');
  if(tabindex===null)surface.tabIndex=0;
  const restoreTab=()=>{if(tabindex===null)surface.removeAttribute('tabindex');else surface.setAttribute('tabindex',tabindex);};
  try{
    const viewport=await createOceanViewport(child,signal,{
      surface,onAnchor:detail=>host.dispatchEvent(new CustomEvent('ambient-kitten-anchor',{detail})),
      onActivate:()=>host.dispatchEvent(new CustomEvent('ambient-character-activate')),
      onCharacterState:state=>host.dispatchEvent(new CustomEvent('ambient-character-state',{detail:state}))
    });
    viewport.pause();
    return {resume(){surface.style.touchAction='none';viewport.resume();},pause(){surface.style.touchAction=touch;viewport.pause();},
      dispose(){surface.style.touchAction=touch;restoreTab();viewport.dispose();child.remove();},resetView:viewport.reset,greet:viewport.greet,
      reactToReply:viewport.greet,greetDog:()=>false,talkDog:()=>false};
  }catch(error){restoreTab();child.remove();throw error;}
}
