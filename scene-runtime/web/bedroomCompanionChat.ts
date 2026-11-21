import { Vector3, type Camera } from 'three';
import './bedroomCompanionChat.css';
import { chatLayout } from './bedroomChatLayout';

export function createCompanionChat(root:HTMLElement,hooks:{closePanel:()=>void;play:(name:string)=>void;canAnimate:()=>boolean}) {
  const dock=document.createElement('section');dock.className='companion-chat';dock.hidden=true;dock.setAttribute('aria-label','和熊猫聊天');
  dock.innerHTML='<header><strong>和 Nuo 说说话</strong><button type="button" aria-label="收起熊猫对话">×</button></header><form><label for="companion-input">想说什么？</label><textarea id="companion-input" rows="1" maxlength="2000" placeholder="我想说…"></textarea><button type="submit" aria-label="发送给熊猫">↑</button></form><details><summary>和 Nuo 互动</summary><div class="companion-motions" aria-label="和 Nuo 互动"></div></details><details><summary>聊天记录</summary><div class="companion-history" role="log"></div></details>';
  const notification=document.createElement('aside');notification.className='companion-notification';notification.hidden=true;notification.setAttribute('aria-label','Nuo 的回复');
  notification.innerHTML='<span class="companion-speaker">Nuo</span><div class="companion-reply" role="status" aria-live="polite"></div><div class="companion-resources"></div>';
  root.append(dock,notification);
  const input=dock.querySelector('textarea')!,form=dock.querySelector('form')!,send=form.querySelector('button')!,history=dock.querySelector('.companion-history')!,reply=notification.querySelector('.companion-reply')!,resources=notification.querySelector('.companion-resources')!;
  let alive=true,thinking=false;
  const abort=new AbortController(),conversationId=`bedroom-${crypto.randomUUID()}`;
  const messages:{role:'user'|'assistant';text:string}[]=[];
  const motionButtons:HTMLButtonElement[]=[];
  for(const [name,label] of [['Wave','挥挥手'],['Happy','开心一下'],['Curious','歪头看看'],['Typing','敲敲键盘']]){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>hooks.play(name);dock.querySelector('.companion-motions')!.append(b);motionButtons.push(b);
  }
  function close(){input.blur();dock.hidden=true;notification.hidden=true;root.dataset.chatting='false';}
  dock.querySelector('header button')!.addEventListener('click',close);
  function render(){
    history.replaceChildren();
    for(const m of messages){const el=document.createElement('p');el.className=m.role;el.textContent=`${m.role==='user'?'我':'Nuo'}：${m.text}`;history.append(el);}
    history.scrollTop=history.scrollHeight;send.disabled=thinking;
    reply.textContent=thinking?'Nuo 正在听，稍等一下…':messages.filter(m=>m.role==='assistant').at(-1)?.text || '我在这里。今天有什么想和我分享的吗？';
  }
  form.onsubmit=async e=>{
    e.preventDefault();const text=input.value.trim();if(!text||thinking)return;
    messages.push({role:'user',text});input.value='';sizeInput();thinking=true;resources.replaceChildren();render();hooks.play('Curious');
    try{
      const headers:Record<string,string>={'Content-Type':'application/json'};
      const token=localStorage.getItem('nuo_auth_token');if(token)headers.Authorization=`Bearer ${token}`;
      const response=await fetch('/api/chat',{method:'POST',headers,body:JSON.stringify({message:text,conversationId}),signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
      if(!response.ok)throw new Error('连接失败');const data=await response.json();
      if(typeof data.reply!=='string'||!data.reply.trim())throw new Error('回复为空');if(!alive)return;
      messages.push({role:'assistant',text:data.reply});hooks.play('Curious');
      if(Array.isArray(data.resources))for(const r of data.resources){if(typeof r?.name!=='string'||typeof r?.phone!=='string')continue;const a=document.createElement('a');a.textContent=`${r.name} · ${r.phone}`;a.href=`tel:${r.phone.replace(/[^\d+]/g,'')}`;resources.append(a);}
    }catch{if(alive)messages.push({role:'assistant',text:'暂时连接不上 Nuo，稍后再试试。你刚才说的话保留在这次聊天记录里。'});}
    finally{thinking=false;if(alive)render();}
  };
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}};
  function sizeInput(){input.style.height='42px';input.style.height=`${Math.min(84,Math.max(42,input.scrollHeight))}px`;}
  input.addEventListener('input',sizeInput);
  const anchor=new Vector3();
  return {
    open(prefill=''){hooks.closePanel();dock.hidden=false;notification.hidden=false;root.dataset.chatting='true';if(prefill)input.value=prefill;render();sizeInput();input.focus({preventScroll:true});},
    close,isOpen:()=>!dock.hidden,
    layout(camera:Camera,width:number,height:number){
      if(dock.hidden)return;anchor.set(.14,.86,0).project(camera);
      const headX=(anchor.x*.5+.5)*width,headY=(-anchor.y*.5+.5)*height;
      const bounds=chatLayout(width,height,headX,headY,dock.offsetHeight,notification.offsetHeight);
      dock.style.width=`${bounds.dock.width}px`;dock.style.left=`${bounds.dock.left}px`;dock.style.top=`${bounds.dock.top}px`;
      notification.style.width=`${bounds.bubble.width}px`;notification.style.left=`${bounds.bubble.left}px`;notification.style.top=`${bounds.bubble.top}px`;
      notification.style.setProperty('--tail-left',`${bounds.tail}px`);
      motionButtons.forEach(b=>b.disabled=!hooks.canAnimate());
    },
    dispose(){alive=false;input.blur();abort.abort();dock.remove();notification.remove();}
  };
}
