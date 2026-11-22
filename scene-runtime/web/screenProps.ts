/**
 * 场景里“能播放东西的小物件”（电视、屏幕、投影幕…）。
 *
 * 任何场景只要登记一个 ScreenProp，就能：被点击 → 镜头飞到屏幕正前方 → 在屏幕上播放对话演绎。
 * 约定：frame 的本地 +Z 是屏幕正前方，本地 +Y 是屏幕的上方。
 */
import * as THREE from 'three';

export interface ScreenProp {
  id: string;
  /** 给人看的名字，如“电视” */
  label: string;
  /** 点击命中范围（整台电视） */
  hitTarget: THREE.Object3D;
  /** 屏幕网格 */
  screen: THREE.Mesh;
  /** 屏幕所在的机身，用它的朝向确定“屏幕正前方” */
  frame: THREE.Object3D;
  /** 开始 / 结束观看时，物件自己的反应（比如电视立刻锁定信号） */
  setWatching?(watching: boolean): void;
}

export interface ScreenRect { left: number; top: number; width: number; height: number }

interface ScreenBox { center: THREE.Vector3; normal: THREE.Vector3; up: THREE.Vector3; width: number; height: number; corners: THREE.Vector3[] }

/** 屏幕在机身坐标系里的包围盒，换回世界坐标。 */
export function screenBox(prop: ScreenProp): ScreenBox {
  prop.frame.updateWorldMatrix(true, true);
  const geometry = prop.screen.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const toFrame = new THREE.Matrix4().copy(prop.frame.matrixWorld).invert().multiply(prop.screen.matrixWorld);
  const local = geometry.boundingBox!.clone().applyMatrix4(toFrame);
  const size = local.getSize(new THREE.Vector3());
  const corners: THREE.Vector3[] = [];
  for (const x of [local.min.x, local.max.x]) for (const y of [local.min.y, local.max.y]) for (const z of [local.min.z, local.max.z]) {
    corners.push(new THREE.Vector3(x, y, z).applyMatrix4(prop.frame.matrixWorld));
  }
  const quaternion = prop.frame.getWorldQuaternion(new THREE.Quaternion());
  return {
    center: local.getCenter(new THREE.Vector3()).applyMatrix4(prop.frame.matrixWorld),
    normal: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion),
    width: size.x,
    height: size.y,
    corners,
  };
}

/** 观看位置：正对屏幕，屏幕约占画面的 fill 比例。 */
export function watchPose(prop: ScreenProp, fovDegrees: number, aspect: number, fill = .8): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const box = screenBox(prop);
  const vertical = THREE.MathUtils.degToRad(fovDegrees);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const distance = Math.max(
    box.height / fill / (2 * Math.tan(vertical / 2)),
    box.width / fill / (2 * Math.tan(horizontal / 2)),
  );
  const position = box.center.clone().addScaledVector(box.normal, distance);
  const look = new THREE.Matrix4().lookAt(position, box.center, box.up);
  return { position, quaternion: new THREE.Quaternion().setFromRotationMatrix(look) };
}

/** 屏幕在画面上的像素矩形，用来把演绎叠在屏幕上。 */
export function screenRect(prop: ScreenProp, camera: THREE.Camera, width: number, height: number): ScreenRect {
  camera.updateMatrixWorld(true);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const corner of screenBox(prop).corners) {
    const p = corner.clone().project(camera);
    const x = (p.x + 1) / 2 * width, y = (1 - p.y) / 2 * height;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

/** 点到了哪个可播放物件。 */
export function pickScreen(props: ScreenProp[], raycaster: THREE.Raycaster): ScreenProp | undefined {
  let best: { prop: ScreenProp; distance: number } | undefined;
  for (const prop of props) {
    const hit = raycaster.intersectObject(prop.hitTarget, true)[0];
    if (hit && (!best || hit.distance < best.distance)) best = { prop, distance: hit.distance };
  }
  return best?.prop;
}
