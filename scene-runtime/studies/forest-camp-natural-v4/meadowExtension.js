import * as THREE from 'three';

// The center of the camp is a delivered asset. Everything here is additive:
// sample its actual boundary, then continue the same bank and meadow outside it.
export const MEADOW_RADIUS = 159;
const EPSILON = 1e-4;
const clamp = THREE.MathUtils.clamp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, z, seed = 0) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

function interval(values, value, get = item => item) {
  let lo = 0, hi = values.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (get(values[mid]) > value) hi = mid; else lo = mid; }
  return Math.min(values.length - 2, lo);
}

function worldColumns(mesh) {
  mesh.updateWorldMatrix(true, false);
  const groups = new Map(), point = new THREE.Vector3(), positions = mesh.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    const key = Math.round(point.x / EPSILON);
    if (!groups.has(key)) groups.set(key, { x: point.x, points: new Map() });
    const column = groups.get(key), zKey = Math.round(point.z / EPSILON);
    if (!column.points.has(zKey)) column.points.set(zKey, { z: point.z, y: point.y });
  }
  return [...groups.values()].map(column => ({ x: column.x, points: [...column.points.values()].sort((a, b) => a.z - b.z) })).sort((a, b) => a.x - b.x);
}

/** Reconstruct the source height field without raycasting thousands of tufts. */
export function createMeadowProfile(terrain, water) {
  const columns = worldColumns(terrain), waterColumns = worldColumns(water);
  if (columns.length < 2 || waterColumns.length < 2) throw new Error('Meadow extension requires the original terrain and river meshes.');
  const river = waterColumns.map(column => ({ x: column.x, z: (column.points[0].z + column.points.at(-1).z) / 2 }));
  const xmin = columns[0].x, xmax = columns.at(-1).x;
  const riverLevel = waterColumns.reduce((sum, column) => sum + column.points.reduce((s, p) => s + p.y, 0) / column.points.length, 0) / waterColumns.length;
  function centerZ(x) {
    const end = x < river[0].x ? river[0] : x > river.at(-1).x ? river.at(-1) : null;
    if (end) {
      // Use a several-meter tangent so a single rippled vertex cannot redirect
      // the stream. The added bend has zero derivative at the joining edge.
      const otherX = end.x + (x < river[0].x ? 4 : -4);
      const i = interval(river, otherX, p => p.x), a = river[i], b = river[i + 1];
      const otherZ = THREE.MathUtils.lerp(a.z, b.z, (otherX - a.x) / (b.x - a.x));
      const d = x - end.x, slope = (end.z - otherZ) / (end.x - otherX);
      return end.z + d * slope + .7 * (Math.sin(d * .035) - d * .035);
    }
    const i = interval(river, x, p => p.x), a = river[i], b = river[i + 1];
    return THREE.MathUtils.lerp(a.z, b.z, (x - a.x) / (b.x - a.x));
  }
  for (const column of columns) {
    const center = centerZ(column.x);
    column.points.forEach(point => { point.q = point.z - center; });
  }
  const middle = columns[Math.floor(columns.length / 2)];
  const qmin = Math.round(middle.points[0].q * 1e3) / 1e3;
  const qmax = Math.round(middle.points.at(-1).q * 1e3) / 1e3;
  function columnHeight(column, q) {
    const points = column.points, i = interval(points, q, p => p.q), a = points[i], b = points[i + 1];
    return THREE.MathUtils.lerp(a.y, b.y, clamp((q - a.q) / Math.max(EPSILON, b.q - a.q), 0, 1));
  }
  function sourceHeight(x, q) {
    x = clamp(x, xmin, xmax); q = clamp(q, qmin, qmax);
    const i = interval(columns, x, p => p.x), a = columns[i], b = columns[i + 1];
    return THREE.MathUtils.lerp(columnHeight(a, q), columnHeight(b, q), (x - a.x) / (b.x - a.x));
  }
  function distance(x, q) { return Math.hypot(Math.max(xmin - x, 0, x - xmax), Math.max(qmin - q, 0, q - qmax)); }
  const falloff = r => 3.2 * smooth((r - 60) / 95);
  const waterHeight = x => riverLevel - falloff(Math.hypot(x, centerZ(x)));
  function height(x, z) {
    const q = z - centerZ(x), d = distance(x, q), source = sourceHeight(x, q);
    if (d < EPSILON) return source;
    const field = .78 + .32 * Math.sin(x * .035 + .5) * Math.sin(z * .032 + .4) + .13 * Math.cos(x * .061 + z * .028) - falloff(Math.hypot(x, z));
    const level = waterHeight(x);
    const bank = Math.abs(q);
    const farHeight = bank <= 1.5
      ? THREE.MathUtils.lerp(level - .50 + .04 * Math.sin(x * .24), level, smooth(bank / 1.5))
      : THREE.MathUtils.lerp(level, field, smooth((bank - 1.5) / 2.1));
    return THREE.MathUtils.lerp(source, farHeight, smooth(d / 24));
  }
  return { columns, xmin, xmax, qmin, qmax, riverLevel, centerZ, waterHeight, sourceHeight, height, distance };
}

