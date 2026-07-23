import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent
} from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Shapes,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import {
  StorageHttpError,
  StorageRevisionConflict,
  storageServiceClient,
  type ProjectResource,
  type ProjectResourceFolder,
  type ProjectResourceLayout,
  type ProjectResourceSnapshot
} from '@/storage/storage-service-client'
import { buildFolderPath, canMoveFolder } from '@/domain/project-resources/project-resource-library'
import { PROJECT_MATERIAL_DRAG_MIME } from '@/domain/project-resources/project-resource-drag'

type ResourceKind = 'subject' | 'material'
type DragItem = { type: 'folder' | 'resource'; id: string }

interface ProjectResourceLibraryProps {
  projectId: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onPlaceMaterial: (resource: ProjectResource) => void
  onAddSubject: (resource: ProjectResource) => { reason: 'duplicate' | 'limit' | null }
}

const emptySnapshot: ProjectResourceSnapshot = { folders: [], resources: [] }
const projectResourcesUnavailableMessage = '项目资源库需要 Storage schema v7，请重启本地开发服务后重试。'
const supportedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/gif',
  'image/heic',
  'image/heif'
])
const supportedImageExtensions = /\.(?:jpe?g|png|webp|bmp|tiff?|gif|heic|heif)$/i

const isSupportedResourceImage = (file: File) =>
  supportedImageTypes.has(file.type.toLowerCase()) || supportedImageExtensions.test(file.name)

const isExternalFileDrag = (event: DragEvent) =>
  Array.from(event.dataTransfer.types || []).includes('Files') || event.dataTransfer.files.length > 0

