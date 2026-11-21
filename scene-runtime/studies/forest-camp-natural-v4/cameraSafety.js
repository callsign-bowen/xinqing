import * as THREE from 'three';

export function pushOutsideBox(position, box, margin = .6) {
  const expanded = box.clone().expandByScalar(margin);
  if (!expanded.containsPoint(position)) return false;
  const choices = [
    [Math.abs(position.x - expanded.min.x), 'x', expanded.min.x, -1], [Math.abs(position.x - expanded.max.x), 'x', expanded.max.x, 1],
    [Math.abs(position.z - expanded.min.z), 'z', expanded.min.z, -1], [Math.abs(position.z - expanded.max.z), 'z', expanded.max.z, 1],
    [Math.abs(position.y - expanded.max.y), 'y', expanded.max.y, 1]
  ].sort((a, b) => a[0] - b[0]);
  position[choices[0][1]] = choices[0][2] + choices[0][3] * .01;
  return true;
}

// Check the entire movement segment, so a large wheel/pan input cannot jump
// from one side of a thin wall to the other between rendered frames.
export function stopBeforeBoxes(previous, position, boxes, margin = .6) {
  const delta = position.clone().sub(previous), distance = delta.length();
  if (distance < 1e-8) return false;
  const path = new THREE.Ray(previous, delta.divideScalar(distance));
  const point = new THREE.Vector3(); let allowed = distance;
  for (const box of boxes) {
    const expanded = box.clone().expandByScalar(margin);
    if (expanded.containsPoint(previous)) continue; // Endpoint recovery handles this case.
    if (path.intersectBox(expanded, point)) allowed = Math.min(allowed, Math.max(0, previous.distanceTo(point) - .02));
  }
  if (allowed >= distance) return false;
  position.copy(path.at(allowed, point)); return true;
}

export function createCameraSafety(camera, controls) {
  const boxes = [], grounds = [], trees = new Map(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  let corrections = 0, previousSafe = null;
  const lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity), lastTarget = new THREE.Vector3(); let lastFov = -1;
  function add(object, data) {
    lastPosition.set(Infinity, Infinity, Infinity);
    if (object.name.startsWith('Terrain')) grounds.push(object);
    const component = data.component || '';
    if (/^(01|02|03|07) \|/.test(component) && !/fringe|seam|guy_line|guy line|stitch|flame/i.test(object.name)) {
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) boxes.push(box);
    }
    if (data.motion_role === 'tree_crown' && Array.isArray(data.root)) {
      const [x, y, z] = data.root; trees.set(`${x},${y}`, { x, z: -y, bottom: z, height: Number(data.tree_height) || 15 });
    }
  }
  function constrain() {
    if (camera.position.distanceToSquared(lastPosition) < 1e-12 && controls.target.distanceToSquared(lastTarget) < 1e-12 && camera.fov === lastFov) return false;
    const before = camera.position.clone(), targetBefore = controls.target.clone();
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -17, 19);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -17, 14);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, .6, 5);
    camera.position.add(controls.target.clone().sub(targetBefore));
    const radius = Math.hypot(camera.position.x, camera.position.z);
    if (radius > 42) { camera.position.x *= 42 / radius; camera.position.z *= 42 / radius; }
    ray.set(new THREE.Vector3(camera.position.x, 50, camera.position.z), down);
    const surface = ray.intersectObjects(grounds, false)[0];
    const floor = Math.max(.8, (surface?.point.y ?? 0) + 1.05);
    camera.position.y = Math.max(camera.position.y, floor);
    // Protect the near-plane corners too, including the wider portrait field of view.
    const margin = Math.max(.65, camera.near * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.hypot(1, camera.aspect) + .4);
    if (previousSafe) stopBeforeBoxes(previousSafe, camera.position, boxes, margin);
    for (let pass = 0; pass < 3; pass++) for (const box of boxes) pushOutsideBox(camera.position, box, margin);
    for (const tree of trees.values()) {
      if (camera.position.y > tree.bottom + tree.height || camera.position.y < tree.bottom) continue;
      const dx = camera.position.x - tree.x, dz = camera.position.z - tree.z, distance = Math.hypot(dx, dz), safe = .75 + margin;
      if (distance < safe) { camera.position.x = tree.x + (distance ? dx / distance : 1) * safe; camera.position.z = tree.z + (distance ? dz / distance : 0) * safe; }
    }
    ray.set(new THREE.Vector3(camera.position.x, 50, camera.position.z), down);
    const finalSurface = ray.intersectObjects(grounds, false)[0];
    camera.position.y = Math.max(camera.position.y, floor, (finalSurface?.point.y ?? 0) + 1.05);
    const changed = !before.equals(camera.position) || !targetBefore.equals(controls.target);
    if (changed) { camera.lookAt(controls.target); corrections++; }
    lastPosition.copy(camera.position); lastTarget.copy(controls.target); lastFov = camera.fov;
    previousSafe = camera.position.clone();
    return changed;
  }
  return { add, constrain, resetPath: () => { previousSafe = null; lastPosition.set(Infinity, Infinity, Infinity); }, stats: () => ({ boxes: boxes.length, trees: trees.size, grounds: grounds.length, corrections }) };
}
