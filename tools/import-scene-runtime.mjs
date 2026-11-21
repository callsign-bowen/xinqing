// Copy the local CBT scene dependency closure without importing its app shell.
import fs from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const sourceRoot = 'C:/Users/汪晨/Desktop/CBT初版'
const targetRoot = path.resolve('scene-runtime')
const visited = new Set()
const manifest = []
async function resolveRelative(owner, reference) {
  if (!reference.startsWith('.')) return null
  const clean = reference.split(/[?#]/)[0]
  const base = path.resolve(path.dirname(owner), clean)
  if (!base.startsWith(sourceRoot.replaceAll('/', path.sep) + path.sep)) throw new Error('Dependency escaped source project')
  for (const candidate of [base, base + '.ts', base + '.js', base + '.mjs', path.join(base, 'index.ts')]) {
    try { if ((await fs.stat(candidate)).isFile()) return candidate } catch {}
  }
  throw new Error(`Missing ${reference} from ${owner}`)
}
async function copyDependency(file) {
  file = path.resolve(file)
  if (visited.has(file)) return
  visited.add(file)
  const relative = path.relative(sourceRoot, file)
  const target = path.join(targetRoot, relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(file, target)
  manifest.push(relative.replaceAll(path.sep, '/'))
  if (!/\.(?:ts|js|mjs|css|html)$/.test(file)) return
  const source = await fs.readFile(file, 'utf8')
  const references = new Set()
  if (/\.(?:ts|js|mjs)$/.test(file)) {
    ts.preProcessFile(source, true, true).importedFiles.forEach(item => references.add(item.fileName))
  }
  for (const match of source.matchAll(/new URL\(\s*['"]([^'"]+)['"]/g)) references.add(match[1])
  for (const match of source.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) references.add(match[1])
  if (file.endsWith('.html')) for (const match of source.matchAll(/(?:src|from)=?\s*['"]([^'"]+)['"]/g)) references.add(match[1])
  if (file.endsWith('.html')) for (const match of source.matchAll(/from\s*['"]([^'"]+)['"]/g)) references.add(match[1])
  for (const reference of references) {
    const dependency = await resolveRelative(file, reference)
    if (dependency) await copyDependency(dependency)
  }
}
for (const entry of ['web/ambientWindowViewport.ts', 'forest/index.html', 'bedroom/index.html']) await copyDependency(path.join(sourceRoot, entry))
// These paths are requested by the original renderers at runtime.
const publicAssets = [
  ...['lunar-camp.glb','lunar-astronaut-supplied.glb','quiet-window.glb','quiet-window-rear.glb','window-kitten-rebound.glb','scene-dog-greeting.glb','nuo-bedroom.glb','nuo-companion-rigged.glb','ocean-octopus.glb'].map(name => 'models/' + name),
  'scenes/lunar/deep-sky-8k.jpg', 'scenes/lunar/preview.png',
  ...['ocean-open-front-fine.glb','ocean-open-front-mobile.glb','pigment-atlas.png','sand-wash.png','foreground.png','distant-reef.png','poster.webp','thumbnail.webp','draco/draco_wasm_wrapper.js','draco/draco_decoder.wasm'].map(name => 'scenes/ocean/' + name),
  'draco/draco_decoder.js','draco/draco_decoder.wasm','draco/draco_wasm_wrapper.js',
  'scenes/ocean/draco/LICENSE.txt','scenes/ocean/draco/NOTICE.txt','scenes/ocean/draco/THREE-LICENSE.txt'
]
for (const relative of publicAssets) {
  const target = path.resolve('public', relative)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.copyFile(path.join(sourceRoot, 'public', relative), target)
}
const framePath = path.join(targetRoot, 'web/frameSceneViewport.ts')
const frameSource = await fs.readFile(framePath, 'utf8')
await fs.writeFile(framePath, frameSource.replace('frame.src=`/${', 'frame.src=`/scene-runtime/${'))
await fs.writeFile(path.join(targetRoot, 'import-manifest.json'), JSON.stringify({ source: sourceRoot, modules: manifest.sort(), publicAssets }, null, 2) + '\n')
console.log(`Imported ${manifest.length} scene files and ${publicAssets.length} runtime assets`)
