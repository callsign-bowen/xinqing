import { AnimationMixer, LoopOnce, LoopRepeat, type AnimationAction, type AnimationClip, type Object3D } from 'three';

interface DogGreetingOptions {
  reducedMotion?: boolean;
  autoGreet?: boolean;
  /** Request a render when a gesture or a preference change starts motion. */
  onWake?: () => void;
}

const FADE_SECONDS = .22;

/** Play the supplied rig's clips without changing the dog's mesh or bone design. */
export function createDogGreeting(root: Object3D, clips: AnimationClip[], options: DogGreetingOptions = {}) {
  const mixer = new AnimationMixer(root);
  const idleClip = clips.find(clip => /^idle$/i.test(clip.name)) ?? clips.find(clip => /idle|breath|待机/i.test(clip.name));
  const waveClip = clips.find(clip => /^wave$/i.test(clip.name)) ?? clips.find(clip => /wave|greet|招手|招呼/i.test(clip.name));
  const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
  const wave = waveClip && waveClip !== idleClip ? mixer.clipAction(waveClip) : undefined;
  const fading = new Map<AnimationAction, number>();
  let reduced = options.reducedMotion ?? false;
  let autoPending = (options.autoGreet ?? true) && !reduced;
  let active: AnimationAction | undefined;
  let finishedWave = false;
  let disposed = false;

  function applyIdlePose() {
    mixer.stopAllAction();
    fading.clear();
    finishedWave = false;
    active = idle;
    if (!idle) return;
    idle.reset().setLoop(LoopRepeat, Infinity).setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    // Even when motion is reduced, sample the relaxed rig immediately, before the
    // asset can be rendered. Stopping the mixer alone would leave its bind pose.
    idle.paused = reduced;
    mixer.update(0);
  }

  function transition(next: AnimationAction) {
    const previous = active;
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    fading.delete(next);
    if (previous && previous !== next) {
      next.crossFadeFrom(previous, FADE_SECONDS, false);
      fading.set(previous, mixer.time + FADE_SECONDS);
    }
    active = next;
  }

  // Do not activate/reset an action inside AnimationMixer's sampling loop. The
  // final Wave sample must still contribute its full pose on the finishing frame.
  function finished(event: { action: AnimationAction }) {
    if (!disposed && event.action === wave && active === wave) finishedWave = true;
  }

  mixer.addEventListener('finished', finished);
  applyIdlePose();

  function greet(): boolean {
    if (disposed || reduced || !idle || !wave || active === wave || fading.has(wave)) return false;
    autoPending = false;
    finishedWave = false;
    wave.setLoop(LoopOnce, 1);
    wave.clampWhenFinished = true;
    transition(wave);
    options.onWake?.();
    return true;
  }

  return {
    update(dt: number): void {
      if (disposed || reduced) return;
      if (autoPending) { autoPending = false; greet(); }
      // Returning to a visible tab must not fast-forward the entire greeting.
      const step = Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0;
      mixer.update(step);
      if (finishedWave) {
        finishedWave = false;
        if (idle && active === wave) transition(idle);
      }
      fading.forEach((until, action) => {
        if (mixer.time >= until && action.getEffectiveWeight() < .001) {
          action.stop();
          fading.delete(action);
        }
      });
    },
    greet,
    setReducedMotion(value: boolean): void {
      if (disposed || value === reduced) return;
      reduced = value;
      autoPending = false;
      applyIdlePose();
      options.onWake?.();
    },
    isActive: (): boolean => !disposed && !reduced && !!active,
    current: (): string => disposed ? '' : active?.getClip().name ?? '',
    dispose(): void {
      if (disposed) return;
      disposed = true;
      autoPending = false;
      finishedWave = false;
      mixer.removeEventListener('finished', finished);
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      fading.clear();
      active = undefined;
    }
  };
}
