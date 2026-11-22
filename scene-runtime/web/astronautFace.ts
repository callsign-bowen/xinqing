/**
 * 宇航员的表情：在 Blender 做好的脸部贴片（Astronaut_Face，绑在头骨上）上，用画布实时画五官。
 * 画风照着原模型：大大的黑眼睛 + 白色高光、毛笔一样的细眉毛、小嘴、粉色腮红。
 *
 * 表情跟着他正在做的事走（astronautBrain 的 activity），另外一直有：随机眨眼、眼珠小幅转动、说话时嘴巴一张一合。
 * 画布坐标和 tools/blender/astronaut_actions.py 里的 FACE_X / FACE_Z 对应（512 × 336，原图五官位置量出来的）。
 */
import * as THREE from 'three';

export interface FaceActivity {
  /** 正在播放的动作名（Idle / Poke_Head / Float_Loop …） */
  clip: string;
  /** 这个动作开始了多少秒 */
  elapsed: number;
  /** 聊天状态 */
  mood: 'idle' | 'listen' | 'think' | 'talk';
  /** 空中被戳正在转圈 */
  spinning: boolean;
}

export interface AstronautFace {
  update(time: number, activity: FaceActivity): void;
  /** 当前表情名（调试用） */
  expression(): string;
  dispose(): void;
}

type EyeStyle = 'round' | 'happy' | 'closed' | 'squint' | 'spiral' | 'star';
type MouthShape = 'smile' | 'o' | 'flat' | 'wavy' | 'pout' | 'grin';

interface Expression {
  eye: EyeStyle;
  pupil: number;        // 眼睛大小倍数
  gazeX: number;        // -1 左 … 1 右（画面方向）
  gazeY: number;        // -1 上 … 1 下
  browL: number;        // 眉毛抬高（像素，正 = 往上）
  browR: number;
  browTilt: number;     // 正 = 眉头上扬（委屈 / 惊讶），负 = 眉头压低（生气）
  mouth: MouthShape;
  open: number;         // 嘴张开 0…1
  width: number;        // 嘴宽倍数
  curve: number;        // -1 撇嘴 … 1 笑
  blush: number;        // 腮红 0…1.5
  sparkle: boolean;     // 眼里有星星
  sweat: boolean;       // 汗滴
  talk: boolean;        // 嘴一张一合
}

const BASE: Expression = {
  eye: 'round', pupil: 1, gazeX: 0, gazeY: 0, browL: 0, browR: 0, browTilt: 0,
  mouth: 'smile', open: .42, width: 1, curve: .8, blush: .8, sparkle: false, sweat: false, talk: false,
};
const E = (patch: Partial<Expression>): Expression => ({ ...BASE, ...patch });

/** 表情库 */
export const EXPRESSIONS: Record<string, Expression> = {
  happy: E({}),
  calm: E({ open: 0, curve: .7, width: .8 }),
  listen: E({ pupil: 1.06, browL: 6, browR: 9, browTilt: 3, open: 0, curve: .5, width: .75 }),
  think: E({ gazeX: .45, gazeY: -.45, browL: -2, browR: 10, mouth: 'wavy', open: 0, width: .6, curve: 0 }),
  talk: E({ talk: true, open: .45, curve: .7 }),
  surprised: E({ pupil: .82, browL: 13, browR: 13, browTilt: 6, mouth: 'o', open: .85, width: .7, blush: .6, sweat: true }),
  laugh: E({ eye: 'happy', mouth: 'grin', open: .95, width: 1.15, curve: 1, blush: 1.4, browL: 5, browR: 5 }),
  excited: E({ eye: 'star', sparkle: true, mouth: 'grin', open: .8, width: 1.1, curve: 1, blush: 1.2, browL: 8, browR: 8 }),
  pout: E({ eye: 'squint', gazeX: -.5, browL: -4, browR: -4, browTilt: -16, mouth: 'pout', open: 0, width: .55, curve: -.7, blush: 1.5 }),
  sleepy: E({ eye: 'closed', mouth: 'o', open: .7, width: .75, browL: 4, browR: 4, browTilt: 4, blush: .9 }),
  wow: E({ gazeY: -.6, gazeX: .2, sparkle: true, browL: 9, browR: 9, mouth: 'o', open: .4, width: .55, blush: 1 }),
  lookDown: E({ gazeY: .6, gazeX: -.25, open: 0, curve: .55, width: .75 }),
  dizzy: E({ eye: 'spiral', mouth: 'wavy', open: .25, width: .8, curve: 0, blush: 1, browTilt: 6 }),
  flying: E({ eye: 'happy', mouth: 'grin', open: .6, curve: 1, blush: 1.1 }),
  jump: E({ eye: 'squint', mouth: 'flat', open: .1, width: .7, curve: .3, browL: -3, browR: -3, browTilt: -6 }),
  land: E({ eye: 'closed', mouth: 'flat', open: 0, width: .8, curve: .2 }),
}

