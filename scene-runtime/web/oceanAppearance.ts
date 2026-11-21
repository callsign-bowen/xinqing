import * as THREE from 'three';

// Median ink colours sampled from the opaque kelp in the accepted foreground artwork.
export const KELP_PALETTE = ['#1c6173', '#5c8577', '#507963', '#617540'] as const;
export function kelpPaletteIndex(name: string): number {
  let hash = 2166136261;
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return [0, 0, 0, 0, 0, 1, 2, 2, 2, 3, 3][(hash >>> 0) % 11];
}

export const WATER_CANOPY = { radius: 46, rimHeight: 20, rise: 25, centerZ: -5, segments: 180, rows: 48 } as const;
export function waterCanopyPoint(angle: number, elevation: number): THREE.Vector3 {
  const r = WATER_CANOPY.radius * Math.cos(elevation);
  return new THREE.Vector3(r * Math.sin(angle), WATER_CANOPY.rimHeight + WATER_CANOPY.rise * Math.sin(elevation), WATER_CANOPY.centerZ - r * Math.cos(angle));
}
export function createWaterCanopyGeometry(): THREE.BufferGeometry {
  const { segments, rows } = WATER_CANOPY, vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= segments; column++) {
    vertices.push(...waterCanopyPoint(-Math.PI + column / segments * Math.PI * 2, row / rows * Math.PI / 2).toArray());
    uvs.push(column / segments * 5, Math.sin(row / rows * Math.PI / 2));
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < segments; column++) {
    const a = row * (segments + 1) + column, b = a + segments + 1;
    indices.push(a, b, a + 1);
    if (row < rows - 1) indices.push(a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}

// Both the cylinder and cap sample exactly the same top row at their shared rim.
// Crossfade only a small margin at each horizontal texture join; never repeat vertical strips.
export const WATER_SAMPLING = `
vec3 watercolorWater(sampler2D painting, vec2 uv){
 float u=fract(uv.x);
 vec3 a=texture2D(painting,vec2(u,uv.y)).rgb;
 vec3 b=texture2D(painting,vec2(1.-u,uv.y)).rgb;
 float edge=.5*(1.-smoothstep(0.,.055,min(u,1.-u)));
 return mix(a,b,edge);
}
vec3 waterWash(vec3 color){return mix(color,vec3(.565,.791,.831),.12);}
`;

export const CANOPY_VERTEX = `
varying vec3 w;
varying vec2 waterUV;
void main(){waterUV=uv;w=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}
`;
export const CANOPY_FRAGMENT = `
uniform sampler2D water;
varying vec3 w;
varying vec2 waterUV;
${WATER_SAMPLING}
void main(){
 float height=clamp(waterUV.y,0.,1.);
 float u=waterUV.x;
 vec3 ring=watercolorWater(water,vec2(u,.13*smoothstep(0.,.86,height)));
 // A planar mapping takes over before the zenith, avoiding a pinched polar seam.
 vec2 diskUV=vec2(.5+w.x/100.,clamp(.075+(w.z+${(-WATER_CANOPY.centerZ).toFixed(1)})/650.,.005,.15));
 vec3 disk=watercolorWater(water,diskUV);
 vec3 color=waterWash(mix(ring,disk,smoothstep(.52,.94,height)));
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export const OCEAN_VERTEX = `
attribute vec3 _paintcoord;
attribute vec3 _paintnormal;
attribute vec3 _paintpos;
uniform float detailStrength;
varying vec3 vPaintCoord;
varying vec3 vPaintNormal;
varying vec3 vPaintPos;
varying vec3 vWorld;
varying vec3 vLitNormal;
varying vec2 vUV;
void main(){
 vPaintCoord=_paintcoord;vPaintNormal=_paintnormal;vPaintPos=_paintpos;vUV=uv;
 vec3 sculpted=position;
 #if ROCK_DETAIL == 1
  // Millimetre-scale eroded contour on the existing dense mesh, not a new silhouette.
  float erosion=sin(dot(_paintpos,vec3(11.7,9.1,13.3)))
    +.45*sin(dot(_paintpos,vec3(23.1,-17.3,19.7)));
  float strata=sin(_paintpos.z*17.+sin(_paintpos.x*3.2)+sin(_paintpos.y*2.7));
  sculpted+=normal*(erosion*.005+strata*.003)*detailStrength;
 #endif
 vWorld=(modelMatrix*vec4(sculpted,1.)).xyz;
 vLitNormal=normalize(mat3(modelMatrix)*normal);
 gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
}`;

export const OCEAN_FRAGMENT = `
uniform sampler2D atlas;
uniform sampler2D sand;
uniform sampler2D artwork;
uniform vec2 tile;
uniform vec3 pigmentTint;
uniform vec3 foliageTint;
uniform vec3 solidColor;
uniform float wash;
uniform float flatness;
uniform float detailStrength;
varying vec3 vPaintCoord;
varying vec3 vPaintNormal;
varying vec3 vPaintPos;
varying vec3 vWorld;
varying vec3 vLitNormal;
varying vec2 vUV;
${WATER_SAMPLING}
#if ROCK_DETAIL == 1
float inkHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float inkNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(inkHash(i),inkHash(i+vec3(1,0,0)),f.x),
                mix(inkHash(i+vec3(0,1,0)),inkHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(inkHash(i+vec3(0,0,1)),inkHash(i+vec3(1,0,1)),f.x),
                mix(inkHash(i+vec3(0,1,1)),inkHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float reefRelief(vec3 p){
 float grain=inkNoise(p*13.7);
 float ledge=sin(p.z*15.5+sin(p.x*2.8)*.7+sin(p.y*3.1)*.5);
 return .012*ledge+.009*(grain-.5);
}
vec3 reefNormal(vec3 n, float height){
 vec3 dx=dFdx(vWorld),dy=dFdy(vWorld);
 vec3 rx=cross(dy,n),ry=cross(n,dx);float det=dot(dx,rx);
 vec3 gradient=sign(det)*(dFdx(height)*rx+dFdy(height)*ry);
 return normalize(max(abs(det),.000001)*n-gradient*detailStrength);
}
#endif
void main(){
 vec3 color;float alpha=1.;vec3 litNormal=normalize(vLitNormal);
 #if PAINT_KIND == 0 || PAINT_KIND == 5
  vec3 weights=pow(abs(normalize(vPaintNormal)),vec3(4.));weights/=max(weights.x+weights.y+weights.z,.0001);
  vec2 origin=tile+vec2(.013);
  color=texture2D(atlas,origin+vPaintCoord.xy*.474).rgb*weights.z;
  color+=texture2D(atlas,origin+vPaintCoord.xz*.474).rgb*weights.y;
  color+=texture2D(atlas,origin+vPaintCoord.yz*.474).rgb*weights.x;
  #if PAINT_KIND == 5
   float ink=dot(color,vec3(.2126,.7152,.0722));
   vec3 matched=foliageTint*mix(.70,1.34,smoothstep(.022,.245,ink));
   color=mix(matched,color,.10);
  #endif
  color=mix(color,pigmentTint,wash);
  #if ROCK_DETAIL == 1
   float detailFade=1.-smoothstep(.018,.070,length(fwidth(vPaintPos)));
   litNormal=normalize(mix(litNormal,reefNormal(litNormal,reefRelief(vPaintPos)),detailFade));
   float pores=inkNoise(vPaintPos*34.);
   float mineral=inkNoise(vPaintPos*4.1);
   float layer=sin(vPaintPos.z*15.5+sin(vPaintPos.x*2.8)*.7+sin(vPaintPos.y*3.1)*.5);
   float recess=smoothstep(.72,.96,-layer)*.065;
   color*=1.-recess*detailStrength;
   color+=vec3(.022,.026,.033)*(mineral-.5)*detailStrength;
   color*=1.+(pores-.5)*.055*detailFade*detailStrength;
  #endif
 #elif PAINT_KIND == 1
  color=texture2D(sand,vec2(vPaintPos.x/28.+.5,vPaintPos.y/32.+.18)).rgb;
  color=mix(color,vec3(.93,.88,.72),.12);
 #elif PAINT_KIND == 2
  vec4 painted=texture2D(artwork,vUV);color=painted.rgb;
  alpha=painted.a*clamp((vWorld.y-.02)/.43,0.,1.);
 #elif PAINT_KIND == 3
  color=waterWash(watercolorWater(artwork,vUV));
  alpha=clamp(((1.-vUV.y)-.318)/(.50-.318),0.,1.);
 #else
  color=solidColor;
 #endif
 #if PAINT_KIND == 0 || PAINT_KIND == 1 || PAINT_KIND == 4 || PAINT_KIND == 5
  float diffuse=.64+.30*max(dot(litNormal,normalize(vec3(-.35,.88,.22))),0.);
  color*=mix(diffuse,.95,flatness)*.966;
 #endif
 if(alpha<.003)discard;
 gl_FragColor=vec4(max(color,vec3(0.)),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
