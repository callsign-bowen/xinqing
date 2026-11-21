import { AnimationMixer, LoopOnce, type AnimationClip, type AnimationAction, type Object3D } from 'three';

/** One gesture at a time. A fading gesture finishing must not interrupt its replacement. */
export function createCompanionMotion(root: Object3D, clips: AnimationClip[], reduced: boolean) {
  const mixer = new AnimationMixer(root);
  const idleClip = clips.find(clip => /idle|breath|待机/i.test(clip.name));
  const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
  const fading = new Set<AnimationAction>();
  let active = idle;
  if (!reduced) idle?.play();
  const duration = .34;
  function transition(next: AnimationAction) {
    const previous = active;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    fading.delete(next);
    if (previous && previous !== next) {
      next.crossFadeFrom(previous, duration, false);
      fading.add(previous);
    } else next.fadeIn(duration);
    active = next;
  }
  const finished = (event: { action: AnimationAction }) => {
    if (event.action !== active || active === idle) return;
    if (idle) transition(idle);
    else { active.fadeOut(duration); fading.add(active); active = undefined; }
  };
  mixer.addEventListener('finished', finished);
  return {
    play(name: string) {
      if (reduced) return;
      const clip = clips.find(clip => clip.name === name);
      if (!clip || (active?.getClip() === clip && active.isRunning())) return;
      const next = mixer.clipAction(clip);
      next.setLoop(LoopOnce, 1); next.clampWhenFinished = true;
      transition(next);
    },
    update(dt: number) {
      if (reduced) return;
      mixer.update(dt);
      fading.forEach(action => { if (action.getEffectiveWeight() < .001) { action.stop(); fading.delete(action); } });
    },
    current: () => active?.getClip().name,
    dispose() { mixer.removeEventListener('finished', finished); mixer.stopAllAction(); mixer.uncacheRoot(root); fading.clear(); }
  };
}
