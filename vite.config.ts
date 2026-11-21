import { defineConfig } from 'vite'

export default defineConfig({
  // Prepare all scene dependencies up front; selecting a scene must not cause
  // Vite's first-use dependency optimization to reload the chat page.
  optimizeDeps: {
    include: [
      'three',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/loaders/DRACOLoader.js',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/controls/OrbitControls.js',
      'three/addons/utils/BufferGeometryUtils.js'
    ]
  },
  build: {
    rollupOptions: { input: ['index.html', 'scene-runtime/viewer.html', 'scene-runtime/forest/index.html', 'scene-runtime/bedroom/index.html'] }
  },
  server: {
    port: 5174,
    strictPort: true,
    host: '0.0.0.0',
    open: false,
    allowedHosts: true,
    watch: {
      // Windows 上编辑器/工具的原子写入临时目录会被 Vite 当成新文件监听，容易 EBUSY。
      ignored: ['**/node_modules/**', '**/.*.tmpdir/**', '**/*.tmp', '**/screenshots/**', '**/dist/**']
    },
    proxy: {
      // 本地账号服务；也可以用 NUO_ACCOUNT_ORIGIN 指向云端。
      '/api': {
        target: process.env.NUO_ACCOUNT_ORIGIN || 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
