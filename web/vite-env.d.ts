/// <reference types="vite/client" />

interface Window {
  Chart?: {
    new (canvas: unknown, config: unknown): { destroy: () => void }
  }
  NuoAndroid?: {
    setLauncherIcon: (mascotId: string) => void
  }
}
