/**
 * 月面宇航员的“小脑袋”：决定他现在在做什么，并在 Blender 做好的动作之间平滑切换。
 * 动作来自 public/models/lunar-astronaut-actions.glb（tools/blender/astronaut_actions.py 生成）。
 *
 * 状态：
 *   待机   Idle 循环，每 10～20 秒随机来一个小动作（看地球、看表、伸懒腰、拍头盔、踢月尘）
 *   聊天   你在打字 → Listen；等回复 → Think；回复出来 → Talk 一会儿，再回待机
 *   遨游   不聊天时每 20～40 秒：蹬地起跳 → 漂浮着沿弧线飘到营地附近另一个点 → 落地缓冲
 *   被戳   戳头盔 / 戳身体 / 戳手（击掌）各有反应；飘在空中被戳会在空中转一圈；3 秒内连戳 3 下会假装生气
 *   赶路   点地面上的某个位置，他立刻飘过去（比闲逛快），到了就把那里当成新的“家”，聊天时也待在那儿
 */
import * as THREE from 'three';

export type ChatMood = 'idle' | 'listen' | 'think' | 'talk';

export interface AstronautBrain {
  update(time: number): void;
  greet(): void;
  /** 被戳到的位置（世界坐标）。返回这次的反应名，方便调试。 */
  poke(point: THREE.Vector3): string;
  setChat(mood: ChatMood): void;
  /** 让他赶往地面上的某一点；返回 false 表示太近或不能去 */
  goTo(point: THREE.Vector3): boolean;
  /** 是否还在去目的地的路上（起跳 / 飞行 / 落地） */
  traveling(): boolean;
  /** 现在在做什么：给表情用 */
  activity(): { clip: string; elapsed: number; mood: ChatMood; spinning: boolean };
  dispose(): void;
}

const FIDGETS = ['Idle_LookEarth', 'Idle_CheckWrist', 'Idle_Stretch', 'Idle_PatHelmet', 'Idle_KickDust'];
const LOOPS = new Set(['Idle', 'Listen', 'Think', 'Talk', 'Float_Loop']);
const FLOAT_SPEED = .55;      // 米/秒（自己闲逛）
const RUSH_SPEED = 1.1;       // 米/秒（你点了地面让他赶过去）
const FLOAT_HEIGHT = .75;     // 弧线最高处离地
const TURN_SPEED = 3.2;       // 转身的快慢

type Phase =
  | { kind: 'ground' }
  | { kind: 'oneshot'; name: string; until: number }
  | { kind: 'takeoff'; until: number; from: THREE.Vector3; to: THREE.Vector3; speed: number }
  | { kind: 'travel'; start: number; duration: number; from: THREE.Vector3; to: THREE.Vector3; height: number; spin?: { start: number } }
  | { kind: 'land'; until: number };