export const ProjectResourceLibrary = ({
  projectId,
  expanded,
  onExpandedChange,
  onPlaceMaterial,
  onAddSubject
}: ProjectResourceLibraryProps) => {
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const hoverOpenTimer = useRef<number | null>(null)
  const hoverCloseTimer = useRef<number | null>(null)
  const dragItemRef = useRef<DragItem | null>(null)
  const [snapshot, setSnapshot] = useState<ProjectResourceSnapshot>(emptySnapshot)
  const [snapshotProjectId, setSnapshotProjectId] = useState('')
  const [kind, setKind] = useState<ResourceKind>('subject')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [fileDragActive, setFileDragActive] = useState(false)
  const [resourceApiUnavailable, setResourceApiUnavailable] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null)
  const [editingResourceName, setEditingResourceName] = useState('')
  const [preview, setPreview] = useState<{ resource: ProjectResource; top: number } | null>(null)

  const loadSnapshot = useCallback(async (signal?: AbortSignal) => {
    const next = await storageServiceClient.projectResources.getSnapshot(projectId, signal)
    setSnapshot(next)
    setSnapshotProjectId(projectId)
    setResourceApiUnavailable(false)
    return next
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    setSnapshot(emptySnapshot)
    setSnapshotProjectId('')
    setKind('subject')
    setSelectedFolderId(null)
    setCollapsedFolders(new Set())
    setPreview(null)
    setFileDragActive(false)
    setResourceApiUnavailable(false)
    onExpandedChange(false)
    setLoading(true)
    void loadSnapshot(controller.signal)
      .catch(error => {
        if (controller.signal.aborted) return
        if (error instanceof StorageHttpError && error.status === 404) {
          setResourceApiUnavailable(true)
          setNotice(projectResourcesUnavailableMessage)
          return
        }
        setNotice(error instanceof Error ? error.message : '资源库加载失败')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [loadSnapshot, onExpandedChange, projectId])

  useEffect(() => {
    if (!expanded) setPreview(null)
    if (typeof window === 'undefined') return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (preview) setPreview(null)
      else if (expanded) onExpandedChange(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [expanded, onExpandedChange, preview])

  useEffect(() => () => {
    if (typeof window === 'undefined') return
    if (hoverOpenTimer.current !== null) window.clearTimeout(hoverOpenTimer.current)
    if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current)
  }, [])

  const visibleSnapshot = snapshotProjectId === projectId ? snapshot : emptySnapshot
  const resources = useMemo(
    () => visibleSnapshot.resources.filter(resource => resource.kind === kind),
    [kind, visibleSnapshot.resources]
  )
  const visibleMaterials = useMemo(
    () => resources.filter(resource => resource.folderId === selectedFolderId),
    [resources, selectedFolderId]
  )

  const showPreviewLater = (resource: ProjectResource, element: HTMLElement) => {
    if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current)
    if (hoverOpenTimer.current !== null) window.clearTimeout(hoverOpenTimer.current)
    const bounds = element.getBoundingClientRect()
    hoverOpenTimer.current = window.setTimeout(() => {
      setPreview({ resource, top: Math.max(96, Math.min(bounds.top, window.innerHeight - 360)) })
    }, 250)
  }

  const hidePreviewLater = () => {
    if (hoverOpenTimer.current !== null) window.clearTimeout(hoverOpenTimer.current)
    if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current)
    hoverCloseTimer.current = window.setTimeout(() => setPreview(null), 150)
  }

  const persistLayout = async (next: ProjectResourceSnapshot, previous: ProjectResourceSnapshot) => {
    setSnapshot(next)
    const layout: ProjectResourceLayout = {
      folders: next.folders.map(folder => ({
        id: folder.id,
        parentId: folder.parentId,
        sortOrder: folder.sortOrder,
        revision: previous.folders.find(item => item.id === folder.id)?.revision ?? folder.revision
      })),
      resources: next.resources.map(resource => ({
        id: resource.id,
        folderId: resource.folderId,
        sortOrder: resource.sortOrder,
        revision: previous.resources.find(item => item.id === resource.id)?.revision ?? resource.revision
      }))
    }
    try {
      setSnapshot(await storageServiceClient.projectResources.updateLayout(projectId, layout))
    } catch (error) {
      setSnapshot(previous)
      if (error instanceof StorageRevisionConflict) {
        await loadSnapshot().catch(() => undefined)
        setNotice('资源库已在其他位置更新，已重新载入')
      } else {
        setNotice(error instanceof Error ? error.message : '排序保存失败')
      }
    }
  }

  const createFolder = async () => {
    try {
      const created = await storageServiceClient.projectResources.createFolder(projectId, {
        name: '新建文件夹',
        parentId: selectedFolderId
      })
      setSnapshot(current => ({ ...current, folders: [...current.folders, created] }))
      setCollapsedFolders(current => {
        const next = new Set(current)
        if (selectedFolderId) next.delete(selectedFolderId)
        return next
      })
      setEditingFolderId(created.id)
      setEditingFolderName(created.name)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '新建文件夹失败')
    }
  }

  const commitFolderRename = async (folder: ProjectResourceFolder) => {
    const name = editingFolderName.trim()
    setEditingFolderId(null)
    if (!name || name === folder.name) return
    const previous = snapshot
    setSnapshot(current => ({
      ...current,
      folders: current.folders.map(item => item.id === folder.id ? { ...item, name } : item)
    }))
    try {
      const updated = await storageServiceClient.projectResources.updateFolder(
        projectId, folder.id, folder.revision, { name }
      )
      setSnapshot(current => ({
        ...current,
        folders: current.folders.map(item => item.id === folder.id ? updated : item)
      }))
    } catch (error) {
      setSnapshot(previous)
      if (error instanceof StorageRevisionConflict) await loadSnapshot().catch(() => undefined)
      setNotice(error instanceof Error ? error.message : '重命名失败')
    }
  }

  const deleteFolder = async (folder: ProjectResourceFolder) => {
    try {
      await storageServiceClient.projectResources.deleteFolder(projectId, folder.id, folder.revision)
      setSnapshot(current => ({
        ...current,
        folders: current.folders.filter(item => item.id !== folder.id)
      }))
      if (selectedFolderId === folder.id) setSelectedFolderId(folder.parentId)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '文件夹非空，无法删除')
    }
  }

  const deleteResource = async (resource: ProjectResource) => {
    const previous = snapshot
    setSnapshot(current => ({
      ...current,
      resources: current.resources.filter(item => item.id !== resource.id)
    }))
    try {
      await storageServiceClient.projectResources.deleteResource(projectId, resource.id, resource.revision)
    } catch (error) {
      setSnapshot(previous)
      if (error instanceof StorageRevisionConflict) await loadSnapshot().catch(() => undefined)
      setNotice(error instanceof Error ? error.message : '删除失败')
    }
  }

  const commitResourceRename = async (resource: ProjectResource) => {
    const name = editingResourceName.trim()
    setEditingResourceId(null)
    if (!name || name === resource.name) return
    const previous = snapshot
    setSnapshot(current => ({
      ...current,
      resources: current.resources.map(item => item.id === resource.id ? { ...item, name } : item)
    }))
    try {
      const updated = await storageServiceClient.projectResources.updateResource(
        projectId, resource.id, resource.revision, { name }
      )
      setSnapshot(current => ({
        ...current,
        resources: current.resources.map(item => item.id === resource.id ? updated : item)
      }))
    } catch (error) {
      setSnapshot(previous)
      if (error instanceof StorageRevisionConflict) await loadSnapshot().catch(() => undefined)
      setNotice(error instanceof Error ? error.message : '重命名失败')
    }
  }

  const uploadFiles = async (incomingFiles: File[]) => {
    if (resourceApiUnavailable) {
      try {
        await loadSnapshot()
      } catch {
        setNotice(projectResourcesUnavailableMessage)
        return
      }
    }
    const files = incomingFiles.filter(isSupportedResourceImage)
    if (files.length === 0) {
      setNotice('仅支持 JPEG、PNG、WebP、BMP、TIFF、GIF、HEIC 和 HEIF 图片。')
      return
    }
    const targetKind = kind
    const targetFolderId = targetKind === 'material' ? selectedFolderId : null
    setUploading(true)
    setNotice(null)
    let succeeded = 0
    try {
      for (const file of files) {
        try {
          const imported = await storageServiceClient.imageAssets.import(file)
          const created = await storageServiceClient.projectResources.createResource(projectId, {
            kind: targetKind,
            name: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || '未命名图片',
            sourceAssetId: imported.originalAsset.id,
            previewAssetId: imported.previewAsset.id,
            providerAssetId: imported.providerInputAsset.id,
            width: imported.width,
            height: imported.height,
            contentType: imported.originalAsset.contentType,
            folderId: targetFolderId
          })
          setSnapshot(current => ({ ...current, resources: [...current.resources, created] }))
          succeeded += 1
        } catch (error) {
          if (error instanceof StorageHttpError && error.status === 404) {
            setResourceApiUnavailable(true)
            setNotice(projectResourcesUnavailableMessage)
            break
          }
          setNotice(`${succeeded} 张已加入；${file.name} 上传失败：${error instanceof Error ? error.message : '未知错误'}`)
        }
      }
      if (succeeded === files.length) {
        setNotice(
          incomingFiles.length > files.length
            ? `${succeeded} 张图片已加入；已忽略不支持的文件`
            : `${succeeded} 张图片已加入${targetKind === 'subject' ? '主体库' : '素材库'}`
        )
      }
    } finally {
      setUploading(false)
    }
  }

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length > 0) await uploadFiles(files)
  }

  const handleExternalDragEnter = (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    setFileDragActive(true)
  }

  const handleExternalDragOver = (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setFileDragActive(true)
  }

  const handleExternalDragLeave = (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return
    event.stopPropagation()
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setFileDragActive(false)
  }

  const handleExternalDrop = async (event: DragEvent) => {
    if (!isExternalFileDrag(event)) return
    event.preventDefault()
    event.stopPropagation()
    setFileDragActive(false)
    await uploadFiles(Array.from(event.dataTransfer.files))
  }

  const beginDrag = (event: DragEvent, item: DragItem, resource?: ProjectResource) => {
    dragItemRef.current = item
    event.dataTransfer.effectAllowed = resource?.kind === 'material' ? 'copyMove' : 'move'
    event.dataTransfer.setData('application/x-project-resource', JSON.stringify(item))
    if (resource?.kind === 'material') {
      event.dataTransfer.setData(PROJECT_MATERIAL_DRAG_MIME, JSON.stringify({
        projectId,
        id: resource.id,
        name: resource.name,
        sourceAssetId: resource.sourceAssetId,
        previewAssetId: resource.previewAssetId,
        width: resource.width,
        height: resource.height
      }))
    }
  }

  const readDragItem = (event: DragEvent): DragItem | null => {
    if (dragItemRef.current) return dragItemRef.current
    try {
      return JSON.parse(event.dataTransfer.getData('application/x-project-resource')) as DragItem
    } catch {
      return null
    }
  }

  const dropIntoFolder = (event: DragEvent, parentId: string | null) => {
    event.preventDefault()
    event.stopPropagation()
    const dragged = readDragItem(event)
    dragItemRef.current = null
    if (!dragged) return
    const previous = snapshot
    if (dragged.type === 'folder') {
      if (!canMoveFolder(snapshot.folders, dragged.id, parentId)) {
        setNotice('不能把文件夹移动到自身或其子文件夹中')
        return
      }
      const siblingCount = snapshot.folders.filter(folder => folder.parentId === parentId && folder.id !== dragged.id).length
      const next = {
        ...snapshot,
        folders: snapshot.folders.map(folder => folder.id === dragged.id
          ? { ...folder, parentId, sortOrder: siblingCount }
          : folder)
      }
      void persistLayout(next, previous)
      return
    }
    const draggedResource = snapshot.resources.find(resource => resource.id === dragged.id)
    if (!draggedResource || draggedResource.kind !== 'material') return
    const siblingCount = snapshot.resources.filter(resource => resource.folderId === parentId && resource.id !== dragged.id).length
    const next = {
      ...snapshot,
      resources: snapshot.resources.map(resource => resource.id === dragged.id
        ? { ...resource, folderId: parentId, sortOrder: siblingCount }
        : resource)
    }
    void persistLayout(next, previous)
  }

  const dropBeforeResource = (event: DragEvent, target: ProjectResource) => {
    event.preventDefault()
    event.stopPropagation()
    const dragged = readDragItem(event)
    dragItemRef.current = null
    if (!dragged || dragged.type !== 'resource' || dragged.id === target.id) return
    const moving = snapshot.resources.find(resource => resource.id === dragged.id)
    if (!moving || moving.kind !== target.kind) return
    const folderId = target.kind === 'subject' ? null : target.folderId
    const siblings = snapshot.resources
      .filter(resource => resource.kind === target.kind && resource.folderId === folderId && resource.id !== moving.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const targetIndex = siblings.findIndex(resource => resource.id === target.id)
    siblings.splice(Math.max(0, targetIndex), 0, { ...moving, folderId })
    const order = new Map(siblings.map((resource, index) => [resource.id, index]))
    const previous = snapshot
    const next = {
      ...snapshot,
      resources: snapshot.resources.map(resource => {
        const sortOrder = order.get(resource.id)
        return sortOrder === undefined ? resource : {
          ...resource,
          folderId: resource.id === moving.id ? folderId : resource.folderId,
          sortOrder
        }
      })
    }
    void persistLayout(next, previous)
  }

  const dropBeforeFolder = (event: DragEvent, target: ProjectResourceFolder) => {
    event.preventDefault()
    event.stopPropagation()
    const dragged = readDragItem(event)
    dragItemRef.current = null
    if (!dragged || dragged.type !== 'folder' || dragged.id === target.id) return
    if (!canMoveFolder(snapshot.folders, dragged.id, target.parentId)) {
      setNotice('不能把文件夹移动到自身或其子文件夹中')
      return
    }
    const moving = snapshot.folders.find(folder => folder.id === dragged.id)
    if (!moving) return
    const siblings = snapshot.folders
      .filter(folder => folder.parentId === target.parentId && folder.id !== moving.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const targetIndex = siblings.findIndex(folder => folder.id === target.id)
    siblings.splice(Math.max(0, targetIndex), 0, { ...moving, parentId: target.parentId })
    const order = new Map(siblings.map((folder, index) => [folder.id, index]))
    const previous = snapshot
    const next = {
      ...snapshot,
      folders: snapshot.folders.map(folder => {
        const sortOrder = order.get(folder.id)
        return sortOrder === undefined ? folder : {
          ...folder,
          parentId: folder.id === moving.id ? target.parentId : folder.parentId,
          sortOrder
        }
      })
    }
    void persistLayout(next, previous)
  }

  const renderFolders = (parentId: string | null, depth = 0): JSX.Element[] => visibleSnapshot.folders
    .filter(folder => folder.parentId === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap(folder => {
      const collapsed = collapsedFolders.has(folder.id)
      const children = collapsed ? [] : renderFolders(folder.id, depth + 1)
      return [
        <div key={folder.id}>
          <div
            draggable
            className={`group flex h-8 items-center gap-1 rounded-md pr-1 text-xs ${
              selectedFolderId === folder.id ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
            style={{ paddingLeft: Math.min(depth * 12, 48) + 4 }}
            title={buildFolderPath(visibleSnapshot.folders, folder.id)}
            onDragStart={event => beginDrag(event, { type: 'folder', id: folder.id })}
            onDragOver={event => event.preventDefault()}
            onDrop={event => dropBeforeFolder(event, folder)}
          >
            <button
              type="button"
              className="grid h-6 w-5 shrink-0 place-items-center"
              onClick={() => setCollapsedFolders(current => {
                const next = new Set(current)
                if (next.has(folder.id)) next.delete(folder.id)
                else next.add(folder.id)
                return next
              })}
              aria-label={collapsed ? '展开文件夹' : '收起文件夹'}
            >
              {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            <span
              className="grid h-6 w-5 shrink-0 place-items-center rounded hover:bg-orange-100"
              title="拖到此处移入文件夹"
              onDragOver={event => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onDrop={event => dropIntoFolder(event, folder.id)}
            >
              <Folder className="h-3.5 w-3.5" />
            </span>
            {editingFolderId === folder.id ? (
              <input
                autoFocus
                value={editingFolderName}
                maxLength={80}
                className="min-w-0 flex-1 rounded border border-orange-300 bg-white px-1 py-0.5 outline-none"
                onChange={event => setEditingFolderName(event.target.value)}
                onBlur={() => void commitFolderRename(folder)}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setEditingFolderId(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => setSelectedFolderId(folder.id)}
                onDoubleClick={() => {
                  setEditingFolderId(folder.id)
                  setEditingFolderName(folder.name)
                }}
              >
                {folder.name}
              </button>
            )}
            <button
              type="button"
              className="hidden rounded p-1 text-gray-400 hover:bg-white hover:text-red-600 group-hover:block"
              title="删除空文件夹"
              onClick={() => void deleteFolder(folder)}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          {children}
        </div>
      ]
    })

  const cardResources = kind === 'subject'
    ? resources.sort((a, b) => a.sortOrder - b.sortOrder)
    : visibleMaterials.sort((a, b) => a.sortOrder - b.sortOrder)

  const handleCardAction = (resource: ProjectResource) => {
    if (resource.kind === 'material') {
      onPlaceMaterial(resource)
      setNotice('素材已置入画布')
      return
    }
    const result = onAddSubject(resource)
    setNotice(result.reason === 'duplicate'
      ? '当前生成草稿已包含该主体'
      : result.reason === 'limit'
        ? '已达到当前模型的参考图上限'
        : '主体已加入本轮，请确认后再发送')
  }

  return (
    <>
      <aside
        data-project-resource-library
        className={`absolute bottom-4 left-3 top-24 z-40 flex overflow-visible rounded-xl border bg-white/95 shadow-[0_14px_40px_rgba(15,23,42,0.12)] backdrop-blur transition-[width] ${
          fileDragActive ? 'border-orange-400 ring-2 ring-orange-200' : 'border-gray-200'
        } ${
          expanded ? 'w-[280px]' : 'w-11'
        }`}
      >
        <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-gray-100 py-2">
          <button
            type="button"
            className="mb-2 grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-950"
            onClick={() => onExpandedChange(!expanded)}
            title={expanded ? '收起项目资源库' : '展开项目资源库'}
          >
            {expanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <ResourceRailButton
            active={expanded && kind === 'subject'}
            label="主体"
            icon={<Shapes className="h-4 w-4" />}
            onClick={() => {
              setKind('subject')
              onExpandedChange(true)
            }}
          />
          <ResourceRailButton
            active={expanded && kind === 'material'}
            label="素材"
            icon={<ImageIcon className="h-4 w-4" />}
            onClick={() => {
              setKind('material')
              onExpandedChange(true)
            }}
          />
          <button
            type="button"
            className="mt-auto grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-950"
            onClick={() => uploadInputRef.current?.click()}
            title={`上传到${kind === 'subject' ? '主体库' : '素材库'}`}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </nav>

        {expanded && (
          <div
            data-project-resource-dropzone
            className="flex min-w-0 flex-1 flex-col overflow-hidden"
            onDragEnter={handleExternalDragEnter}
            onDragOver={handleExternalDragOver}
            onDragLeave={handleExternalDragLeave}
            onDrop={handleExternalDrop}
          >
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-gray-100 px-3">
              <div>
                <div className="text-xs font-black text-gray-950">{kind === 'subject' ? '项目主体' : '项目素材'}</div>
                <div className="text-[10px] text-gray-400">{kind === 'subject' ? '用于本项目图片生成' : '仅作视觉归类与置入画布'}</div>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
                onClick={() => onExpandedChange(false)}
                aria-label="收起资源库"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {kind === 'material' && (
              <div className="shrink-0 border-b border-gray-100 p-2">
                <div
                  className={`flex h-8 items-center gap-2 rounded-md px-2 text-xs ${
                    selectedFolderId === null ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => dropIntoFolder(event, null)}
                >
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelectedFolderId(null)}>
                    <Folder className="h-3.5 w-3.5" />
                    <span>全部素材 / 根目录</span>
                  </button>
                  <button type="button" className="rounded p-1 hover:bg-white" title="新建子文件夹" onClick={() => void createFolder()}>
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 max-h-36 overflow-y-auto">{renderFolders(null)}</div>
              </div>
            )}

            <div
              className="min-h-0 flex-1 overflow-y-auto p-2"
              onDragOver={event => {
                if (kind === 'material') event.preventDefault()
              }}
              onDrop={event => {
                if (kind === 'material') dropIntoFolder(event, selectedFolderId)
              }}
            >
              {loading ? (
                <div className="grid h-28 place-items-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : cardResources.length === 0 ? (
                <button
                  type="button"
                  className="flex h-28 w-full flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 text-[11px] text-gray-400 hover:border-orange-300 hover:text-orange-600"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload className="mb-2 h-5 w-5" />
                  点击上传或拖入第一张{kind === 'subject' ? '主体图' : '素材'}
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {cardResources.map(resource => (
                    <div
                      key={resource.id}
                      draggable
                      tabIndex={0}
                      className="group relative min-w-0 rounded-md border border-gray-200 bg-white p-1 outline-none transition hover:border-orange-300 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      title={resource.name}
                      onDragStart={event => beginDrag(event, { type: 'resource', id: resource.id }, resource)}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => dropBeforeResource(event, resource)}
                      onMouseEnter={event => showPreviewLater(resource, event.currentTarget)}
                      onMouseLeave={hidePreviewLater}
                      onFocus={(event: FocusEvent<HTMLDivElement>) => showPreviewLater(resource, event.currentTarget)}
                      onBlur={hidePreviewLater}
                      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                        if (event.key === 'Enter') handleCardAction(resource)
                        if (event.key === 'Delete') void deleteResource(resource)
                      }}
                    >
                      <img
                        src={storageServiceClient.assets.url(resource.previewAssetId)}
                        alt=""
                        className="aspect-square w-full rounded object-cover"
                        draggable={false}
                      />
                      {editingResourceId === resource.id ? (
                        <input
                          autoFocus
                          value={editingResourceName}
                          maxLength={80}
                          className="mt-1 w-full rounded border border-orange-300 px-1 text-[9px] outline-none"
                          onChange={event => setEditingResourceName(event.target.value)}
                          onBlur={() => void commitResourceRename(resource)}
                          onKeyDown={event => {
                            event.stopPropagation()
                            if (event.key === 'Enter') event.currentTarget.blur()
                            if (event.key === 'Escape') setEditingResourceId(null)
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="mt-1 block w-full truncate text-left text-[9px] font-semibold text-gray-700"
                          onDoubleClick={() => {
                            setEditingResourceId(resource.id)
                            setEditingResourceName(resource.name)
                          }}
                        >
                          {resource.name}
                        </button>
                      )}
                      <div className="absolute inset-x-1 top-1 hidden items-center justify-between rounded bg-gray-950/70 px-0.5 py-0.5 group-hover:flex group-focus:flex">
                        <button
                          type="button"
                          className="rounded px-1 text-[9px] font-bold text-white hover:bg-white/20"
                          onClick={() => handleCardAction(resource)}
                        >
                          {resource.kind === 'subject' ? '加入' : '置入'}
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 text-white hover:bg-red-500"
                          title="删除"
                          onClick={() => void deleteResource(resource)}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {notice && (
              <div className="shrink-0 border-t border-gray-100 px-2 py-1.5 text-[10px] leading-4 text-gray-500">
                {notice}
              </div>
            )}
          </div>
        )}
        {expanded && fileDragActive && (
          <div className="pointer-events-none absolute inset-y-0 left-11 right-0 z-50 grid place-items-center rounded-r-xl bg-white/90 px-4 text-center backdrop-blur-sm">
            <div>
              <Upload className="mx-auto h-6 w-6 text-orange-600" />
              <div className="mt-2 text-xs font-black text-gray-950">松开以加入{kind === 'subject' ? '主体库' : '素材库'}</div>
              <div className="mt-1 text-[10px] text-gray-500">支持批量拖入图片</div>
            </div>
          </div>
        )}
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={event => void handleUpload(event)}
        />
      </aside>

      {preview && expanded && (
        <div
          className="pointer-events-none fixed left-[302px] z-[70] w-72 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
          style={{ top: preview.top }}
          role="tooltip"
        >
          <img
            src={storageServiceClient.assets.url(preview.resource.previewAssetId)}
            alt={preview.resource.name}
            className="max-h-72 w-full rounded-lg object-contain bg-gray-50"
          />
          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <span className="truncate text-xs font-bold text-gray-900">{preview.resource.name}</span>
            <span className="shrink-0 text-[10px] text-gray-400">{preview.resource.width} × {preview.resource.height}</span>
          </div>
        </div>
      )}
    </>
  )
}

const ResourceRailButton = ({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) => (
  <button
    type="button"
    className={`flex h-12 w-9 flex-col items-center justify-center gap-0.5 rounded-lg text-[9px] font-bold transition ${
      active ? 'bg-orange-50 text-orange-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950'
    }`}
    onClick={onClick}
    title={label}
  >
    {icon}
    <span>{label}</span>
  </button>
)
