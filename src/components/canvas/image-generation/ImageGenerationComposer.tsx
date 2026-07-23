import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  ChevronDown,
  ImagePlus,
  MoreHorizontal,
  Plus,
  Send,
  Settings2,
  Upload,
  Wand2,
  X
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent
} from 'react'
import type { ImageGenerationComposerProps, ImageGenerationWorkflow } from './types'
import {
  ReferencePromptEditor,
  type ReferencePromptEditorHandle
} from './ReferencePromptEditor'

type ComposerPopover = 'assets' | 'workflow' | 'model' | 'size' | 'more' | null

const workflowDescriptions: Record<ImageGenerationWorkflow, string> = {
  'text-to-image': '仅使用文字生成新图片',
  'reference-generate': '融合一张或多张参考图',
  'smart-edit': '以一张主图为基础进行修改',
  'region-edit': '通过点选或框选精准修改'
}

export const ImageGenerationComposer = (props: ImageGenerationComposerProps) => {
  const uploadRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const promptEditorRef = useRef<ReferencePromptEditorHandle>(null)
  const [openPopover, setOpenPopover] = useState<ComposerPopover>(null)
  const [referenceMenuId, setReferenceMenuId] = useState<string | null>(null)
  const references = useMemo(() => (
    [...(props.references || [])].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  ), [props.references])
  const maxImages = props.maxImages || 10
  const uploadBlocked = references.length >= maxImages
  const blockingRequirements = props.blockingRequirements || props.missingRequirements || []
  const blocked = Boolean(props.disabled || blockingRequirements.length)
  const selectedWorkflow = props.workflows.find(option => option.value === props.workflow)
  const selectedModel = props.models.find(option => option.value === props.modelId)
  const displayedIssues = props.missingRequirements || []

  useEffect(() => {
    if (!openPopover && !referenceMenuId) return
    if (typeof document === 'undefined') return
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!formRef.current?.contains(event.target as Node)) {
        setOpenPopover(null)
        setReferenceMenuId(null)
      }
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenPopover(null)
      setReferenceMenuId(null)
    }
    document.addEventListener('mousedown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openPopover, referenceMenuId])

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) props.onUpload(file)
    event.target.value = ''
    setOpenPopover(null)
  }

  const requestUpload = () => {
    if (!uploadBlocked) uploadRef.current?.click()
  }

  const injectSelectedNodes = () => {
    if (!props.selectedNode || !props.onInjectSelectedNode) return
    props.onInjectSelectedNode(props.selectedNode.id)
    setOpenPopover(null)
  }

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!blocked) props.onSubmit()
  }

  const submitFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      submit()
    }
  }

  const togglePopover = (popover: Exclude<ComposerPopover, null>) => {
    setReferenceMenuId(null)
    setOpenPopover(current => current === popover ? null : popover)
  }

  return (
    <form
      ref={formRef}
      aria-label="图片生成输入"
      className="relative border-t border-gray-200 bg-[#f7f7f5] p-3"
      onSubmit={submit}
    >
      <div className="relative rounded-[24px] border border-gray-200/90 bg-white px-3 pb-2.5 pt-3 shadow-[0_12px_36px_rgba(15,23,42,0.08)] transition-shadow focus-within:shadow-[0_16px_44px_rgba(15,23,42,0.12)]">
        <div className="flex min-h-[58px] gap-2 overflow-x-auto pb-1" aria-label="本轮图片输入">
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="添加图片输入"
              aria-expanded={openPopover === 'assets'}
              className="group flex h-14 w-12 -rotate-2 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-gray-400 transition hover:rotate-0 hover:border-gray-400 hover:bg-white hover:text-gray-800"
              onClick={() => togglePopover('assets')}
            >
              <Plus size={18} className="transition-transform group-hover:scale-110" aria-hidden="true" />
            </button>
            {openPopover === 'assets' && (
              <ComposerMenu className="left-0 top-[calc(100%+8px)] w-64">
                <MenuAction
                  icon={<ImagePlus size={15} />}
                  label={`注入已选节点${props.selectedNodeCount ? `（${props.selectedNodeCount}）` : ''}`}
                  description={props.selectedNode ? '将画布选中的文字或图片加入本轮' : '请先在画布中选择节点'}
                  disabled={!props.selectedNode || !props.onInjectSelectedNode}
                  onClick={injectSelectedNodes}
                />
                <MenuAction
                  icon={<Upload size={15} />}
                  label="上传参考图"
                  description={uploadBlocked ? `已达到 ${maxImages} 张上限` : '从本地选择一张图片'}
                  disabled={uploadBlocked}
                  onClick={requestUpload}
                />
              </ComposerMenu>
            )}
          </div>

          {references.map((reference, index) => (
            <div key={reference.referenceId} className="relative shrink-0">
              <button
                type="button"
                aria-label={`管理图${index + 1} ${reference.label}`}
                aria-expanded={referenceMenuId === reference.referenceId}
                className={`group relative block h-14 w-14 overflow-hidden rounded-xl border-2 bg-gray-100 transition ${
                  reference.mentioned
                    ? 'border-cyan-400 shadow-[0_0_0_2px_rgba(34,211,238,0.12)]'
                    : 'border-white ring-1 ring-gray-200 hover:ring-gray-400'
                }`}
                onClick={() => {
                  setOpenPopover(null)
                  setReferenceMenuId(current => current === reference.referenceId ? null : reference.referenceId)
                }}
              >
                <img src={reference.imageUrl} alt={reference.label} className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-black text-white backdrop-blur">
                  图{index + 1}
                </span>
                <span className={`absolute bottom-1 left-1 max-w-[48px] truncate rounded-md px-1.5 py-0.5 text-[8px] font-bold backdrop-blur ${
                  reference.role === 'source-image'
                    ? 'bg-amber-300/95 text-amber-950'
                    : 'bg-white/90 text-gray-700'
                }`}>
                  {reference.role === 'source-image' ? '主图' : '参考'}
                </span>
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-gray-700 opacity-0 shadow transition group-hover:opacity-100">
                  <MoreHorizontal size={11} aria-hidden="true" />
                </span>
              </button>
              {referenceMenuId === reference.referenceId && (
                <ComposerMenu className={`${index > 4 ? 'right-0' : 'left-0'} top-[calc(100%+8px)] w-56`}>
                  <div className="border-b border-gray-100 px-3 pb-2 pt-1">
                    <p className="truncate text-xs font-black text-gray-900">{reference.label}</p>
                    <p className="mt-0.5 text-[10px] text-gray-500">
                      图{index + 1} · {reference.mentioned ? '已在提示词中引用' : '尚未引用'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 py-1">
                    <CompactMenuAction
                      label="左移"
                      icon={<ArrowLeft size={13} />}
                      disabled={index === 0 || !props.onMoveReference}
                      onClick={() => {
                        props.onMoveReference?.(reference.referenceId, -1)
                        setReferenceMenuId(null)
                      }}
                    />
                    <CompactMenuAction
                      label="右移"
                      icon={<ArrowRight size={13} />}
                      disabled={index === references.length - 1 || !props.onMoveReference}
                      onClick={() => {
                        props.onMoveReference?.(reference.referenceId, 1)
                        setReferenceMenuId(null)
                      }}
                    />
                  </div>
                  <MenuAction
                    icon={reference.role === 'source-image' ? <Check size={15} /> : <ImagePlus size={15} />}
                    label={reference.role === 'source-image' ? '已设为主图' : '设为主图'}
                    disabled={!props.onReferenceRoleChange || reference.role === 'source-image'}
                    onClick={() => {
                      props.onReferenceRoleChange?.(reference.referenceId, 'source-image')
                      setReferenceMenuId(null)
                    }}
                  />
                  {reference.role === 'source-image' && (
                    <MenuAction
                      icon={<ImagePlus size={15} />}
                      label="改为参考图"
                      disabled={!props.onReferenceRoleChange}
                      onClick={() => {
                        props.onReferenceRoleChange?.(reference.referenceId, 'reference-image')
                        setReferenceMenuId(null)
                      }}
                    />
                  )}
                  {props.onEditAnnotations && (
                    <MenuAction
                      icon={<Wand2 size={15} />}
                      label="视觉标记"
                      description="在这张图片上绘制提示标记"
                      onClick={() => {
                        props.onEditAnnotations?.(reference.referenceId)
                        setReferenceMenuId(null)
                      }}
                    />
                  )}
                  <MenuAction
                    icon={<X size={15} />}
                    label="移除图片"
                    danger
                    disabled={!props.onRemoveReference}
                    onClick={() => {
                      props.onRemoveReference?.(reference.referenceId)
                      setReferenceMenuId(null)
                    }}
                  />
                </ComposerMenu>
              )}
            </div>
          ))}
        </div>

        {props.promptDocument && props.onPromptDocumentChange ? (
          <ReferencePromptEditor
            ref={promptEditorRef}
            document={props.promptDocument}
            references={references.map((reference, order) => ({
              edgeId: `composer-${reference.referenceId}`,
              nodeId: `composer-${reference.referenceId}`,
              referenceId: reference.referenceId,
              label: reference.label,
              role: reference.role || 'reference-image',
              assetId: reference.assetId || null,
              order: reference.order ?? order
            }))}
            unresolvedReferenceIds={props.unresolvedReferenceIds}
            maxReferences={maxImages}
            canInjectSelectedNodes={Boolean(props.selectedNode && props.onInjectSelectedNode)}
            selectedNodeCount={props.selectedNodeCount}
            onInjectSelectedNodes={injectSelectedNodes}
            onRequestUpload={requestUpload}
            onSubmitShortcut={() => submit()}
            onChange={props.onPromptDocumentChange}
          />
        ) : (
          <textarea
            aria-label="图片描述"
            className="min-h-[76px] max-h-40 w-full resize-none overflow-y-auto border-0 bg-transparent px-1 py-2 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400"
            placeholder="描述你想生成或修改的图片"
            value={props.prompt}
            onChange={event => props.onPromptChange(event.target.value)}
            onKeyDown={submitFromKeyboard}
          />
        )}

        {props.workflow === 'region-edit' && props.onEditRegions && (
          <button
            type="button"
            aria-label="编辑修改区域"
            className={`mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition ${
              props.regionCount
                ? 'bg-cyan-50 text-cyan-800 hover:bg-cyan-100'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
            onClick={props.onEditRegions}
          >
            <Wand2 size={12} aria-hidden="true" />
            修改区域 {props.regionCount || 0}
          </button>
        )}

        {displayedIssues.length > 0 && (
          <details className="group mb-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] text-red-700">
            <summary className="cursor-pointer list-none font-bold">
              {displayedIssues[0]}
              {displayedIssues.length > 1 && <span className="ml-1 font-semibold text-red-500">另有 {displayedIssues.length - 1} 项</span>}
            </summary>
            {displayedIssues.length > 1 && (
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {displayedIssues.slice(1).map(issue => <li key={issue}>{issue}</li>)}
              </ul>
            )}
          </details>
        )}

        <div className="flex min-w-0 items-center gap-1.5 border-t border-gray-100 pt-2">
          <ToolbarPopover
            open={openPopover === 'workflow'}
            align="left"
            button={(
              <SummaryPill
                label={selectedWorkflow?.label || '生成方式'}
                ariaLabel="选择生成方式"
                icon={<ImagePlus size={13} />}
                expanded={openPopover === 'workflow'}
                onClick={() => togglePopover('workflow')}
              />
            )}
          >
            <PopoverHeader title="选择生成方式" description="每次发送都是一轮独立请求" />
            <div className="space-y-1">
              {props.workflows.map(option => (
                <ChoiceButton
                  key={option.value}
                  selected={option.value === props.workflow}
                  label={option.label}
                  description={workflowDescriptions[option.value]}
                  onClick={() => {
                    props.onWorkflowChange(option.value)
                    setOpenPopover(null)
                  }}
                />
              ))}
            </div>
          </ToolbarPopover>

          <ToolbarPopover
            open={openPopover === 'model'}
            align="left"
            button={(
              <SummaryPill
                label={selectedModel?.label || '选择模型'}
                ariaLabel="选择图片模型"
                title={selectedModel?.label}
                className="max-w-[132px]"
                icon={<Settings2 size={13} />}
                expanded={openPopover === 'model'}
                onClick={() => togglePopover('model')}
              />
            )}
          >
            <PopoverHeader title="图片模型" description="仅显示已就绪的图片连接" />
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {props.models.length > 0 ? props.models.map(option => (
                <ChoiceButton
                  key={option.value}
                  selected={option.value === props.modelId}
                  label={option.label}
                  onClick={() => {
                    props.onModelChange(option.value)
                    setOpenPopover(null)
                  }}
                />
              )) : (
                <p className="rounded-xl bg-amber-50 px-3 py-3 text-xs text-amber-800">暂无已就绪的图片模型</p>
              )}
            </div>
          </ToolbarPopover>

          <ToolbarPopover
            open={openPopover === 'size'}
            align="right"
            className="w-[340px]"
            button={(
              <SummaryPill
                label={`${displayAspectRatio(props.aspectRatio)} · ${props.resolution}`}
                ariaLabel="设置比例与分辨率"
                expanded={openPopover === 'size'}
                onClick={() => togglePopover('size')}
              />
            )}
          >
            <PopoverHeader title="比例与分辨率" description="选项由当前模型能力决定" />
            <SettingLabel>图片比例</SettingLabel>
            <div className="grid grid-cols-5 gap-1.5">
              {props.aspectRatios.map(value => (
                <SegmentButton
                  key={value}
                  selected={value === props.aspectRatio}
                  label={displayAspectRatio(value)}
                  onClick={() => props.onAspectRatioChange(value)}
                />
              ))}
            </div>
            <SettingLabel>分辨率</SettingLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {props.resolutions.map(value => (
                <SegmentButton
                  key={value}
                  selected={value === props.resolution}
                  label={value}
                  onClick={() => props.onResolutionChange(value)}
                />
              ))}
            </div>
            {props.aspectRatio === 'custom' && props.onCustomSizeChange && (
              <>
                <SettingLabel>自定义尺寸</SettingLabel>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input
                    aria-label="自定义宽度"
                    type="number"
                    min="1"
                    className="min-h-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs outline-none focus:border-cyan-400"
                    value={props.customWidth || ''}
                    placeholder="宽度"
                    onChange={event => props.onCustomSizeChange?.(Number(event.target.value), props.customHeight || 0)}
                  />
                  <span className="text-xs text-gray-400">×</span>
                  <input
                    aria-label="自定义高度"
                    type="number"
                    min="1"
                    className="min-h-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs outline-none focus:border-cyan-400"
                    value={props.customHeight || ''}
                    placeholder="高度"
                    onChange={event => props.onCustomSizeChange?.(props.customWidth || 0, Number(event.target.value))}
                  />
                </div>
                <p className="mt-2 text-[10px] leading-4 text-gray-400">总像素 921600–4624220，比例 1:16–16:1</p>
              </>
            )}
          </ToolbarPopover>

          <button
            type="button"
            aria-label="引用已添加图片"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-700"
            onClick={() => {
              setOpenPopover(null)
              setReferenceMenuId(null)
              promptEditorRef.current?.openMentionPicker()
            }}
          >
            <AtSign size={14} aria-hidden="true" />
          </button>

          <ToolbarPopover
            open={openPopover === 'more'}
            align="right"
            className="w-72"
            button={(
              <button
                type="button"
                aria-label="更多图片设置"
                aria-expanded={openPopover === 'more'}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition hover:bg-gray-50 hover:text-gray-950"
                onClick={() => togglePopover('more')}
              >
                <MoreHorizontal size={15} aria-hidden="true" />
              </button>
            )}
          >
            <PopoverHeader title="更多设置" description={`${props.outputFormat.toUpperCase()} · ${props.promptOptimization === 'fast' ? '快速优化' : '标准优化'} · ${props.watermark ? '有水印' : '无水印'}`} />
            <SettingLabel>输出格式</SettingLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {props.outputFormats.map(value => (
                <SegmentButton
                  key={value}
                  selected={value === props.outputFormat}
                  label={value.toUpperCase()}
                  onClick={() => props.onOutputFormatChange(value)}
                />
              ))}
            </div>
            {props.promptOptimizationModes?.length && props.promptOptimization && props.onPromptOptimizationChange ? (
              <>
                <SettingLabel>提示词优化</SettingLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {props.promptOptimizationModes.map(value => (
                    <SegmentButton
                      key={value}
                      selected={value === props.promptOptimization}
                      label={value === 'fast' ? '快速' : '标准'}
                      onClick={() => props.onPromptOptimizationChange?.(value)}
                    />
                  ))}
                </div>
              </>
            ) : null}
            {props.supportsWatermark && (
              <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-xs font-bold text-gray-700">
                添加“AI生成”水印
                <input
                  aria-label="添加水印"
                  type="checkbox"
                  className="min-h-0 h-4 w-4 accent-gray-950"
                  checked={props.watermark}
                  onChange={event => props.onWatermarkChange(event.target.checked)}
                />
              </label>
            )}
          </ToolbarPopover>

          <span className="ml-auto shrink-0 text-[10px] font-semibold tabular-nums text-gray-400">
            {references.length}/{maxImages}
          </span>
          <button
            type="submit"
            aria-label="生成图片"
            title={blocked ? blockingRequirements[0] : '生成图片（Ctrl/⌘ + Enter）'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black disabled:translate-y-0 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
            disabled={blocked}
          >
            <Send size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <input
        ref={uploadRef}
        aria-label="上传本地参考图"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif,.heic,.heif"
        className="sr-only"
        onChange={upload}
      />
    </form>
  )
}

const ComposerMenu = ({
  children,
  className = ''
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div className={`absolute z-[60] rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_20px_55px_rgba(15,23,42,0.16)] ${className}`}>
    {children}
  </div>
)

const MenuAction = ({
  icon,
  label,
  description,
  disabled = false,
  danger = false,
  onClick
}: {
  icon: React.ReactNode
  label: string
  description?: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
      danger ? 'text-red-700 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
    }`}
    disabled={disabled}
    onClick={onClick}
  >
    <span className="mt-0.5 shrink-0">{icon}</span>
    <span className="min-w-0">
      <span className="block text-xs font-bold">{label}</span>
      {description && <span className="mt-0.5 block text-[10px] leading-4 text-gray-400">{description}</span>}
    </span>
  </button>
)

const CompactMenuAction = ({
  icon,
  label,
  disabled = false,
  onClick
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    className="flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-30"
    disabled={disabled}
    onClick={onClick}
  >
    {icon}{label}
  </button>
)

const SummaryPill = ({
  label,
  ariaLabel,
  title,
  icon,
  expanded,
  className = '',
  onClick
}: {
  label: string
  ariaLabel: string
  title?: string
  icon?: React.ReactNode
  expanded: boolean
  className?: string
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={ariaLabel}
    title={title}
    aria-expanded={expanded}
    className={`flex h-8 min-w-0 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition ${
      expanded
        ? 'border-gray-300 bg-gray-100 text-gray-950'
        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    } ${className}`}
    onClick={onClick}
  >
    {icon && <span className="shrink-0">{icon}</span>}
    <span className="truncate">{label}</span>
    <ChevronDown size={11} className={`shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
  </button>
)

const ToolbarPopover = ({
  open,
  align,
  button,
  children,
  className = 'w-72'
}: {
  open: boolean
  align: 'left' | 'right'
  button: React.ReactNode
  children: React.ReactNode
  className?: string
}) => (
  <div className="relative shrink-0">
    {button}
    {open && (
      <div className={`absolute bottom-[calc(100%+10px)] z-50 rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)] ${align === 'left' ? 'left-0' : 'right-0'} ${className}`}>
        {children}
      </div>
    )}
  </div>
)

const PopoverHeader = ({ title, description }: { title: string; description?: string }) => (
  <div className="mb-3">
    <p className="text-xs font-black text-gray-950">{title}</p>
    {description && <p className="mt-1 text-[10px] leading-4 text-gray-400">{description}</p>}
  </div>
)

const ChoiceButton = ({
  label,
  description,
  selected,
  onClick
}: {
  label: string
  description?: string
  selected: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
      selected ? 'bg-gray-100 text-gray-950' : 'text-gray-700 hover:bg-gray-50'
    }`}
    onClick={onClick}
  >
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
      selected ? 'border-gray-950 bg-gray-950 text-white' : 'border-gray-200'
    }`}>
      {selected && <Check size={11} aria-hidden="true" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-xs font-bold">{label}</span>
      {description && <span className="mt-0.5 block text-[10px] leading-4 text-gray-400">{description}</span>}
    </span>
  </button>
)

const SettingLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400">{children}</p>
)

const SegmentButton = ({
  label,
  selected,
  onClick
}: {
  label: string
  selected: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    aria-label={label}
    className={`rounded-xl px-2 py-2 text-[11px] font-bold transition ${
      selected ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
    }`}
    onClick={onClick}
  >
    {label}
  </button>
)

const displayAspectRatio = (value: string): string => (
  value === 'smart' ? '智能' : value === 'custom' ? '自定义' : value
)

export default ImageGenerationComposer
