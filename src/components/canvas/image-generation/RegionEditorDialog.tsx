import {
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'
import {
  bboxFromDisplayDrag,
  containedImageRect,
  createRegionHistory,
  displayToRegionPoint,
  reduceRegionHistory,
  regionToDisplayPoint,
  validateBoundImageRegions,
  type BoundImageRegion,
  type BoundImageRegionValidationError,
  type DisplayPoint,
  type ImageDisplayMetrics,
  type ImageRegionCapabilities,
  type ImageRegionSource
} from '@/domain/image-generation/regions'

type RegionTool = 'point' | 'bbox'

export interface RegionEditorDialogProps {
  scopeKey?: string
  mode: 'edit' | 'region-edit'
  capabilities: ImageRegionCapabilities
  sources: readonly ImageRegionSource[]
  initialRegions: readonly BoundImageRegion[]
  onSave: (regions: BoundImageRegion[]) => void
  onClose?: () => void
}

export interface RegionEditorDialogViewProps extends Omit<RegionEditorDialogProps, 'initialRegions'> {
  activeSourceReferenceId: string | null
  activeTool: RegionTool | null
  regions: BoundImageRegion[]
  selectedRegionId: string | null
  canUndo: boolean
  canRedo: boolean
  validationErrors: BoundImageRegionValidationError[]
  displayMetrics?: ImageDisplayMetrics | null
  viewportRef?: RefObject<HTMLDivElement>
  imageRef?: RefObject<HTMLImageElement>
  onSelectSource: (referenceId: string) => void
  onSelectTool: (tool: RegionTool) => void
  onUndo: () => void
  onRedo: () => void
  onDeleteRegion: (regionId: string) => void
  onMoveRegion: (regionId: string, dx: number, dy: number) => void
  onRebindRegion: (regionId: string) => void
  onSelectRegion: (regionId: string) => void
  onImagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onImagePointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
  onImageLoad?: () => void
}

export const RegionEditorDialog = ({
  scopeKey,
  mode,
  capabilities,
  sources,
  initialRegions,
  onSave,
  onClose
}: RegionEditorDialogProps) => {
  const sourceImage = sources.find(source => source.role === 'source-image') || null
  const preferredSourceReferenceId = sourceImage?.referenceId || sources[0]?.referenceId || null
  const [activeSourceReferenceId, setActiveSourceReferenceId] = useState<string | null>(
    preferredSourceReferenceId
  )
  const [activeTool, setActiveTool] = useState<RegionTool | null>(
    mode === 'region-edit' ? capabilities.regionInputs[0] || null : null
  )
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(initialRegions[0]?.id || null)
  const [history, dispatch] = useReducer(reduceRegionHistory, initialRegions, createRegionHistory)
  const [displayMetrics, setDisplayMetrics] = useState<ImageDisplayMetrics | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef<DisplayPoint | null>(null)
  const initialRegionsKey = JSON.stringify(initialRegions)
  const initialRegionsSnapshot = useMemo<BoundImageRegion[]>(
    () => JSON.parse(initialRegionsKey) as BoundImageRegion[],
    [initialRegionsKey]
  )
  const sourcesKey = JSON.stringify(sources.map(source => ({
    referenceId: source.referenceId,
    role: source.role,
    assetId: source.assetId
  })))
  const regionInputsKey = capabilities.regionInputs.join('|')

  const activeSource = sources.find(source => source.referenceId === activeSourceReferenceId) || null
  const validation = useMemo(() => validateBoundImageRegions(
    history.present,
    activeSourceReferenceId,
    sources.map(source => source.referenceId)
  ), [activeSourceReferenceId, history.present, sources])

  const measureImage = useCallback(() => {
    const viewport = viewportRef.current
    const image = imageRef.current
    if (!viewport || !image?.naturalWidth || !image.naturalHeight) return null
    const next = {
      viewportWidth: viewport.clientWidth,
      viewportHeight: viewport.clientHeight,
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      devicePixelRatio: window.devicePixelRatio || 1
    }
    setDisplayMetrics(next)
    return next
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measureImage)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [measureImage])

  useEffect(() => {
    dispatch({ type: 'reset', regions: initialRegionsSnapshot })
    setActiveSourceReferenceId(preferredSourceReferenceId)
    setActiveTool(mode === 'region-edit' ? capabilities.regionInputs[0] || null : null)
    setSelectedRegionId(initialRegionsSnapshot[0]?.id || null)
    setDisplayMetrics(null)
    dragStartRef.current = null
  }, [
    capabilities.regionInputs,
    initialRegionsSnapshot,
    mode,
    preferredSourceReferenceId,
    regionInputsKey,
    scopeKey,
    sourcesKey
  ])

  const pointerPosition = (event: ReactPointerEvent<HTMLDivElement>): DisplayPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const metricsForEvent = (): ImageDisplayMetrics | null => measureImage() || displayMetrics

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== 'region-edit' || !activeSource || !activeTool) return
    const metrics = metricsForEvent()
    if (!metrics) return
    const point = pointerPosition(event)
    if (activeTool === 'point') {
      const gridPoint = displayToRegionPoint(point, metrics)
      const id = nextRegionId()
      dispatch({
        type: 'add',
        region: { id, referenceId: activeSource.referenceId, type: 'point', ...gridPoint }
      })
      setSelectedRegionId(id)
      return
    }
    dragStartRef.current = point
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'bbox' || !activeSource || !dragStartRef.current) return
    const metrics = metricsForEvent()
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!metrics) return
    const region = bboxFromDisplayDrag(
      nextRegionId(),
      activeSource.referenceId,
      start,
      pointerPosition(event),
      metrics
    )
    if (!region) return
    dispatch({ type: 'add', region })
    setSelectedRegionId(region.id)
  }

  return (
    <RegionEditorDialogView
      mode={mode}
      capabilities={capabilities}
      sources={sources}
      activeSourceReferenceId={activeSourceReferenceId}
      activeTool={activeTool}
      regions={history.present}
      selectedRegionId={selectedRegionId}
      canUndo={history.past.length > 0}
      canRedo={history.future.length > 0}
      validationErrors={validation.validationErrors}
      displayMetrics={displayMetrics}
      viewportRef={viewportRef}
      imageRef={imageRef}
      onSelectSource={setActiveSourceReferenceId}
      onSelectTool={setActiveTool}
      onUndo={() => dispatch({ type: 'undo' })}
      onRedo={() => dispatch({ type: 'redo' })}
      onDeleteRegion={regionId => {
        dispatch({ type: 'delete', regionId })
        setSelectedRegionId(current => current === regionId ? null : current)
      }}
      onMoveRegion={(regionId, dx, dy) => dispatch({ type: 'move', regionId, dx, dy })}
      onRebindRegion={regionId => {
        if (activeSourceReferenceId) dispatch({ type: 'rebind', regionId, referenceId: activeSourceReferenceId })
      }}
      onSelectRegion={setSelectedRegionId}
      onImagePointerDown={handlePointerDown}
      onImagePointerUp={handlePointerUp}
      onImageLoad={measureImage}
      onSave={onSave}
      onClose={onClose}
    />
  )
}