/** 动作 → 表情 */
function pick(activity: FaceActivity): string {
  const { clip, elapsed, mood, spinning } = activity;
  if (spinning || clip === 'Poke_Spin') return 'dizzy';
  switch (clip) {
    case 'Poke_Head': return elapsed < 2.0 ? 'surprised' : 'calm';
    case 'Poke_Body': return 'laugh';
    case 'Poke_HighFive': return 'excited';
    case 'Poke_Pout': return elapsed < 3.7 ? 'pout' : 'happy';
    case 'Wave': return 'happy';
    case 'Idle_LookEarth': return elapsed > .5 && elapsed < 3.4 ? 'wow' : 'happy';
    case 'Idle_CheckWrist': return elapsed > .5 && elapsed < 3 ? 'lookDown' : 'calm';
    case 'Idle_KickDust': return elapsed > .3 && elapsed < 2.4 ? 'lookDown' : 'calm';
    case 'Idle_Stretch': return elapsed > .7 && elapsed < 2.8 ? 'sleepy' : 'calm';
    case 'Idle_PatHelmet': return 'happy';
    case 'Float_JumpOff': return 'jump';
    case 'Float_Loop': return 'flying';
    case 'Float_Land': return elapsed < .6 ? 'land' : 'happy';
    case 'Listen': return 'listen';
    case 'Think': return 'think';
    case 'Talk': return 'talk';
  }
  if (mood === 'talk') return 'talk';
  // 平时待机：开心和安静两种，慢慢换
  return Math.floor(elapsed / 9) % 2 ? 'calm' : 'happy';
}

