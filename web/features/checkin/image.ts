/** 把手机原图缩小成一张能存进账号的 JPEG。同一天最多五张。 */

const MAX_SIDE = 1024
const MAX_CHARS = 180_000

export function compressPhoto(file: File): Promise<string> {
  const type = (file.type || '').toLowerCase()
  if (type && !type.startsWith('image/')) return Promise.reject(new Error('type'))

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height, 1))
      const width = Math.max(1, Math.round(image.width * scale))
      const height = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas'))
        return
      }
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)
      let quality = 0.72
      let data = canvas.toDataURL('image/jpeg', quality)
      while (data.length > MAX_CHARS && quality > 0.46) {
        quality -= 0.12
        data = canvas.toDataURL('image/jpeg', quality)
      }
      URL.revokeObjectURL(url)
      if (!data.startsWith('data:image/')) {
        reject(new Error('encode'))
        return
      }
      resolve(data)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode'))
    }
    image.src = url
  })
}
