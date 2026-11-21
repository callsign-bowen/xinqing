import * as THREE from 'three';

export const sceneInputSelector = 'button,a,input,textarea,select,summary,[contenteditable="true"],[role="button"],.ai-messages,.ai-input-area,.ai-header,.ai-action-row,.ambient-controls,.ambient-speech';
export const isSceneBackground = (target: EventTarget | null) => !(target instanceof Element) || !target.closest(sceneInputSelector);

interface EmbeddedOptions {
  camera: THREE.Camera;
  character(): THREE.Object3D | undefined;
  height: number;
  rotate(dx: number, dy: number): void;
  reset(): void;
  greet(): void;
  active(value: boolean): void;
}

/** Only camera/character events cross the same-origin frame; chat stays in the main page. */
export function createEmbeddedSceneBridge(options: EmbeddedOptions) {
  const embedded = window.parent !== window && new URLSearchParams(location.search).get('ambient') === '1';
  const lifetime = new AbortController(), projected = new THREE.Vector3();
  const send = (type: string, detail: Record<string, unknown> = {}) => {
    if (embedded) window.parent.postMessage({ type: `nuo-scene:${type}`, ...detail }, location.origin);
  };
  if (embedded) window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'nuo-scene:command') return;
    const data = event.data;
    if (data.command === 'active') options.active(data.value === true);
    if (data.command === 'reset') options.reset();
    if (data.command === 'greet') options.greet();
    if (data.command === 'rotate' && Number.isFinite(data.dx) && Number.isFinite(data.dy)) options.rotate(THREE.MathUtils.clamp(data.dx,-1,1),THREE.MathUtils.clamp(data.dy,-1,1));
    if (data.command === 'tap' && Number.isFinite(data.x) && Number.isFinite(data.y) && Math.abs(data.x) <= 1 && Math.abs(data.y) <= 1) {
      const character = options.character(); if (!character) return;
      const ray = new THREE.Raycaster(); options.camera.updateMatrixWorld(true); character.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2(data.x, data.y), options.camera);
      if (ray.intersectObject(character,true).length) { options.greet(); send('activate'); }
    }
  }, { signal: lifetime.signal });
  return {
    embedded,
    ready() { send('ready'); },
    error() { send('error'); },
    anchor() {
      if (!embedded) return;
      const character = options.character(); if (!character) return;
      projected.set(0, options.height * .88, 0).applyMatrix4(character.matrixWorld).project(options.camera);
      send('anchor', { x: (projected.x+1)/2, y: (1-projected.y)/2, visible: Math.abs(projected.x)<1 && Math.abs(projected.y)<1 && Math.abs(projected.z)<1 });
    },
    dispose() { lifetime.abort(); }
  };
}
