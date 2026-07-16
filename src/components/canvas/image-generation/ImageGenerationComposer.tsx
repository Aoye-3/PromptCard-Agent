import { Link2, Send, Upload } from 'lucide-react'
import { useRef, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import type { ImageGenerationComposerProps, ImageGenerationWorkflow } from './types'
import { ReferencePromptEditor } from './ReferencePromptEditor'

export const ImageGenerationComposer = (props: ImageGenerationComposerProps) => {
  const uploadRef = useRef<HTMLInputElement>(null)
  const blocked = props.disabled || props.missingRequirements?.length
  const references = props.references || []
  const maxImages = props.maxImages || 10
  const uploadBlocked = references.length >= maxImages

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) props.onUpload(file)
    event.target.value = ''
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

  return (
    <form aria-label="图片生成输入" className="space-y-3 border-t border-gray-200 bg-white p-3" onSubmit={submit}>
      {props.promptDocument && props.onPromptDocumentChange ? (
        <ReferencePromptEditor
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
          onMoveReference={props.onMoveReference}
          onRemoveReference={props.onRemoveReference}
          onChange={props.onPromptDocumentChange}
        />
      ) : (
        <textarea
          aria-label="图片描述"
          className="min-h-20 w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="描述你想生成或修改的图片"
          value={props.prompt}
          onChange={event => props.onPromptChange(event.target.value)}
          onKeyDown={submitFromKeyboard}
        />
      )}

      {!props.promptDocument && props.prompt.endsWith('@') && references.length > 0 && (
        <div role="listbox" aria-label="选择参考图引用" className="flex flex-wrap gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-2">
          {references.map((reference, index) => (
            <button
              key={reference.referenceId}
              type="button"
              role="option"
              aria-selected={reference.mentioned}
              className="rounded-md bg-white px-2 py-1 text-xs font-bold text-cyan-900"
              onClick={() => {
                props.onMentionReference?.(reference.referenceId)
                props.onPromptChange(props.prompt.slice(0, -1))
              }}
            >图{index + 1} · {reference.label}</button>
          ))}
        </div>
      )}

      {references.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="本轮参考图">
          {references.map((reference, index) => (
            <div key={reference.referenceId} className="relative shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
              <img src={reference.imageUrl} alt={reference.label} className="h-12 w-12 rounded object-cover" />
              {props.onReferenceRoleChange && (
                <select
                  aria-label={`输入角色 ${reference.label}`}
                  className="mt-1 block w-full rounded border border-gray-200 bg-white text-[10px]"
                  value={reference.role || 'reference-image'}
                  onChange={event => props.onReferenceRoleChange?.(
                    reference.referenceId,
                    event.target.value as 'source-image' | 'reference-image'
                  )}
                >
                  <option value="reference-image">参考图</option>
                  <option value="source-image">主图</option>
                </select>
              )}
              <button
                type="button"
                className={`mt-1 block w-full rounded px-1 py-0.5 text-[10px] font-bold ${reference.mentioned ? 'bg-cyan-100 text-cyan-800' : 'bg-white text-gray-600'}`}
                aria-label={`引用图${index + 1} ${reference.label}`}
                onClick={() => props.onMentionReference?.(reference.referenceId)}
              >@图{index + 1}</button>
              {props.onMoveReference && (
                <div className="mt-1 flex gap-1">
                  <button type="button" aria-label={`上移 ${reference.label}`} disabled={index === 0} onClick={() => props.onMoveReference?.(reference.referenceId, -1)}>←</button>
                  <button type="button" aria-label={`下移 ${reference.label}`} disabled={index === references.length - 1} onClick={() => props.onMoveReference?.(reference.referenceId, 1)}>→</button>
                </div>
              )}
              <button
                type="button"
                className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-gray-950 text-[10px] text-white"
                aria-label={`移除参考图 ${reference.label}`}
                onClick={() => props.onRemoveReference?.(reference.referenceId)}
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <CompactSelect label="生成方式" value={props.workflow} options={props.workflows} onChange={value => props.onWorkflowChange(value as ImageGenerationWorkflow)} />
        <CompactSelect label="图片模型" value={props.modelId} options={props.models} onChange={props.onModelChange} />
        <CompactSelect label="分辨率" value={props.resolution} options={toOptions(props.resolutions)} onChange={props.onResolutionChange} />
        <CompactSelect label="图片比例" value={props.aspectRatio} options={toOptions(props.aspectRatios)} onChange={props.onAspectRatioChange} />
        {props.promptOptimizationModes?.length && props.promptOptimization && props.onPromptOptimizationChange
          ? <CompactSelect label="提示词优化" value={props.promptOptimization} options={toOptions(props.promptOptimizationModes)} onChange={value => props.onPromptOptimizationChange?.(value as 'standard' | 'fast')} />
          : null}
        <CompactSelect label="输出格式" value={props.outputFormat} options={toOptions(props.outputFormats, true)} onChange={props.onOutputFormatChange} />
        {props.supportsWatermark && (
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700">
            <input
              aria-label="添加水印"
              type="checkbox"
              className="min-h-0"
              checked={props.watermark}
              onChange={event => props.onWatermarkChange(event.target.checked)}
            />
            添加水印
          </label>
        )}
      </div>

      {props.aspectRatio === 'custom' && props.onCustomSizeChange && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-gray-600">宽度
            <input aria-label="自定义宽度" type="number" min="1" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1" value={props.customWidth || ''} onChange={event => props.onCustomSizeChange?.(Number(event.target.value), props.customHeight || 0)} />
          </label>
          <label className="text-xs font-bold text-gray-600">高度
            <input aria-label="自定义高度" type="number" min="1" className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1" value={props.customHeight || ''} onChange={event => props.onCustomSizeChange?.(props.customWidth || 0, Number(event.target.value))} />
          </label>
        </div>
      )}

      {props.missingRequirements?.length ? (
        <ul role="alert" className="list-disc pl-5 text-xs font-semibold text-red-700">
          {props.missingRequirements.map(item => <li key={item}>{item}</li>)}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="注入当前节点"
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-50"
          disabled={!props.selectedNode || !props.onInjectSelectedNode}
          title={props.selectedNode?.label || '请先选择画布节点'}
          onClick={() => props.selectedNode && props.onInjectSelectedNode?.(props.selectedNode.id)}
        >
          <Link2 size={14} aria-hidden="true" /> 注入当前节点
        </button>
        <button
          type="button"
          aria-label="打开本地参考图选择"
          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700"
          disabled={uploadBlocked}
          title={uploadBlocked ? `图片输入已达到 ${maxImages} 张上限` : undefined}
          onClick={() => uploadRef.current?.click()}
        >
          <Upload size={14} aria-hidden="true" /> 上传参考图
        </button>
        {props.workflow === 'region-edit' && props.onEditRegions && (
          <button type="button" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700" onClick={props.onEditRegions}>
            标记修改区域
          </button>
        )}
        {props.onEditAnnotations && (
          <button type="button" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700" onClick={props.onEditAnnotations}>
            视觉标记
          </button>
        )}
        <input ref={uploadRef} aria-label="上传本地参考图" type="file" accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif,.heic,.heif" className="sr-only" onChange={upload} />
        <button
          type="submit"
          aria-label="生成图片"
          className="ml-auto rounded-lg bg-gray-950 px-4 py-2 text-xs font-bold text-white disabled:bg-gray-300"
          disabled={Boolean(blocked)}
        >
          <Send size={14} aria-hidden="true" /> 生成图片
        </button>
      </div>
    </form>
  )
}

interface CompactSelectProps {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}

const CompactSelect = ({ label, value, options, onChange }: CompactSelectProps) => (
  <label className="text-xs font-bold text-gray-600">
    <span className="sr-only">{label}</span>
    <select aria-label={label} className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs" value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
)

const toOptions = (values: string[], uppercase = false) => values.map(value => ({
  value,
  label: uppercase ? value.toUpperCase() : value
}))

export default ImageGenerationComposer