function grassTexture() {
  const size = 256, data = new Uint8Array(size * size * 4);
  // A tiny repeating understory texture fills subpixel spaces between the real
  // tufts. It is generated locally, not a new downloaded or generated asset.
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const n = hash(x, z), m = hash(Math.floor(x / 5), Math.floor(z / 9), 3);
    const blade = (hash(Math.floor((x + z * .17) / 2), Math.floor(z / 13), 5) > .76 ? 12 : 0);
    const i = (z * size + x) * 4, v = (n - .5) * 17 + (m - .5) * 9 + blade;
    data[i] = clamp(117 + v, 0, 255); data[i + 1] = clamp(133 + v, 0, 255); data[i + 2] = clamp(83 + v * .72, 0, 255); data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

function gentleHaze(material, instanced = false) {
  material.fog = false;
  material.onBeforeCompile = shader => {
    shader.uniforms.meadowHaze = { value: new THREE.Color('#b8bfa9') };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMeadowPosition;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\nvec4 meadowLocal=vec4(transformed,1.);\n${instanced ? 'meadowLocal=instanceMatrix*meadowLocal;' : ''}\nvMeadowPosition=(modelMatrix*meadowLocal).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMeadowPosition;uniform vec3 meadowHaze;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\nfloat meadowAtmosphere=smoothstep(48.,159.,length(vMeadowPosition.xz))*.22;\ngl_FragColor.rgb=mix(gl_FragColor.rgb,meadowHaze,meadowAtmosphere);');
  };
  material.customProgramCacheKey = () => `expanded-meadow-gentle-haze-${instanced ? 'tuft' : 'ground'}-v1`;
  return material;
}

function sourceSamples(profile) {
  const xs = profile.columns.map(column => column.x), qs = profile.columns[Math.floor(profile.columns.length / 2)].points.map(point => point.q);
  // Source border samples are retained exactly; coarser samples are only added
  // beyond the finite delivered mesh. Bank rows remain dense along the river.
  for (let x = Math.floor(profile.xmin / 4) * 4 - 4; x >= -MEADOW_RADIUS; x -= 4) xs.push(x);
  for (let x = Math.ceil(profile.xmax / 4) * 4 + 4; x <= MEADOW_RADIUS; x += 4) xs.push(x);
  xs.push(-MEADOW_RADIUS, MEADOW_RADIUS);
  for (let q = Math.floor(profile.qmin / 4) * 4 - 4; q >= -240; q -= 4) qs.push(q);
  for (let q = Math.ceil(profile.qmax / 4) * 4 + 4; q <= 240; q += 4) qs.push(q);
  qs.push(profile.qmin, profile.qmax);
  const unique = values => [...new Map(values.map(value => [Math.round(value * 1e3), value])).values()].sort((a, b) => a - b);
  return { xs: unique(xs), qs: unique(qs) };
}

function groundGeometry(profile) {
  const positions = [], uv = [], colors = [], indices = [], vertexMap = new Map(), { xs, qs } = sourceSamples(profile);
  const base = new THREE.Color('#ffffff');
  function vertex(point) {
    const key = `${Math.round(point.x * 1e5)},${Math.round(point.z * 1e5)}`;
    if (vertexMap.has(key)) return vertexMap.get(key);
    const index = positions.length / 3, y = profile.height(point.x, point.z);
    positions.push(point.x, y, point.z); uv.push(point.x / 3.2, point.z / 3.2);
    const shade = .98 + .025 * Math.sin(point.x * .31 + point.z * .17) + .018 * Math.sin(point.x * .77 - point.z * .59);
    colors.push(base.r * shade, base.g * shade, base.b * shade); vertexMap.set(key, index); return index;
  }
  function circleIntersection(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, A = dx * dx + dz * dz, B = 2 * (a.x * dx + a.z * dz), C = a.x * a.x + a.z * a.z - MEADOW_RADIUS * MEADOW_RADIUS;
    const root = Math.sqrt(Math.max(0, B * B - 4 * A * C)), first = (-B - root) / (2 * A), second = (-B + root) / (2 * A);
    const t = first >= -1e-6 && first <= 1 + 1e-6 ? first : second;
    return { x: a.x + clamp(t, 0, 1) * dx, z: a.z + clamp(t, 0, 1) * dz };
  }
  function triangle(a, b, c) {
    const input = [a, b, c], output = [];
    for (let i = 0; i < 3; i++) {
      const p = input[i], previous = input[(i + 2) % 3], inside = Math.hypot(p.x, p.z) <= MEADOW_RADIUS + 1e-6, previousInside = Math.hypot(previous.x, previous.z) <= MEADOW_RADIUS + 1e-6;
      if (inside !== previousInside) output.push(circleIntersection(previous, p));
      if (inside) output.push(p);
    }
    for (let i = 1; i < output.length - 1; i++) indices.push(vertex(output[0]), vertex(output[i]), vertex(output[i + 1]));
  }
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < qs.length - 1; j++) {
    const x1 = xs[i], x2 = xs[i + 1], q1 = qs[j], q2 = qs[j + 1];
    if (x1 >= profile.xmin - EPSILON && x2 <= profile.xmax + EPSILON && q1 >= profile.qmin - EPSILON && q2 <= profile.qmax + EPSILON) continue;
    const a = { x: x1, z: profile.centerZ(x1) + q1 }, b = { x: x2, z: profile.centerZ(x2) + q1 }, c = { x: x2, z: profile.centerZ(x2) + q2 }, d = { x: x1, z: profile.centerZ(x1) + q2 };
    triangle(a, c, b); triangle(a, d, c);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

function riverGeometry(profile) {
  const positions = [], uv = [], indices = [];
  for (const sign of [-1, 1]) {
    let previous = null;
    for (let d = 0; d <= 130; d += 1) {
      const x = (sign < 0 ? profile.xmin : profile.xmax) + d * sign, z = profile.centerZ(x);
      if (Math.hypot(x, z) > MEADOW_RADIUS - 2) break;
      const start = positions.length / 3;
      for (const q of [-1.5, 0, 1.5]) { positions.push(x, profile.waterHeight(x) + .002 * Math.sin(x * 2.1 + z * 3.1), z + q); uv.push(x * .25, (q + 1.5) / 3); }
      if (previous !== null) for (let j = 0; j < 2; j++) indices.push(previous + j, start + j, start + j + 1, previous + j, start + j + 1, previous + j + 1);
      previous = start;
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

export function createExpandedMeadow({ scene, terrain, water, grassAssets, geometries, materials, textures }) {
  const profile = createMeadowProfile(terrain, water), texture = grassTexture(); textures.add(texture);
  const meshGeometry = groundGeometry(profile); geometries.add(meshGeometry);
  const groundMaterial = gentleHaze(new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 1, side: THREE.DoubleSide })); materials.add(groundMaterial);
  const ground = new THREE.Mesh(meshGeometry, groundMaterial); ground.name = 'Expanded meadow | exact original boundary to 159m'; ground.receiveShadow = true; scene.add(ground);
  const waterGeometry = riverGeometry(profile); geometries.add(waterGeometry);
  const waterMaterial = gentleHaze((Array.isArray(water.material) ? water.material[0] : water.material).clone()); waterMaterial.side = THREE.DoubleSide; materials.add(waterMaterial);
  const river = new THREE.Mesh(waterGeometry, waterMaterial); river.name = 'River continuation | original banks and water level'; scene.add(river);
  const fineMaterial = gentleHaze(grassAssets.material.clone(), true), distantMaterial = gentleHaze(grassAssets.distantMaterial.clone(), true);
  materials.add(fineMaterial); materials.add(distantMaterial);
  const assets = { ...grassAssets, material: fineMaterial, distantMaterial }, buckets = new Map();
  let count = 0;
  function addTufts(extent, spacing, near, far) {
    for (let ix = 0; ix < Math.ceil(extent * 2 / spacing); ix++) for (let iz = 0; iz < Math.ceil(extent * 2 / spacing); iz++) {
      const x = -extent + (ix + .25 + hash(ix, iz, 1) * .5) * spacing, z = -extent + (iz + .25 + hash(ix, iz, 2) * .5) * spacing, r = Math.hypot(x, z);
      if (r < near || r >= far || (x > -35.8 && x < 35.8 && z > -45.8 && z < 24.8)) continue;
      const q = z - profile.centerZ(x); if (Math.abs(q) < 1.58) continue;
      const y = profile.height(x, z); if (y < profile.waterHeight(x) + .02) continue;
      const key = `${Math.floor(x / 24)},${Math.floor(z / 24)}`; if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ x, y: y - .015, z, rotation: hash(ix, iz, 4) * Math.PI * 2, width: (near ? 2.7 : 1.85) * (.9 + hash(ix, iz, 6) * .2), height: .72 + hash(ix, iz, 7) * .22 }); count++;
    }
  }
  addTufts(82, .68, 0, 82); addTufts(MEADOW_RADIUS - 1, 2.1, 82, MEADOW_RADIUS - 1);
  const grassMeshes = [], position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), matrix = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
  for (const [key, records] of buckets) {
    const mesh = new THREE.InstancedMesh(grassAssets.distantGeometry, distantMaterial, records.length); mesh.name = `Expanded meadow turf | ${key}`;
    records.forEach((record, i) => { position.set(record.x, record.y, record.z); rotation.setFromAxisAngle(up, record.rotation); scale.set(record.width, record.height, record.width); matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.boundingSphere.radius += 1; mesh.castShadow = false; mesh.userData.meadowAssets = assets; grassMeshes.push(mesh); scene.add(mesh);
  }
  return { ground, water: river, grassMeshes, stats: { radius: MEADOW_RADIUS, grassPatches: count, grassChunks: grassMeshes.length, groundTriangles: meshGeometry.index.count / 3, sourceBounds: [profile.xmin, profile.xmax, profile.qmin, profile.qmax] } };
}
