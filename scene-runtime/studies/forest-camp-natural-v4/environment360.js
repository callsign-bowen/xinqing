import * as THREE from 'three';

// Original viewer settings, rather than a new art palette.
export const CAMP_PALETTE = Object.freeze({ sky: '#c7c9bb', haze: '#b8bfa9', meadow: '#788761' });
export const BACKDROP = Object.freeze({ radius: 160, bottom: -52, top: 98, halfArc: .7, imageArc: 1.4, extensionTiles: 3 });

export function panoramaU(angle) {
  const a = Math.atan2(Math.sin(angle), Math.cos(angle));
  if (Math.abs(a) <= BACKDROP.halfArc) return THREE.MathUtils.clamp(.5 + a / BACKDROP.imageArc, 0, 1);
  const rearAngle = a < 0 ? a + Math.PI * 2 : a;
  const q = (rearAngle - BACKDROP.halfArc) / (Math.PI * 2 - BACKDROP.halfArc * 2) * BACKDROP.extensionTiles;
  const tile = Math.min(2, Math.floor(q)), fraction = q - tile;
  return tile % 2 === 0 ? 1 - fraction : fraction;
}

export function createRearBackdropGeometry() {
  const positions = [], uv = [], indices = [], segments = 288;
  for (let row = 0; row < 2; row++) for (let i = 0; i <= segments; i++) {
    const a = BACKDROP.halfArc + (Math.PI * 2 - 2 * BACKDROP.halfArc) * i / segments;
    positions.push(BACKDROP.radius * Math.sin(a), row ? BACKDROP.top : BACKDROP.bottom, -BACKDROP.radius * Math.cos(a));
    uv.push(panoramaU(a), row ? 0 : 1); // GLTF texture coordinates: top = 0.
    if (!row && i < segments) { const b = i + segments + 1; indices.push(i, b, i + 1, i + 1, b, b + 1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function createSkyCapGeometry() {
  const positions = [], uv = [], rise = [], indices = [], segments = 512, rings = 24;
  const radius = Math.hypot(BACKDROP.radius, BACKDROP.top), start = Math.atan2(BACKDROP.top, BACKDROP.radius);
  for (let row = 0; row <= rings; row++) for (let i = 0; i <= segments; i++) {
    const a = i === segments ? -Math.PI : -Math.PI + i / segments * Math.PI * 2;
    const t = row / rings, elevation = start + (Math.PI / 2 - start) * t, r = row === rings ? 0 : radius * Math.cos(elevation);
    // A tiny overlap hides the different polygon sampling at the source rim.
    positions.push(r * Math.sin(a), radius * Math.sin(elevation) - (row === 0 ? .25 : 0), -r * Math.cos(a));
    uv.push(panoramaU(a), 0); rise.push(t);
    if (row < rings && i < segments) { const b = row * (segments + 1) + i, c = b + segments + 1; indices.push(b, c, b + 1, b + 1, c, c + 1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('rise', new THREE.Float32BufferAttribute(rise, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function createCampEnvironment(scene, geometries, materials) {
  const extension = new THREE.Group(); extension.name = '360 extension | original landscape material'; scene.add(extension);
  function attachOriginal(original) {
    // Keep every pixel of the valid front artwork. Discard only out-of-image UVs
    // which previously stretched the final pixel column into horizontal bands.
    const material = original.material;
    material.onBeforeCompile = program => {
      program.fragmentShader = program.fragmentShader.replace('#include <emissivemap_fragment>', '#ifdef USE_EMISSIVEMAP\nif(vEmissiveMapUv.x < 0. || vEmissiveMapUv.x > 1.) discard;\n#endif\n#include <emissivemap_fragment>');
    };
    material.customProgramCacheKey = () => 'original-landscape-valid-pixels'; material.needsUpdate = true;
    const rearGeometry = createRearBackdropGeometry(); geometries.add(rearGeometry);
    const rear = new THREE.Mesh(rearGeometry, material); rear.name = 'Missing rear half | original artwork continued'; extension.add(rear);
    const skyGeometry = createSkyCapGeometry(); geometries.add(skyGeometry);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: false, toneMapped: false,
      uniforms: { art: { value: material.emissiveMap }, emission: { value: material.emissive.clone().multiplyScalar(material.emissiveIntensity) } },
      vertexShader: 'attribute float rise;varying float heightBlend;varying vec2 artUV;void main(){heightBlend=rise;artUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform sampler2D art;uniform vec3 emission;varying float heightBlend;varying vec2 artUV;
        void main(){float spread=smoothstep(0.,.4,heightBlend)*.045;
          vec3 c=texture2D(art,artUV).rgb*.4;
          c+=texture2D(art,vec2(clamp(artUV.x-spread,0.,1.),0.)).rgb*.15;
          c+=texture2D(art,vec2(clamp(artUV.x+spread,0.,1.),0.)).rgb*.15;
          c+=texture2D(art,vec2(clamp(artUV.x-spread*.5,0.,1.),0.)).rgb*.15;
          c+=texture2D(art,vec2(clamp(artUV.x+spread*.5,0.,1.),0.)).rgb*.15;
          vec3 top=(texture2D(art,vec2(.15,0.)).rgb+texture2D(art,vec2(.5,0.)).rgb+texture2D(art,vec2(.85,0.)).rgb)/3.;
          gl_FragColor=vec4(mix(c,top,smoothstep(.15,.9,heightBlend))*emission,1.);
          #include <colorspace_fragment>
        }`
    }); materials.add(skyMaterial);
    const sky = new THREE.Mesh(skyGeometry, skyMaterial); sky.name = 'Sky cap | soft original artwork colors'; extension.add(sky);
    extension.userData.sourceMaterial = material.name;
  }
  return { extension, attachOriginal };
}