// ---------- 画布布局（512 × 336，原图五官量出来的位置） ----------
const W = 512, H = 336, SS = 2; // 画两倍大，贴到模型上更清楚
const SKIN = '#f5e9db';
const INK = '#151216';
const EYE_L = { x: 118, y: 186 }, EYE_R = { x: 386, y: 186 };
const EYE_RX = 43, EYE_RY = 53;
const BROW_Y = 50;
const MOUTH = { x: 255, y: 282 };
const BLUSH_L = { x: 72, y: 264 }, BLUSH_R = { x: 432, y: 264 };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function createAstronautFace(root: THREE.Object3D, maxAnisotropy = 4): AstronautFace | undefined {
  const mesh = root.getObjectByName('Astronaut_Face') as THREE.Mesh | undefined;
  if (!mesh || !(mesh instanceof THREE.Mesh)) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = W * SS; canvas.height = H * SS;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  const old = mesh.material as THREE.MeshStandardMaterial;
  const material = new THREE.MeshStandardMaterial({
    map: texture, transparent: true, roughness: .55, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  material.envMapIntensity = old?.envMapIntensity ?? 1;
  mesh.material = material;
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  old?.map?.dispose(); old?.dispose();

  // 平滑过渡用的“当前值”
  const cur: Expression = { ...EXPRESSIONS.happy };
  let currentName = 'happy';
  let lastTime = 0, lastDraw = -1;
  let nextBlink = 2 + Math.random() * 3, blinkStart = -1, doubleBlink = false;
  let nextGlance = 1.5, glanceX = 0, glanceY = 0;

  function blend(target: Expression, k: number) {
    for (const key of ['pupil', 'gazeX', 'gazeY', 'browL', 'browR', 'browTilt', 'open', 'width', 'curve', 'blush'] as const) {
      cur[key] = lerp(cur[key], target[key], k);
    }
    // 形状类的直接换（换的时候本来就伴随眨眼 / 张合，不显突兀）
    cur.eye = target.eye; cur.mouth = target.mouth; cur.sparkle = target.sparkle; cur.sweat = target.sweat; cur.talk = target.talk;
  }

  // ---------- 画五官 ----------
  /** 毛笔笔触：沿折线算出两侧轮廓，填成一个中间粗、两头尖的形状。 */
  function brush(points: Array<[number, number]>, width: number) {
    const n = points.length;
    if (n < 2) return;
    const left: Array<[number, number]> = [], right: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const [x0, y0] = points[Math.max(0, i - 1)], [x1, y1] = points[Math.min(n - 1, i + 1)];
      let nx = -(y1 - y0), ny = x1 - x0;
      const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      const t = i / (n - 1);
      const w = width * (.18 + .82 * Math.sin(Math.PI * t)) / 2;
      left.push([points[i][0] + nx * w, points[i][1] + ny * w]);
      right.push([points[i][0] - nx * w, points[i][1] - ny * w]);
    }
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left.slice(1)) ctx.lineTo(x, y);
    for (const [x, y] of right.reverse()) ctx.lineTo(x, y);
    ctx.closePath(); ctx.fill();
  }

  function arcPoints(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n = 16): Array<[number, number]> {
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = from + (to - from) * i / n;
      return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number];
    });
  }

  function drawEye(cx: number, cy: number, side: -1 | 1, open: number) {
    const rx = EYE_RX * cur.pupil, ry = EYE_RY * cur.pupil;
    const gx = cur.gazeX * 9 + glanceX, gy = cur.gazeY * 9 + glanceY;
    switch (cur.eye) {
      case 'happy': // ^ ^
        brush(arcPoints(cx, cy + 18, rx * .95, ry * .75, Math.PI * 1.1, Math.PI * 1.9), 13);
        return;
      case 'closed':
        brush(arcPoints(cx, cy - 6, rx * .9, ry * .45, Math.PI * .1, Math.PI * .9), 11);
        return;
      case 'spiral': {
        ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath();
        for (let a = 0; a < Math.PI * 6; a += .15) {
          const r = a / (Math.PI * 6) * rx * .9;
          const x = cx + Math.cos(a + lastTime * 6 * side) * r, y = cy + Math.sin(a + lastTime * 6 * side) * r * 1.1;
          if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }
    }
    // 圆眼 / 眯眼 / 星星眼：画完整的眼珠，上眼皮从上往下盖（眨眼、眯眼都是眼皮往下）
    const squint = cur.eye === 'squint' ? .52 : 1;
    const o = Math.max(0, Math.min(1, open * squint));
    const lidY = cy - ry + 2 * ry * (1 - o);
    if (o > .04) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.beginPath(); ctx.rect(cx - rx - 2, lidY, rx * 2 + 4, ry * 2 + 4); ctx.clip();
      const grad = ctx.createRadialGradient(cx + gx - rx * .2, cy + gy - ry * .25, 4, cx + gx, cy + gy, ry * 1.1);
      grad.addColorStop(0, '#3a3440'); grad.addColorStop(.55, '#120f14'); grad.addColorStop(1, '#050406');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 2 + 4);
      if (cur.eye === 'star' || cur.sparkle) {
        star(cx + gx + rx * .28, cy + gy - ry * .3, rx * .42, '#ffffff');
        star(cx + gx - rx * .35, cy + gy + ry * .35, rx * .18, '#ffffffcc');
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(cx + gx + rx * .26, cy + gy - ry * .28, rx * .27, ry * .24, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffffb0';
        ctx.beginPath(); ctx.arc(cx + gx - rx * .3, cy + gy + ry * .38, rx * .1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // 眼线：睁开时是原图那种沿眼睛上沿的粗弧线；眼皮往下盖时变成眼皮边上一道略弯的线
    if (o > .9) {
      const lid = arcPoints(cx, cy, rx * 1.06, ry * 1.04, Math.PI * 1.06, Math.PI * 1.94);
      if (side === 1) lid.reverse();
      brush(lid, 11);
    } else {
      const dy = (lidY - cy) / ry;
      const half = rx * Math.sqrt(Math.max(.05, 1 - dy * dy)) * 1.12;
      const sag = cur.eye === 'squint' ? 2 + side * 0 : 6 * o; // 眯眼时眼皮平一点
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([cx - half + 2 * half * t, lidY - Math.sin(Math.PI * t) * sag + (cur.eye === 'squint' ? (t - .5) * 6 * -side : 0)]);
      }
      if (side === 1) pts.reverse();
      brush(pts, 10);
    }
  }

  function star(x: number, y: number, r: number, color: string) {
    ctx.fillStyle = color; ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 4 * i - Math.PI / 2, rr = i % 2 ? r * .38 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  function drawBrow(cx: number, lift: number, side: -1 | 1) {
    const y = BROW_Y - lift;
    const tilt = cur.browTilt * side * -1; // 眉头在靠近中间的一侧
    const inner = cx - side * 28, outer = cx + side * 26;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = lerp(outer, inner, t);
      const arch = -Math.sin(Math.PI * t) * 9;
      pts.push([x, y + arch + (t - .5) * tilt * -1]);
    }
    brush(pts, 9);
  }

  function drawMouth(time: number) {
    const { x, y } = MOUTH;
    let open = cur.open;
    if (cur.talk) {
      // 说话：随“音节”一张一合
      const s = Math.sin(time * 13) * .5 + Math.sin(time * 7.3 + 1) * .5;
      open = .12 + Math.max(0, s) * .55;
    }
    const w = 58 * cur.width;
    const curve = cur.curve;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (cur.mouth) {
      case 'o': {
        const rx = 16 + 10 * open, ry = 14 + 22 * open;
        ctx.fillStyle = '#5a1f22'; ctx.strokeStyle = INK; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.ellipse(x, y - 2, rx * cur.width, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ef8a86';
        ctx.beginPath(); ctx.ellipse(x, y + ry * .45, rx * .6 * cur.width, ry * .35, 0, 0, Math.PI * 2); ctx.fill();
        return;
      }
      case 'flat':
        brush([[x - w * .45, y], [x - w * .1, y + 2 * curve], [x + w * .1, y + 2 * curve], [x + w * .45, y]], 8);
        return;
      case 'wavy': {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([x - w * .5 + w * t, y + Math.sin(t * Math.PI * 3 + time * 2) * 5]); }
        brush(pts, 8);
        if (open > .1) { ctx.fillStyle = '#5a1f22'; ctx.beginPath(); ctx.ellipse(x, y + 8, w * .2, 10 * open, 0, 0, Math.PI * 2); ctx.fill(); }
        return;
      }
      case 'pout': {
        // 嘟嘴：小小的倒 V，嘴角往下
        brush([[x - w * .5, y + 10], [x - w * .2, y - 2], [x, y - 6], [x + w * .2, y - 2], [x + w * .5, y + 10]], 9);
        return;
      }
    }
    // 笑（smile / grin）：张开时画成原图那种半月形嘴 + 舌头
    if (open < .08) {
      brush(arcPoints(x, y - 18 * curve, w * .55, 22 * Math.max(.2, curve), Math.PI * .15, Math.PI * .85), 9);
      return;
    }
    const top = y - 14 * open, bottom = y + (14 + 30 * open) * (cur.mouth === 'grin' ? 1.15 : 1);
    const half = w * (cur.mouth === 'grin' ? .62 : .5);
    ctx.beginPath();
    ctx.moveTo(x - half, top);
    ctx.quadraticCurveTo(x, top - 6 * curve, x + half, top);
    ctx.quadraticCurveTo(x + half * .9, bottom, x, bottom);
    ctx.quadraticCurveTo(x - half * .9, bottom, x - half, top);
    ctx.closePath();
    ctx.fillStyle = '#4a1518'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#f08c84';
    ctx.beginPath(); ctx.ellipse(x, bottom + 4, half * .78, (bottom - top) * .48, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - half, top);
    ctx.quadraticCurveTo(x, top - 6 * curve, x + half, top);
    ctx.quadraticCurveTo(x + half * .9, bottom, x, bottom);
    ctx.quadraticCurveTo(x - half * .9, bottom, x - half, top);
    ctx.closePath(); ctx.stroke();
  }

  function drawBlush(cx: number, cy: number, amount: number) {
    if (amount <= .02) return;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34 + 6 * amount);
    g.addColorStop(0, `rgba(246, 150, 150, ${.55 * Math.min(1, amount)})`);
    g.addColorStop(1, 'rgba(246, 150, 150, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, cy, 40 + 6 * amount, 24 + 4 * amount, 0, 0, Math.PI * 2); ctx.fill();
    // 原图腮红上的三道小斜线
    ctx.strokeStyle = `rgba(214, 96, 104, ${.55 * Math.min(1, amount)})`; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 11 - 4, cy + 7); ctx.lineTo(cx + i * 11 + 4, cy - 7); ctx.stroke(); }
  }

  function drawSweat() {
    const x = 470, y = 70;
    ctx.fillStyle = '#9fd3f2'; ctx.strokeStyle = '#4a86b3'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.quadraticCurveTo(x + 16, y + 2, x, y + 10); ctx.quadraticCurveTo(x - 16, y + 2, x, y - 22);
    ctx.fill(); ctx.stroke();
  }

  function draw(time: number, blinkOpen: number) {
    ctx.setTransform(SS, 0, 0, SS, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 皮肤底色：椭圆，边缘羽化，和原来的脸自然接上
    ctx.save();
    ctx.fillStyle = SKIN;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.translate(W / 2, H * .5); ctx.scale(1, (H * .6) / (W * .5));
    const mask = ctx.createRadialGradient(0, 0, 0, 0, 0, W * .5);
    mask.addColorStop(0, '#000'); mask.addColorStop(.86, '#000'); mask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mask; ctx.beginPath(); ctx.arc(0, 0, W * .5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    drawBlush(BLUSH_L.x, BLUSH_L.y, cur.blush);
    drawBlush(BLUSH_R.x, BLUSH_R.y, cur.blush);
    drawEye(EYE_L.x, EYE_L.y, -1, blinkOpen);
    drawEye(EYE_R.x, EYE_R.y, 1, blinkOpen);
    drawBrow(EYE_L.x + 8, cur.browL, -1);
    drawBrow(EYE_R.x - 8, cur.browR, 1);
    drawMouth(time);
    if (cur.sweat) drawSweat();
    texture.needsUpdate = true;
  }

  function update(time: number, activity: FaceActivity) {
    const dt = Math.max(0, Math.min(.1, time - lastTime));
    lastTime = time;
    const name = pick(activity);
    currentName = name;
    blend(EXPRESSIONS[name] ?? EXPRESSIONS.happy, Math.min(1, dt * 9));
    // 眨眼：2～5 秒一次，偶尔连眨两下
    if (time > nextBlink && blinkStart < 0) { blinkStart = time; doubleBlink = Math.random() < .2; }
    let blinkOpen = 1;
    if (blinkStart >= 0) {
      const t = (time - blinkStart) / .16;
      blinkOpen = t < 0 || t >= 1 ? 1 : Math.abs(1 - 2 * t);
      if (t >= 1) {
        if (doubleBlink) { doubleBlink = false; blinkStart = time + .08; }
        else { blinkStart = -1; nextBlink = time + 2 + Math.random() * 3; }
      }
    }
    // 眼珠小幅乱看
    if (time > nextGlance) {
      nextGlance = time + 1.2 + Math.random() * 2.2;
      glanceX = (Math.random() - .5) * 8; glanceY = (Math.random() - .5) * 5;
    }
    // 画面 24 帧/秒，眨眼时每帧都画
    if (time - lastDraw >= 1 / 24 || blinkStart >= 0) { lastDraw = time; draw(time, blinkOpen); }
  }

  draw(0, 1);
  return {
    update,
    expression: () => currentName,
    dispose() { texture.dispose(); material.dispose(); },
  };
}
