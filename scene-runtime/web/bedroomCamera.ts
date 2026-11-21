import { MathUtils, PerspectiveCamera, Quaternion, Vector3, Euler } from 'three';

/** Eye-level camera. Dragging turns the viewer's head without orbiting the room. */
export function createRoomCamera(camera:PerspectiveCamera,canvas:HTMLCanvasElement,reduced:boolean){
  const destination=new Vector3(),destinationRotation=new Quaternion(),euler=new Euler(0,0,0,'YXZ');
  let transitioning=false,dragging=false,lastX=0,lastY=0,yaw=0,pitch=0;
  const view=(position:[number,number,number],target:[number,number,number],immediate=false)=>{
    destination.set(...position);const previous=camera.position.clone(),rotation=camera.quaternion.clone();
    camera.position.copy(destination);camera.lookAt(new Vector3(...target));destinationRotation.copy(camera.quaternion);
    if(immediate||reduced){transitioning=false;sync();}else{camera.position.copy(previous);camera.quaternion.copy(rotation);transitioning=true;}
  };
  function sync(){euler.setFromQuaternion(camera.quaternion,'YXZ');yaw=euler.y;pitch=euler.x;}
  function resize(){
    const mobile=canvas.clientWidth<600;
    camera.fov=mobile?(canvas.clientHeight<520?62:70):62;
    camera.near=.04;camera.updateProjectionMatrix();
  }
  function reset(entrance=false){
    const mobile=canvas.clientWidth<600;
    resize();
    const position:[number,number,number]=mobile?[.42,1.28,2.08]:[.65,1.35,1.88];
    const target:[number,number,number]=mobile?[-.05,1.02,-1.25]:[-.25,1.05,-1.5];
    if(entrance&&!reduced){camera.position.set(position[0]+.08,position[1]+.04,position[2]+.1);camera.lookAt(...target);}
    view(position,target,!entrance);
  }
  function down(e:PointerEvent){if(e.pointerType==='mouse'&&e.button!==0)return;dragging=true;transitioning=false;sync();lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);}
  function move(e:PointerEvent){if(!dragging)return;yaw-=(e.clientX-lastX)*.0035;pitch-=(e.clientY-lastY)*.0028;pitch=MathUtils.clamp(pitch,-.78,.6);lastX=e.clientX;lastY=e.clientY;camera.quaternion.setFromEuler(euler.set(pitch,yaw,0,'YXZ'));}
  function up(){dragging=false;}
  function key(e:KeyboardEvent){const target=e.target as HTMLElement;if(['INPUT','TEXTAREA','BUTTON'].includes(target.tagName))return;const delta=.09;if(e.key==='ArrowLeft')yaw+=delta;else if(e.key==='ArrowRight')yaw-=delta;else if(e.key==='ArrowUp')pitch=Math.min(.6,pitch+delta);else if(e.key==='ArrowDown')pitch=Math.max(-.78,pitch-delta);else return;e.preventDefault();transitioning=false;camera.quaternion.setFromEuler(euler.set(pitch,yaw,0,'YXZ'));}
  canvas.tabIndex=0;canvas.style.touchAction='none';canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('keydown',key);
  return {reset,resize,turn(dx:number,dy:number){transitioning=false;sync();yaw-=dx*Math.PI;pitch=MathUtils.clamp(pitch-dy*Math.PI*.8,-1.43,1.43);camera.quaternion.setFromEuler(euler.set(pitch,yaw,0,'YXZ'));},focus(action:string){
    const views:Record<string,[[number,number,number],[number,number,number]]>={
      nuo:[[.4,1.03,1.95],[.14,.59,0]],journal:[[.2,1.3,.6],[1.0,1.4,-1.5]],photos:[[0,1.45,.6],[-1.3,2.1,-1.97]],
      dog:[[1,.95,.95],[.55,.7,-.75]],
      window:[[.4,1.45,.7],[.65,1.96,-2.1]],plant:[[.1,1.1,1.6],[1.32,.6,.83]],bed:[[.65,1.4,1.1],[-1.25,.9,-.4]],lamp:[[.6,1.1,1.1],[-.04,1.04,-.69]],board:[[.15,1.48,.6],[2.465,1.72,-.12]]
    };if(views[action])view(...views[action]);
  },update(dt:number){if(!transitioning)return;const t=1-Math.exp(-dt*3.3);camera.position.lerp(destination,t);camera.quaternion.slerp(destinationRotation,t);if(camera.position.distanceToSquared(destination)<.000002&&camera.quaternion.angleTo(destinationRotation)<.002){camera.position.copy(destination);camera.quaternion.copy(destinationRotation);transitioning=false;sync();}},dispose(){canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('keydown',key);}};
}