export const RegionEditorDialogView = ({
  mode,
  capabilities,
  sources,
  activeSourceReferenceId,
  activeTool,
  regions,
  selectedRegionId,
  canUndo,
  canRedo,
  validationErrors,
  displayMetrics = null,
  viewportRef,
  imageRef,
  onSelectSource,
  onSelectTool,
  onUndo,
  onRedo,
  onDeleteRegion,
  onMoveRegion,
  onRebindRegion,
  onSelectRegion,
  onImagePointerDown,
  onImagePointerUp,
  onImageLoad,
  onSave,
  onClose
}: RegionEditorDialogViewProps) => {
  const sourceImage = sources.find(source => source.role === 'source-image') || null
  const activeSource = sources.find(source => source.referenceId === activeSourceReferenceId) || sourceImage
  const selectedRegion = regions.find(region => region.id === selectedRegionId) || null
  const hasUnresolved = validationErrors.some(error => error.code === 'unresolved_region_reference')
  const hasStale = validationErrors.some(error => error.code === 'stale_region_reference')
  const canSave = validationErrors.length === 0

  return (
    <section data-region-editor-dialog className="space-y-3 rounded-[8px] border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-950">Region editor</h3>
          <p className="text-[11px] font-semibold text-gray-500">Coordinates are stored on a 0–999 grid.</p>
        </div>
        {onClose && <button type="button" aria-label="Close region editor" className="text-xs font-bold text-gray-600" onClick={onClose}>Close</button>}
      </div>

      <label className="block text-xs font-bold text-gray-700">
        <span className="mb-1 block">Image</span>
        <select
          aria-label="Region image"
          className="w-full rounded-[6px] border border-gray-200 bg-white px-2 py-2 text-xs"
          value={activeSourceReferenceId || ''}
          disabled={sources.length === 0}
          onChange={event => onSelectSource(event.target.value)}
        >
          {sources.length === 0 && <option value="">No connected images</option>}
          {sources.map(source => (
            <option key={source.referenceId} value={source.referenceId}>{source.label}</option>
          ))}
        </select>
      </label>

      {!sourceImage && (
        <div role="alert" className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
          Source image required. Connect an image to the source-image input before using {mode === 'edit' ? 'edit' : 'region edit'} mode. Existing regions can still be rebound or removed.
        </div>
      )}

      {mode === 'region-edit' && (
        <div className="flex flex-wrap gap-2" aria-label="Region tools">
          {capabilities.regionInputs.includes('point') && (
            <button
              type="button"
              aria-label="Select point tool"
              aria-pressed={activeTool === 'point'}
              className={toolClass(activeTool === 'point')}
              onClick={() => onSelectTool('point')}
            >Point</button>
          )}
          {capabilities.regionInputs.includes('bbox') && (
            <button
              type="button"
              aria-label="Select box tool"
              aria-pressed={activeTool === 'bbox'}
              className={toolClass(activeTool === 'bbox')}
              onClick={() => onSelectTool('bbox')}
            >Box</button>
          )}
          <button type="button" aria-label="Undo region change" className={toolClass(false)} disabled={!canUndo} onClick={onUndo}>Undo</button>
          <button type="button" aria-label="Redo region change" className={toolClass(false)} disabled={!canRedo} onClick={onRedo}>Redo</button>
        </div>
      )}

      {hasUnresolved && (
        <div role="alert" className="rounded-[6px] border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900">
          Region image disconnected. Remove the region or reconnect and rebind it before generation.
        </div>
      )}
      {hasStale && (
        <div role="alert" className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
          Some regions belong to another image. Rebind or remove them before generation.
        </div>
      )}

      <div
        ref={viewportRef}
        className="relative h-64 touch-none overflow-hidden rounded-[6px] bg-gray-950"
        onPointerDown={onImagePointerDown}
        onPointerUp={onImagePointerUp}
      >
        {activeSource ? (
          <img
            ref={imageRef}
            src={activeSource.imageUrl}
            alt={activeSource.label}
            className="pointer-events-none h-full w-full object-contain"
            onLoad={onImageLoad}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs font-bold text-white/70">
            Connect an image to rebind regions, or remove stale regions below.
          </div>
        )}
        {displayMetrics && regions.map(region => (
          <RegionOverlay
            key={region.id}
            region={region}
            metrics={displayMetrics}
            selected={region.id === selectedRegionId}
            onSelect={() => onSelectRegion(region.id)}
          />
        ))}
      </div>

      {selectedRegion && (
        <div className="space-y-2 rounded-[6px] border border-gray-200 p-2">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" aria-label="Move region left" className={smallButtonClass} onClick={() => onMoveRegion(selectedRegion.id, -10, 0)}>←</button>
            <button type="button" aria-label="Move region right" className={smallButtonClass} onClick={() => onMoveRegion(selectedRegion.id, 10, 0)}>→</button>
            <button type="button" aria-label="Move region up" className={smallButtonClass} onClick={() => onMoveRegion(selectedRegion.id, 0, -10)}>↑</button>
            <button type="button" aria-label="Move region down" className={smallButtonClass} onClick={() => onMoveRegion(selectedRegion.id, 0, 10)}>↓</button>
            <button type="button" className={smallButtonClass} onClick={() => onRebindRegion(selectedRegion.id)}>Rebind to current image</button>
            <button type="button" aria-label="Delete region" className={`${smallButtonClass} text-red-700`} onClick={() => onDeleteRegion(selectedRegion.id)}>Delete region</button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onClose && <button type="button" className="rounded-[6px] px-3 py-2 text-xs font-bold text-gray-600" onClick={onClose}>Cancel</button>}
        <button
          type="button"
          data-save-regions
          disabled={!canSave}
          className="rounded-[6px] bg-gray-950 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onSave(regions)}
        >Save regions</button>
      </div>
    </section>
  )
}

const RegionOverlay = ({
  region,
  metrics,
  selected,
  onSelect
}: {
  region: BoundImageRegion
  metrics: ImageDisplayMetrics
  selected: boolean
  onSelect: () => void
}) => {
  const imageRect = containedImageRect(metrics)
  const start = regionToDisplayPoint(region, metrics)
  const style = region.type === 'point'
    ? { left: start.x, top: start.y }
    : {
        left: start.x,
        top: start.y,
        width: (region.width / 999) * imageRect.width,
        height: (region.height / 999) * imageRect.height
      }
  return (
    <button
      type="button"
      aria-label={`Select ${region.type} region`}
      className={`absolute border-2 ${region.type === 'point' ? 'h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full' : ''} ${selected ? 'border-sky-300 bg-sky-400/30' : 'border-white bg-white/10'}`}
      style={style}
      onPointerDown={event => event.stopPropagation()}
      onClick={onSelect}
    />
  )
}

const nextRegionId = (): string => `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const toolClass = (active: boolean): string => `rounded-[6px] border px-2.5 py-1.5 text-xs font-bold ${active ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200 bg-white text-gray-700'}`
const smallButtonClass = 'rounded-[6px] border border-gray-200 bg-white px-2 py-1.5 text-xs font-bold text-gray-700'

export default RegionEditorDialog
