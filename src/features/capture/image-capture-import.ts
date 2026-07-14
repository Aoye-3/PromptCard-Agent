import { getImageDimensions, isSupportedImageFile } from '@/components/canvas/canvas-image-assets'
import { createImageCaptureDraft, notifyRecentCapturesChanged } from '@/features/media/recent-capture-normalization'
import { StorageHttpError, type RecentCaptureItem } from '@/storage/storage-service-client'
import { storage } from '@/utils/storage'

type SupportedImageContentType = 'image/png' | 'image/jpeg' | 'image/webp'

interface ImageCaptureImportInput {
  file: File
  kind: 'screenshot' | 'pastedMedia'
  sourcePlatform: string
  capturedAt?: number
  origin?: Record<string, unknown>
  width?: number
  height?: number
}

interface ImageCaptureImportDependencies {
  upload: typeof storage.assets.upload
  create: typeof storage.recentCaptures.create
  dimensions: (file: File) => Promise<{ width: number; height: number }>
  notify: () => void
}

const defaultDependencies: ImageCaptureImportDependencies = {
  upload: storage.assets.upload,
  create: storage.recentCaptures.create,
  dimensions: getImageDimensions,
  notify: notifyRecentCapturesChanged
}

export const importImageCapture = async (
  input: ImageCaptureImportInput,
  dependencies: ImageCaptureImportDependencies = defaultDependencies
): Promise<RecentCaptureItem> => {
  const contentType = imageContentType(input.file)
  if (!contentType || !isSupportedImageFile(input.file)) {
    throw new Error('仅支持 PNG、JPEG 或 WebP 图片。')
  }

  let file: File
  try {
    file = new File([await input.file.arrayBuffer()], input.file.name, {
      type: contentType,
      lastModified: input.file.lastModified
    })
  } catch {
    throw new Error('无法读取图片数据。')
  }

  const capturedAt = input.capturedAt || Date.now()
  const dimensions = input.width && input.height
    ? { width: input.width, height: input.height }
    : await dependencies.dimensions(file)
  const asset = await dependencies.upload(file).catch(error => {
    throw imageUploadError(error)
  })
  const capture = await dependencies.create(createImageCaptureDraft({
    assetId: asset.id,
    filename: file.name,
    contentType,
    kind: input.kind,
    sourcePlatform: input.sourcePlatform,
    size: asset.size,
    width: dimensions.width,
    height: dimensions.height,
    capturedAt,
    origin: {
      ...(input.origin || {}),
      originalMimeType: contentType,
      importedAt: capturedAt
    }
  })).catch(error => {
    throw new Error(`近期捕获入库失败：${errorMessage(error)}`)
  })
  dependencies.notify()
  return capture
}

interface ClipboardReader {
  read: () => Promise<Array<{ types: readonly string[]; getType: (type: string) => Promise<Blob> }>>
}

export const readClipboardImageFiles = async (clipboard: ClipboardReader): Promise<File[]> => {
  const items = await clipboard.read()
  const files: File[] = []
  const timestamp = Date.now()
  for (const item of items) {
    for (const type of item.types) {
      if (!isSupportedContentType(type)) continue
      const blob = await item.getType(type)
      files.push(new File([blob], `clipboard-${timestamp}-${files.length + 1}.${extensionFor(type)}`, { type }))
    }
  }
  return files
}

const imageContentType = (file: File): SupportedImageContentType | null => {
  if (isSupportedContentType(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'webp') return 'image/webp'
  return null
}

const isSupportedContentType = (value: string): value is SupportedImageContentType =>
  value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'

const extensionFor = (contentType: SupportedImageContentType): string =>
  contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1]

const imageUploadError = (error: unknown): Error => {
  if (error instanceof StorageHttpError && error.code === 'timeout') {
    return new Error('素材上传超时，请重试。')
  }
  if (error instanceof StorageHttpError && error.code === 'service_unavailable') {
    return new Error('Storage Service 不可用，请确认桌面服务正在运行。')
  }
  return new Error(`素材上传失败：${errorMessage(error)}`)
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
