import { AlertTriangle, Download, FileImage, HardDrive, Info, Search, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  storageServiceClient,
  type AssetReference,
  type StorageArtifact,
  type StorageArtifactCategory,
  type StorageArtifactMediaType,
  type StorageUsageSummary
} from '@/storage/storage-service-client'

const categories: Array<{ value: StorageArtifactCategory; label: string }> = [
  { value: 'generated-content', label: '生成内容' },
  { value: 'external-media', label: '外部媒体' },
  { value: 'project-material', label: '项目素材' },
  { value: 'other', label: '其他文件' }
]

export const FileStorageScreen = ({ mode = 'active' }: { mode?: 'active' | 'trash' }) => {
  const [category, setCategory] = useState<StorageArtifactCategory>('generated-content')
  const [query, setQuery] = useState('')
  const [mediaType, setMediaType] = useState<StorageArtifactMediaType | ''>('')
  const [sort, setSort] = useState<'created-desc' | 'size-desc' | 'name-asc'>('created-desc')
  const [summary, setSummary] = useState<StorageUsageSummary | null>(null)
  const [artifacts, setArtifacts] = useState<StorageArtifact[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [references, setReferences] = useState<{ title: string; items: AssetReference[] } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [nextSummary, page] = await Promise.all([
        storageServiceClient.storageArtifacts.getSummary(),
        storageServiceClient.storageArtifacts.getPage({
          category, status: mode, mediaType: mediaType || undefined,
          query: query.trim() || undefined, sort, limit: 100
        })
      ])
      setSummary(nextSummary)
      setArtifacts(page.artifacts)
      setSelectedIds(current => current.filter(id => page.artifacts.some(item => item.assetId === id)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文件数据加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [category, mediaType, mode, query, sort])

  useEffect(() => { void refresh() }, [refresh])

  const runAction = async (action: () => Promise<unknown>) => {
    setError('')
    try {
      await action()
      setSelectedIds([])
      await refresh()
      window.dispatchEvent(new CustomEvent('promptcard:storage-artifacts-changed'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文件操作失败，请重试。')
    }
  }

  const showReferences = async (artifact: StorageArtifact) => {
    try {
      setReferences({
        title: artifact.title,
        items: await storageServiceClient.storageArtifacts.getReferences(artifact.assetId)
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '引用信息加载失败。')
    }
  }

  return (
    <>
      <FileStorageScreenView
        mode={mode}
        category={category}
        summary={summary}
        artifacts={artifacts}
        selectedIds={selectedIds}
        loading={loading}
        error={error}
        query={query}
        mediaType={mediaType}
        sort={sort}
        onCategoryChange={value => { setCategory(value); setSelectedIds([]) }}
        onQueryChange={setQuery}
        onMediaTypeChange={setMediaType}
        onSortChange={setSort}
        onToggleSelection={assetId => setSelectedIds(current => current.includes(assetId)
          ? current.filter(id => id !== assetId)
          : [...current, assetId])}
        onTrash={ids => void runAction(() => storageServiceClient.storageArtifacts.trash(ids))}
        onRestore={ids => void runAction(() => storageServiceClient.storageArtifacts.restore(ids))}
        onDeleteForever={ids => {
          if (window.confirm(`永久删除所选 ${ids.length} 个文件？此操作无法撤销。`)) {
            void runAction(() => storageServiceClient.storageArtifacts.deleteForever(ids))
          }
        }}
        onShowReferences={artifact => void showReferences(artifact)}
        onReconcileOrphans={() => {
          if (window.confirm('将所有已确认无业务引用的文件移入回收站？')) {
            void runAction(() => storageServiceClient.storageArtifacts.reconcileOrphans())
          }
        }}
      />
      {references && (
        <ReferenceDialog title={references.title} references={references.items} onClose={() => setReferences(null)} />
      )}
    </>
  )
}

interface FileStorageScreenViewProps {
  mode: 'active' | 'trash'
  category: StorageArtifactCategory
  summary: StorageUsageSummary | null
  artifacts: StorageArtifact[]
  selectedIds: string[]
  loading: boolean
  error?: string
  query: string
  mediaType: StorageArtifactMediaType | ''
  sort: 'created-desc' | 'size-desc' | 'name-asc'
  onCategoryChange: (category: StorageArtifactCategory) => void
  onQueryChange: (query: string) => void
  onMediaTypeChange: (mediaType: StorageArtifactMediaType | '') => void
  onSortChange: (sort: 'created-desc' | 'size-desc' | 'name-asc') => void
  onToggleSelection: (assetId: string) => void
  onTrash: (ids: string[]) => void
  onRestore: (ids: string[]) => void
  onDeleteForever: (ids: string[]) => void
  onShowReferences: (artifact: StorageArtifact) => void
  onReconcileOrphans: () => void
}

export const FileStorageScreenView = ({
  mode, category, summary, artifacts, selectedIds, loading, error = '', query, mediaType, sort,
  onCategoryChange, onQueryChange, onMediaTypeChange, onSortChange, onToggleSelection,
  onTrash, onRestore, onDeleteForever, onShowReferences, onReconcileOrphans
}: FileStorageScreenViewProps) => {
  const selection = selectedIds.length > 0 ? selectedIds : []
  return (
    <section data-file-storage-screen className="min-h-screen bg-[#f7f7f5] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-amber-600">
              <HardDrive className="h-4 w-4" /> Local asset registry
            </div>
            <h1 className="text-3xl font-black tracking-tight text-gray-950">{mode === 'trash' ? '文件回收站' : '文件'}</h1>
            <p className="mt-2 text-sm text-gray-500">{mode === 'trash' ? '恢复文件，或在确认引用安全后永久删除。' : '统一查看生成内容、外部媒体和项目素材。'}</p>
          </div>
          {mode === 'active' && summary && summary.orphanBytes > 0 && (
            <button type="button" onClick={onReconcileOrphans} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800">
              整理无引用文件 · {formatBytes(summary.orphanBytes)}
            </button>
          )}
        </header>

        {summary && <StorageSummary summary={summary} />}

        <nav className="flex flex-wrap gap-2" aria-label="文件来源分类">
          {categories.map(item => (
            <button
              type="button"
              key={item.value}
              data-file-category={item.value}
              aria-pressed={category === item.value}
              onClick={() => onCategoryChange(item.value)}
              className={`rounded-lg px-4 py-2 text-sm font-black ${category === item.value ? 'bg-gray-950 text-white' : 'border border-gray-200 bg-white text-gray-500'}`}
            >{item.label}</button>
          ))}
        </nav>

        <div className="flex flex-wrap gap-3 rounded-xl border border-gray-200 bg-white p-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input aria-label="搜索文件" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="搜索文件名" className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm outline-none" />
          </label>
          <select aria-label="文件类型" value={mediaType} onChange={event => onMediaTypeChange(event.target.value as StorageArtifactMediaType | '')} className="rounded-lg border border-gray-200 px-3 text-sm font-bold">
            <option value="">全部类型</option><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option><option value="other">其他</option>
          </select>
          <select aria-label="文件排序" value={sort} onChange={event => onSortChange(event.target.value as FileStorageScreenViewProps['sort'])} className="rounded-lg border border-gray-200 px-3 text-sm font-bold">
            <option value="created-desc">最新创建</option><option value="size-desc">容量最大</option><option value="name-asc">名称排序</option>
          </select>
        </div>

        {selection.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-sm font-black text-blue-900">已选择 {selection.length} 个文件</span>
            <div className="flex gap-2">
              {mode === 'active' ? (
                <button type="button" onClick={() => onTrash(selection)} className="rounded-lg bg-gray-950 px-4 py-2 text-xs font-black text-white">移入回收站</button>
              ) : (
                <>
                  <button type="button" onClick={() => onRestore(selection)} className="rounded-lg bg-white px-4 py-2 text-xs font-black text-gray-900">恢复所选</button>
                  <button type="button" onClick={() => onDeleteForever(selection)} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-black text-white">永久删除</button>
                </>
              )}
            </div>
          </div>
        )}

        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
        {loading ? <p role="status" className="py-16 text-center text-sm font-bold text-gray-400">正在加载文件…</p> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {artifacts.map(artifact => (
              <ArtifactCard
                key={artifact.assetId}
                artifact={artifact}
                selected={selectedIds.includes(artifact.assetId)}
                mode={mode}
                onToggle={() => onToggleSelection(artifact.assetId)}
                onTrash={() => onTrash([artifact.assetId])}
                onRestore={() => onRestore([artifact.assetId])}
                onDeleteForever={() => onDeleteForever([artifact.assetId])}
                onShowReferences={() => onShowReferences(artifact)}
              />
            ))}
            {artifacts.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center text-sm font-bold text-gray-400">当前分类暂无文件</div>}
          </div>
        )}
      </div>
    </section>
  )
}

const StorageSummary = ({ summary }: { summary: StorageUsageSummary }) => {
  const assetRatio = Math.min(100, (summary.userAssetBytes / Math.max(summary.assetSoftThresholdBytes, 1)) * 100)
  const diskUsedRatio = Math.min(100, ((summary.diskTotalBytes - summary.diskFreeBytes) / Math.max(summary.diskTotalBytes, 1)) * 100)
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-storage-summary>
      <CapacityCard title="用户资产" value={`${formatBytes(summary.userAssetBytes)} / ${formatBytes(summary.assetSoftThresholdBytes)} 软阈值`} ratio={assetRatio} warning={summary.assetWarningLevel !== 'normal'} detail={`回收站 ${formatBytes(summary.trashBytes)} · 系统数据 ${formatBytes(summary.systemBytes)}`} />
      <CapacityCard title="本地磁盘" value={`剩余 ${formatBytes(summary.diskFreeBytes)}`} ratio={diskUsedRatio} warning={summary.diskWarningLevel !== 'normal'} detail={summary.diskWarningLevel === 'normal' ? '磁盘空间充足' : '请及时整理本地文件'} />
    </div>
  )
}

const CapacityCard = ({ title, value, ratio, warning, detail }: { title: string; value: string; ratio: number; warning: boolean; detail: string }) => (
  <div className={`rounded-xl border p-4 ${warning ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-black text-gray-500">{title}</span>{warning && <AlertTriangle className="h-4 w-4 text-amber-600" />}</div>
    <div className="mt-2 text-lg font-black text-gray-950">{value}</div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${warning ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${ratio}%` }} /></div>
    <div className="mt-2 text-xs font-bold text-gray-400">{detail}</div>
  </div>
)

const ArtifactCard = ({ artifact, selected, mode, onToggle, onTrash, onRestore, onDeleteForever, onShowReferences }: {
  artifact: StorageArtifact; selected: boolean; mode: 'active' | 'trash'; onToggle: () => void; onTrash: () => void; onRestore: () => void; onDeleteForever: () => void; onShowReferences: () => void
}) => (
  <article className={`overflow-hidden rounded-xl border bg-white ${selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`} data-storage-artifact={artifact.assetId}>
    <div className="relative aspect-video bg-gray-100">
      {artifact.mediaType === 'image' ? <img src={artifact.previewUrl} alt={artifact.title} className="h-full w-full object-cover" /> : artifact.mediaType === 'video' ? <video src={artifact.previewUrl} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-gray-400"><FileImage /></div>}
      <label className="absolute left-3 top-3 rounded-md bg-white/90 p-2 shadow"><input type="checkbox" checked={selected} onChange={onToggle} aria-label={`选择 ${artifact.title}`} /></label>
    </div>
    <div className="space-y-3 p-4">
      <div><h2 className="truncate text-sm font-black text-gray-950" title={artifact.title}>{artifact.title}</h2><p className="mt-1 text-xs font-bold text-gray-400">{formatBytes(artifact.sizeBytes)} · {new Date(artifact.createdAt).toLocaleString()}</p></div>
      <div className="flex flex-wrap gap-2">
        <a href={storageServiceClient.storageArtifacts.downloadUrl(artifact.assetId)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-black text-gray-700"><Download className="h-3.5 w-3.5" />导出原文件</a>
        <button type="button" onClick={onShowReferences} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-black text-gray-700"><Info className="h-3.5 w-3.5" />引用 {artifact.referenceCount}</button>
        {mode === 'active' ? <button type="button" onClick={onTrash} className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-black text-red-600"><Trash2 className="h-3.5 w-3.5" />移入回收站</button> : <><button type="button" onClick={onRestore} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-black"><Undo2 className="h-3.5 w-3.5" />恢复</button><button type="button" onClick={onDeleteForever} className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-black text-white">永久删除</button></>}
      </div>
    </div>
  </article>
)

const ReferenceDialog = ({ title, references, onClose }: { title: string; references: AssetReference[]; onClose: () => void }) => (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="文件引用">
    <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">{title} 的引用</h2><button type="button" onClick={onClose} className="text-sm font-bold text-gray-500">关闭</button></div>
      <div className="mt-4 space-y-2">{references.map(reference => <div key={`${reference.kind}-${reference.id}`} className="rounded-lg border p-3 text-sm"><span className="font-black">{reference.title}</span><span className="ml-2 text-xs text-gray-400">{reference.kind === 'project' ? '项目' : 'Prompt'} · {reference.status === 'trash' ? '回收站' : '使用中'}</span></div>)}{references.length === 0 && <p className="text-sm text-gray-500">当前没有阻止永久删除的业务引用。</p>}</div>
    </div>
  </div>
)

const formatBytes = (value: number): string => {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GiB`
}

export default FileStorageScreen
