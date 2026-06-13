import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react'
import {
  addFreeCanvasMediaNode,
  createFreeCanvasCroppedNodes,
  duplicateFreeCanvasMediaNode,
  mediaNodeFlowId,
  type FreeCanvasCropLines,
  type FreeCanvasMediaNode,
  type FreeCanvasPosition
} from '@/domain/free-canvas/free-canvas'
import type { IThreeStageProject } from '@/models/PromptHistory.model'
import {
  getClipboardImageFiles,
  isFileDrag,
  isSupportedImageFile,
  uploadFreeCanvasImageFiles
} from './canvas-image-assets'

interface UseCanvasImageInteractionsProps {
  threeStage: IThreeStageProject
  mediaNodes: FreeCanvasMediaNode[]
  selectedMedia?: FreeCanvasMediaNode
  screenToFlowPosition: (position: FreeCanvasPosition) => FreeCanvasPosition
  onChange: (threeStage: IThreeStageProject) => void
  onSelectNode: (nodeId: string) => void
  isTypingTarget: (target: EventTarget | null) => boolean
}

interface CanvasListenerTarget {
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

export const subscribeCanvasClipboard = (
  windowTarget: CanvasListenerTarget,
  documentTarget: CanvasListenerTarget,
  handleCopy: (event: KeyboardEvent) => void,
  handlePaste: (event: ClipboardEvent) => void
): (() => void) => {
  windowTarget.addEventListener('keydown', handleCopy as EventListener)
  documentTarget.addEventListener('paste', handlePaste as EventListener)
  return () => {
    windowTarget.removeEventListener('keydown', handleCopy as EventListener)
    documentTarget.removeEventListener('paste', handlePaste as EventListener)
  }
}

export const useCanvasImageInteractions = ({
  threeStage,
  mediaNodes,
  selectedMedia,
  screenToFlowPosition,
  onChange,
  onSelectNode,
  isTypingTarget
}: UseCanvasImageInteractionsProps) => {
  const [cropNodeId, setCropNodeId] = useState<string | null>(null)
  const [assetUploadError, setAssetUploadError] = useState<string | null>(null)
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null)
  const [fileDragActive, setFileDragActive] = useState(false)
  const fileDragDepthRef = useRef(0)
  const threeStageRef = useRef(threeStage)
  const selectedMediaRef = useRef(selectedMedia)
  const copiedMediaNodeRef = useRef<FreeCanvasMediaNode>()
  threeStageRef.current = threeStage
  selectedMediaRef.current = selectedMedia

  useEffect(() => {
    if (!clipboardNotice) return
    const timeoutId = window.setTimeout(() => setClipboardNotice(null), 1600)
    return () => window.clearTimeout(timeoutId)
  }, [clipboardNotice])

  const uploadImageFiles = useCallback(async (files: File[], position: FreeCanvasPosition): Promise<void> => {
    setAssetUploadError(null)
    try {
      const uploadedNodes = await uploadFreeCanvasImageFiles(files, position)
      const next = uploadedNodes.reduce((current, node) => addFreeCanvasMediaNode(current, node), threeStageRef.current)
      onChange(next)
    } catch (error) {
      setAssetUploadError(error instanceof Error ? error.message : '图片上传失败。')
    }
  }, [onChange])

  const handleDragOver = useCallback((event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDragEnter = useCallback((event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    event.preventDefault()
    fileDragDepthRef.current += 1
    setFileDragActive(true)
  }, [])

  const handleDragLeave = useCallback((event: ReactDragEvent<Element>) => {
    if (!isFileDrag(event.dataTransfer)) return
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setFileDragActive(false)
  }, [])

  const handleDrop = useCallback(async (event: ReactDragEvent<Element>) => {
    fileDragDepthRef.current = 0
    setFileDragActive(false)
    const files = Array.from(event.dataTransfer.files).filter(isSupportedImageFile)
    event.preventDefault()
    if (files.length === 0) {
      setAssetUploadError('仅支持 PNG、JPEG 和 WebP 图片。')
      return
    }
    await uploadImageFiles(files, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }, [screenToFlowPosition, uploadImageFiles])

  useEffect(() => {
    const handleCopy = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c' || isTypingTarget(event.target)) return
      const media = selectedMediaRef.current
      if (!media) return
      event.preventDefault()
      copiedMediaNodeRef.current = media
      setClipboardNotice('已复制图片节点')
    }
    const handlePaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return
      const files = getClipboardImageFiles(event.clipboardData)
      if (files.length > 0) {
        event.preventDefault()
        void uploadImageFiles(files, screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
        return
      }
      const copied = copiedMediaNodeRef.current
      if (!copied) return
      event.preventDefault()
      const duplicate = duplicateFreeCanvasMediaNode(copied)
      onChange(addFreeCanvasMediaNode(threeStageRef.current, duplicate))
      onSelectNode(mediaNodeFlowId(duplicate.id))
      setClipboardNotice('已粘贴图片节点')
    }
    return subscribeCanvasClipboard(window, document, handleCopy, handlePaste)
  }, [isTypingTarget, onChange, onSelectNode, screenToFlowPosition, uploadImageFiles])

  const cropMedia = cropNodeId ? mediaNodes.find(node => node.id === cropNodeId) : undefined
  const startImageCrop = useCallback((nodeId: string) => setCropNodeId(nodeId.replace(/^media:/, '')), [])
  const cancelImageCrop = useCallback(() => setCropNodeId(null), [])
  const confirmImageCrop = useCallback((lines: FreeCanvasCropLines): void => {
    if (!cropMedia) return
    const next = createFreeCanvasCroppedNodes(cropMedia, lines)
      .reduce((current, node) => addFreeCanvasMediaNode(current, node), threeStageRef.current)
    onChange(next)
    setCropNodeId(null)
  }, [cropMedia, onChange])

  return {
    assetUploadError,
    clipboardNotice,
    fileDragActive,
    cropMedia,
    startImageCrop,
    cancelImageCrop,
    confirmImageCrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop
  }
}