export function createAstronautBrain(options: {
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** 地面（用来量落点高度） */
  ground: THREE.Object3D;
  /** 相机位置：聊天和被戳时转身面向你 */
  camera: THREE.Vector3;
  /** 营地附近可以飘过去的落点（x, z），第一个是“家” */
  spots: Array<[number, number]>;
}): AstronautBrain {
  const { root } = options;
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of options.clips) {
    const action = mixer.clipAction(clip);
    if (!LOOPS.has(clip.name)) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
    actions.set(clip.name, action);
  }
  const clipLength = (name: string) => actions.get(name)?.getClip().duration ?? 1;

  const ray = new THREE.Raycaster();
  const groundY = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, 6, z), new THREE.Vector3(0, -1, 0));
    return (ray.intersectObject(options.ground, true)[0]?.point.y ?? 0) + .012;
  };
  const spots = options.spots.map(([x, z]) => new THREE.Vector3(x, groundY(x, z), z));
  const home = spots[0].clone();
  let userUntil = -Infinity; // 你指挥过以后，这段时间里他不自己乱跑

  let current: THREE.AnimationAction | undefined;
  let activityClip = 'Idle', activityStart = 0;
  let phase: Phase = { kind: 'ground' };
  let mood: ChatMood = 'idle';
  let moodSince = 0;
  let talkUntil = 0;
  let nextFidget = 6 + Math.random() * 6;
  let nextWander = 18 + Math.random() * 12;
  let lastTime = 0;
  let yaw = root.rotation.y;
  let targetYaw = yaw;
  let spinOffset = 0;
  const pokes: number[] = [];
  // 手掌判定点：手腕 + 中指根。这个小人的手套很大，只看手腕会漏掉戳在手指上的情况。
  const handBones = ['LeftHand', 'RightHand', 'LeftHandMiddle1', 'RightHandMiddle1']
    .map(name => root.getObjectByName(`mixamorig${name}`) ?? root.getObjectByName(`mixamorig:${name}`))
    .filter(Boolean) as THREE.Object3D[];

  function play(name: string, fade = .35) {
    const next = actions.get(name);
    if (!next) return;
    if (next === current && LOOPS.has(name)) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (current && current !== next) current.crossFadeTo(next, fade, false);
    current = next;
    activityClip = name; activityStart = lastTime;
  }

  /** 地面上的“底色”动作：聊天状态优先，其次待机。 */
  function baseClip(time: number): string {
    if (mood === 'talk' && time > talkUntil) { mood = 'idle'; moodSince = time; }
    return mood === 'listen' ? 'Listen' : mood === 'think' ? 'Think' : mood === 'talk' ? 'Talk' : 'Idle';
  }

  function faceCamera() {
    targetYaw = Math.atan2(options.camera.x - root.position.x, options.camera.z - root.position.z);
  }

  /** 弧线高度：近的地方小跳，远的地方飘得高一些 */
  function arcHeight(from: THREE.Vector3, to: THREE.Vector3) {
    return THREE.MathUtils.clamp(from.distanceTo(to) * .28, .3, FLOAT_HEIGHT);
  }

  function travelFor(from: THREE.Vector3, to: THREE.Vector3, speed: number) {
    return Math.max(1.1, from.distanceTo(to) / speed);
  }

  function startTravel(time: number, to: THREE.Vector3, speed = FLOAT_SPEED) {
    phase = { kind: 'takeoff', until: time + (speed > FLOAT_SPEED ? .45 : .62), from: root.position.clone(), to: to.clone(), speed };
    play('Float_JumpOff', .25);
    targetYaw = Math.atan2(to.x - root.position.x, to.z - root.position.z);
  }

  function atHome() { return root.position.distanceTo(home) < .3; }

  function oneshot(time: number, name: string, fade = .2) {
    phase = { kind: 'oneshot', name, until: time + clipLength(name) - .15 };
    play(name, fade);
  }

  function wrapAngle(a: number) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  function update(time: number) {
    const dt = Math.max(0, Math.min(time - lastTime, .1));
    lastTime = time;

    switch (phase.kind) {
      case 'ground': {
        const base = baseClip(time);
        if (mood !== 'idle') {
          // 聊天时：不在家就先飘回来，在家就面向你
          if (!atHome()) { startTravel(time, home); break; }
          faceCamera();
          play(base);
          nextFidget = time + 8 + Math.random() * 8;
          nextWander = time + 25 + Math.random() * 15;
          break;
        }
        play(base);
        if (time > nextWander && time - moodSince > 12 && time > userUntil) {
          const choices = spots.filter(spot => spot.distanceTo(root.position) > .5);
          // 离家时更愿意飘回家
          const to = !atHome() && Math.random() < .6 ? home : choices[Math.floor(Math.random() * choices.length)];
          nextWander = time + 20 + Math.random() * 20;
          if (to) startTravel(time, to);
        } else if (time > nextFidget) {
          nextFidget = time + 10 + Math.random() * 10;
          oneshot(time, FIDGETS[Math.floor(Math.random() * FIDGETS.length)], .45);
        }
        break;
      }
      case 'oneshot':
        if (time >= phase.until) {
          phase = { kind: 'ground' };
          play(baseClip(time), .4);
        }
        break;
      case 'takeoff':
        if (time >= phase.until) {
          const distance = phase.from.distanceTo(phase.to);
          phase = { kind: 'travel', start: time, duration: Math.max(1.1, distance / phase.speed), from: phase.from, to: phase.to, height: arcHeight(phase.from, phase.to) };
          play('Float_Loop', .35);
        }
        break;
      case 'travel': {
        const s = Math.min(1, (time - phase.start) / phase.duration);
        const e = s * s * (3 - 2 * s);
        root.position.lerpVectors(phase.from, phase.to, e);
        root.position.y += Math.sin(Math.PI * s) * (phase.height + .08 * Math.sin(time * 1.7));
        if (phase.spin) {
          // 被戳：在空中慢悠悠转一整圈
          const k = Math.min(1, (time - phase.spin.start) / 1.6);
          spinOffset = Math.PI * 2 * (k * k * (3 - 2 * k));
          if (k >= 1) { phase.spin = undefined; spinOffset = 0; play('Float_Loop', .4); }
        }
        if (s >= 1) {
          phase = { kind: 'land', until: time + clipLength('Float_Land') - .1 };
          play('Float_Land', .2);
        }
        break;
      }
      case 'land':
        if (time >= phase.until) {
          phase = { kind: 'ground' };
          // 聊天中、或者是你叫他过来的：落地后转身面向你
          if (mood !== 'idle' || time < userUntil) faceCamera(); else targetYaw = yaw + (Math.random() - .5) * .6;
          play(baseClip(time), .4);
        }
        break;
    }

    // 平滑转身；空中被戳的那一圈叠加在朝向上
    yaw += wrapAngle(targetYaw - yaw) * Math.min(1, dt * TURN_SPEED);
    root.rotation.set(0, yaw + spinOffset, 0);
    mixer.update(dt);
  }

  function poke(point: THREE.Vector3): string {
    const time = lastTime;
    // 漂浮中被戳：翻个跟头，继续飘
    if (phase.kind === 'travel') {
      phase.spin = { start: time };
      play('Poke_Spin', .15);
      return 'Poke_Spin';
    }
    if (phase.kind !== 'ground' && phase.kind !== 'oneshot') return '';
    // 正在“生气”：再戳也不理，等他自己回头和好
    if (phase.kind === 'oneshot' && phase.name === 'Poke_Pout') return '';
    pokes.push(time);
    while (pokes.length && time - pokes[0] > 3) pokes.shift();
    faceCamera();
    let name: string;
    if (pokes.length >= 3) {
      name = 'Poke_Pout';
      pokes.length = 0;
    } else {
      const local = root.worldToLocal(point.clone());
      const nearHand = handBones.some(bone => bone.getWorldPosition(new THREE.Vector3()).distanceTo(point) < .16);
      name = nearHand ? 'Poke_HighFive' : local.y > .52 ? 'Poke_Head' : 'Poke_Body'; // 头盔从模型高度 0.52 往上
    }
    oneshot(time, name, .12);
    nextFidget = time + 10 + Math.random() * 8;
    return name;
  }

  function goTo(point: THREE.Vector3): boolean {
    const time = lastTime;
    const to = new THREE.Vector3(point.x, groundY(point.x, point.z), point.z);
    const flat = Math.hypot(to.x - root.position.x, to.z - root.position.z);
    home.copy(to);
    userUntil = time + 90;
    nextWander = time + 90;
    if (phase.kind === 'travel' || phase.kind === 'takeoff') {
      // 半路改主意：从空中当前位置直接改飞新目标
      const from = root.position.clone();
      phase = { kind: 'travel', start: time, duration: travelFor(from, to, RUSH_SPEED), from, to, height: Math.max(.15, arcHeight(from, to) * .6) };
      play('Float_Loop', .3);
      targetYaw = Math.atan2(to.x - from.x, to.z - from.z);
      return true;
    }
    if (flat < .35) { faceCamera(); return false; }
    startTravel(time, to, RUSH_SPEED);
    return true;
  }

  play('Idle', 0);
  return {
    goTo,
    traveling: () => phase.kind === 'takeoff' || phase.kind === 'travel' || phase.kind === 'land',
    activity: () => ({ clip: activityClip, elapsed: lastTime - activityStart, mood, spinning: phase.kind === 'travel' && Boolean(phase.spin) }),
    update,
    greet() {
      if (phase.kind === 'ground' || phase.kind === 'oneshot') { faceCamera(); oneshot(lastTime, 'Wave', .25); }
    },
    poke,
    setChat(next) {
      if (next === mood && next !== 'talk') return;
      if (next === 'idle' && mood === 'talk' && lastTime < talkUntil) return; // 话还没说完
      mood = next; moodSince = lastTime;
      if (next === 'talk') talkUntil = lastTime + 6;
      if (phase.kind === 'ground' && next !== 'idle' && atHome()) { faceCamera(); play(baseClip(lastTime), .4); }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}
