import { createFreeCanvasMediaNode, type FreeCanvasMediaNode, type FreeCanvasPosition } from '@/domain/free-canvas/free-canvas'
import { storageServiceClient } from '@/storage/storage-service-client'

interface ImageAssetGateway {
  upload: (file: File) => Promise<{ id: string }>
  url: (assetId: string) => string
  dimensions: (file: File) => Promise<{ width: number; height: number }>
}

const defaultGateway: ImageAssetGateway = {
  upload: file => storageServiceClient.assets.upload(file),
  url: assetId => storageServiceClient.assets.url(assetId),
  dimensions: file => getImageDimensions(file)
}

export const canvasImageAssetUrl = (assetId: string): string => defaultGateway.url(assetId)

export const uploadFreeCanvasImageFiles = async (
  files: File[],
  position: FreeCanvasPosition,
  gateway: ImageAssetGateway = defaultGateway
): Promise<FreeCanvasMediaNode[]> => Promise.all(files.map(async (file, index) => {
  const [asset, dimensions] = await Promise.all([
    gateway.upload(file),
    gateway.dimensions(file)
  ])
  const size = fitImageNode(dimensions.width, dimensions.height)
  return {
    ...createFreeCanvasMediaNode('imageAsset', {
      x: position.x + index * 28,
      y: position.y + index * 28
    }),
    title: file.name,
    width: size.width,
    height: size.height,
    assetId: asset.id,
    imageUrl: gateway.url(asset.id),
    meta: { originalWidth: dimensions.width, originalHeight: dimensions.height }
  }
}))

export const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new window.Image()
  image.onload = () => {
    URL.revokeObjectURL(url)
    resolve({ width: image.naturalWidth, height: image.naturalHeight })
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new Error('无法读取图片尺寸。'))
  }
  image.src = url
})

export const fitImageNode = (width: number, height: number): { width: number; height: number } => {
  const maximum = 360
  const scale = maximum / Math.max(width, height)
  return { width: width * scale, height: height * scale }
}

export const isSupportedImageFile = (file: File): boolean => {
  if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return true
  return /\.(png|jpe?g|webp)$/i.test(file.name)
}

export const isFileDrag = (dataTransfer: DataTransfer): boolean => (
  Array.from(dataTransfer.types).includes('Files') ||
  Array.from(dataTransfer.items).some(item => item.kind === 'file')
)

export const getClipboardImageFiles = (clipboard: DataTransfer | null): File[] => {
  if (!clipboard) return []
  const files = Array.from(clipboard.files).filter(isSupportedImageFile)
  if (files.length > 0) return files
  return Array.from(clipboard.items)
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => Boolean(file && isSupportedImageFile(file)))
}
