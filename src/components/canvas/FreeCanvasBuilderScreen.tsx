import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MiniMap,
  PanOnScrollMode,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
  type OnNodeDrag,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bot, Database, Home, Image, MousePointer2, Pencil, Plus, Type, Workflow } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import {
  addCharacterFormToPage,
  addStoryVideoPairToPage,
  getSelectedThreeStageFormContext,
  normalizeThreeStagePages,
  selectThreeStageForm,
  syncThreeStageLegacyFields,
  updateThreeStageFormSection
} from '@/domain/three-stage/three-stage-pages'
import {
  addFreeCanvasMediaNode,
  buildFreeCanvasGraph,
  createFreeCanvasMediaNode,
  type FreeCanvasFlowNode,
  type FreeCanvasMediaNodeKind,
  type FreeCanvasNodeData,
  updateFreeCanvasNodePosition
} from '@/domain/free-canvas/free-canvas'
import {
  createStoryboardShotRange,
  getStageDefinition,
  parseStoryboardShotRanges,
  stringifyStoryboardShotRanges,
  valueOf
} from '@/domain/three-stage/three-stage-definitions'
import type { FieldDefinition, StoryboardShotRange } from '@/domain/three-stage/three-stage-definitions'
import { buildThreeStageWorkspaceContext } from '@/utils/agent-workspace'
import type { AgentWorkspaceProposal } from '@/models/Agent.model'
import type { IPromptProject, IThreeStageForm, IThreeStageProject, IThreeStageSection } from '@/models/PromptHistory.model'

interface FreeCanvasBuilderScreenProps {
  activeProject: IPromptProject
  threeStage: IThreeStageProject
  onBack: () => void
  onRenameProject?: () => void
  onSave: () => void
  onChange: (threeStage: IThreeStageProject) => void
  previewMode?: boolean
}

export const FreeCanvasBuilderScreen = (props: FreeCanvasBuilderScreenProps) => (
  <ReactFlowProvider>
    <FreeCanvasBuilderInner {...props} />
  </ReactFlowProvider>
)

const FreeCanvasBuilderInner = ({
  activeProject,
  threeStage,
  onBack,
  onRenameProject,
  onSave,
  onChange,
  previewMode = false
}: FreeCanvasBuilderScreenProps) => {
  const reactFlow = useReactFlow<FreeCanvasFlowNode>()
  const normalizedThreeStage = useMemo(() => syncThreeStageLegacyFields(threeStage), [threeStage])
  const selectedContext = getSelectedThreeStageFormContext(normalizedThreeStage)
  const selectedForm = selectedContext.form
  const selectedStageDefinition = getStageDefinition(selectedForm.type)
  const selectedField = selectedStageDefinition.fields.find(field => field.id === normalizedThreeStage.selectedFieldId && !field.fixedValue) ||
    selectedStageDefinition.fields.find(field => !field.fixedValue) ||
    selectedStageDefinition.fields[0]
  const selectedOutput = selectedStageDefinition.buildOutput(selectedForm.section.fields, normalizedThreeStage)
  const graph = useMemo(() => buildFreeCanvasGraph(normalizedThreeStage), [normalizedThreeStage])

  const updateFormSection = (form: IThreeStageForm, section: IThreeStageSection, fieldId?: string): void => {
    const pageId = getFormPageId(normalizedThreeStage, form.id) || selectedContext.page.id
    const updated = updateThreeStageFormSection({
      ...normalizedThreeStage,
      selectedPageId: pageId,
      selectedFormId: form.id,
      selectedStage: form.type,
      selectedFieldId: fieldId || normalizedThreeStage.selectedFieldId
    }, form.id, section)
    onChange(selectThreeStageForm(updated, pageId, form.id, fieldId))
  }

  const updateField = (form: IThreeStageForm, fieldId: string, nextValue: string): void => {
    updateFormSection(form, {
      ...form.section,
      fields: {
        ...form.section.fields,
        [fieldId]: nextValue
      },
      focusedFieldId: fieldId,
      updatedAt: Date.now()
    }, fieldId)
  }

  const selectCanvasField = (form: IThreeStageForm, fieldId: string): void => {
    updateFormSection(form, {
      ...form.section,
      focusedFieldId: fieldId,
      updatedAt: Date.now()
    }, fieldId)
  }

  const canvasNodes = useMemo(() => graph.nodes.map(node => {
    if (node.data.nodeKind !== 'threeStageForm' || !node.data.formId) return node
    return {
      ...node,
      data: {
        ...node.data,
        form: findThreeStageForm(normalizedThreeStage, node.data.formId),
        selectedFieldId: normalizedThreeStage.selectedFieldId,
        onSelectField: selectCanvasField,
        onUpdateField: updateField
      }
    }
  }), [graph.nodes, normalizedThreeStage])

  const [nodes, setNodes] = useState(canvasNodes)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [spacePressed, setSpacePressed] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
  const selectedNode = nodes.find(node => node.id === selectedNodeId) || null
  const workspaceContext = buildThreeStageWorkspaceContext({
    activeProject,
    threeStage: normalizedThreeStage,
    selectedOutput,
    freeCanvas: {
      selectedNodeId,
      selectedNodeType: selectedNode?.data.nodeKind,
      selectedMediaAssetId: selectedNode?.data.mediaNode?.assetId || null,
      nodes: graph.nodes.map(node => ({
        id: node.id,
        kind: node.data.nodeKind,
        title: node.data.title,
        formId: node.data.formId,
        mediaAssetId: node.data.mediaNode?.assetId || null
      }))
    }
  })

  useEffect(() => {
    setNodes(canvasNodes)
  }, [canvasNodes])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault()
        setSpacePressed(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        event.preventDefault()
        setSpacePressed(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const handleApplyAgentProposal = (proposal: AgentWorkspaceProposal): void => {
    if (proposal.kind !== 'three_stage_field_update') return
    if (proposal.stageKey !== selectedForm.type) return
    const field = getStageDefinition(selectedForm.type).fields.find(candidate => candidate.id === proposal.fieldId && !candidate.fixedValue)
    if (!field) return
    const currentValue = valueOf(selectedForm.section.fields, field.id)
    const nextValue = proposal.mode === 'append' && currentValue.trim()
      ? `${currentValue}\n${proposal.content}`
      : proposal.content
    updateField(selectedForm, field.id, nextValue)
  }

  const createCharacter = (position = nextNodePosition()): void => {
    const currentNodeIds = new Set(graph.nodes.map(node => node.id))
    const withCharacter = addCharacterFormToPage(normalizedThreeStage, selectedContext.page.id)
    const newNode = buildFreeCanvasGraph(withCharacter).nodes.find(node => !currentNodeIds.has(node.id) && node.data.nodeKind === 'threeStageForm')
    const positioned = newNode ? updateFreeCanvasNodePosition(withCharacter, newNode.id, position) : withCharacter
    onChange(positioned)
    setContextMenu(null)
  }

  const createPair = (position = nextNodePosition()): void => {
    const withPair = addStoryVideoPairToPage(normalizedThreeStage, selectedContext.page.id)
    const graphWithPair = buildFreeCanvasGraph(withPair)
    const newPairNodes = graphWithPair.nodes.slice(-2)
    const positioned = newPairNodes.reduce((current, node, index) =>
      updateFreeCanvasNodePosition(current, node.id, { x: position.x + index * 360, y: position.y }), withPair)
    onChange(positioned)
    setContextMenu(null)
  }

  const createMedia = (kind: FreeCanvasMediaNodeKind, position = nextNodePosition()): void => {
    onChange(addFreeCanvasMediaNode(normalizedThreeStage, createFreeCanvasMediaNode(kind, position)))
    setContextMenu(null)
  }

  const handleNodeClick: NodeMouseHandler<FreeCanvasFlowNode> = (_event, node): void => {
    setSelectedNodeId(node.id)
    if (node.data.pageId && node.data.formId) {
      onChange(selectThreeStageForm(normalizedThreeStage, node.data.pageId, node.data.formId))
    }
  }

  const handleNodeDragStop: OnNodeDrag<FreeCanvasFlowNode> = (_event, node): void => {
    onChange(updateFreeCanvasNodePosition(normalizedThreeStage, node.id, node.position))
  }

  const handlePaneContextMenu = useCallback((event: ReactMouseEvent<Element> | globalThis.MouseEvent) => {
    event.preventDefault()
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setContextMenu({ x: event.clientX, y: event.clientY, flowX: position.x, flowY: position.y })
  }, [reactFlow])

  function nextNodePosition() {
    return { x: 120 + graph.nodes.length * 24, y: 120 + graph.nodes.length * 18 }
  }

  return (
    <section className="fixed inset-x-0 bottom-[92px] top-20 z-20 overflow-hidden bg-[#f7f8fb]">
      <div className="absolute left-6 top-6 z-20 flex max-w-[calc(100vw-460px)] items-center gap-3 rounded-[20px] border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <button className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950" onClick={onBack} title="项目">
          <Home className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-black text-gray-950">{activeProject.title}</h1>
            {onRenameProject && (
              <button type="button" className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900" onClick={onRenameProject} title="重命名项目">
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="truncate text-xs font-semibold text-gray-400">自由画布式构建 / React Flow + 自建媒体层</p>
        </div>
        <button className="rounded-full bg-black px-3 py-2 text-xs font-bold text-white transition hover:bg-gray-800" onClick={onSave}>
          <Database className="h-4 w-4" />
          {previewMode ? '预览不保存' : '保存'}
        </button>
      </div>

      <div className="h-full pr-[420px]" data-free-canvas-screen>
        <ReactFlow
          nodes={nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => setNodes(current => applyNodeChanges(changes, current) as FreeCanvasFlowNode[])}
          onNodeClick={handleNodeClick}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={() => setContextMenu(null)}
          onPaneContextMenu={handlePaneContextMenu}
          panOnDrag={spacePressed ? [0] : false}
          selectionOnDrag={!spacePressed}
          selectionMode={SelectionMode.Partial}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          nodesDraggable={!spacePressed}
          elementsSelectable={!spacePressed}
          className={spacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
          fitView
          minZoom={0.2}
          maxZoom={2}
        >
          <Background gap={20} size={1.4} color="#d1d5db" />
          <MiniMap pannable zoomable className="!bottom-20 !left-6 !right-auto" />
          <Controls className="!bottom-6 !left-auto !right-6" />
        </ReactFlow>
      </div>

      {contextMenu && (
        <CanvasCreateMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCreateCharacter={() => createCharacter({ x: contextMenu.flowX, y: contextMenu.flowY })}
          onCreatePair={() => createPair({ x: contextMenu.flowX, y: contextMenu.flowY })}
          onCreateMedia={(kind) => createMedia(kind, { x: contextMenu.flowX, y: contextMenu.flowY })}
        />
      )}

      <CanvasBottomToolbar
        onCreateCharacter={() => createCharacter()}
        onCreatePair={() => createPair()}
        onCreateMedia={(kind) => createMedia(kind)}
      />

      <aside className="absolute bottom-6 right-6 top-6 z-30 flex w-[390px] flex-col overflow-hidden rounded-[24px] border border-gray-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.16)]">
        <div className="border-b border-gray-100 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase text-gray-400">
            <Bot className="h-4 w-4" />
            固定 Agent 协作
          </div>
          <h2 className="text-base font-black text-gray-950">{selectedNode?.data.title || selectedForm.title}</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            当前字段：{selectedField.label}。媒体节点只进入项目画布上下文，不获得 Prompt Library 写权限。
          </p>
        </div>
        {!previewMode ? (
          <AIChatbotBox
            title="Free Canvas Agent"
            mode="three-stage-workspace"
            sessionKey={`workspace:three-stage:${activeProject.id}`}
            workspaceContext={workspaceContext}
            onApplyWorkspaceProposal={handleApplyAgentProposal}
          />
        ) : (
          <div className="p-5 text-sm font-semibold text-gray-400">预览模式禁用 Agent Runtime。</div>
        )}
      </aside>
    </section>
  )
}

const ThreeStageFormNode = ({ data, selected }: NodeProps<Node<FreeCanvasNodeData>>) => {
  const form = data.form
  const stage = form ? getStageDefinition(form.type) : null
  const layout = stage?.layout || stage?.fields.map(field => ({ type: 'field' as const, fieldId: field.id })) || []

  return (
    <div className={`flex max-h-[760px] w-[520px] flex-col overflow-hidden rounded-[18px] border bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] ${selected ? 'border-gray-950' : 'border-gray-200'}`}>
      <Handle type="target" position={Position.Left} className="!bg-gray-950" />
      <div className="border-b border-gray-100 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-black text-gray-500">{data.subtitle}</span>
          {data.pairId && <span className="rounded-full bg-gray-950 px-2.5 py-1 text-[11px] font-black text-white">绑定</span>}
        </div>
        <div className="text-lg font-black text-gray-950">{data.title}</div>
        <p className="mt-2 text-xs leading-5 text-gray-500">{stage?.description || '选择节点后，右侧 Agent 会读取当前表单上下文并生成可审批的字段植入。'}</p>
      </div>
      <div className="nowheel flex-1 space-y-3 overflow-y-auto p-4">
        {form && stage ? layout.map(item => {
          if (item.type === 'locked') {
            return <CanvasLockedBlock key={item.id} text={item.text} />
          }
          const field = stage.fields.find(candidate => candidate.id === item.fieldId)
          if (!field) return null
          return (
            <CanvasFieldEditor
              key={field.id}
              form={form}
              field={field}
              selected={data.selectedFieldId === field.id}
              onSelect={data.onSelectField}
              onUpdate={data.onUpdateField}
            />
          )
        }) : (
          <div className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-400">表单数据等待同步。</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-gray-950" />
    </div>
  )
}

const CanvasFieldEditor = ({
  form,
  field,
  selected,
  onSelect,
  onUpdate
}: {
  form: IThreeStageForm
  field: FieldDefinition
  selected: boolean
  onSelect?: (form: IThreeStageForm, fieldId: string) => void
  onUpdate?: (form: IThreeStageForm, fieldId: string, value: string) => void
}) => {
  const value = form.section.fields[field.id] || ''
  const commonLabel = (
    <div className="mb-2 flex items-center justify-between gap-3">
      <span className="text-sm font-black text-gray-900">{field.label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${selected ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-400'}`}>
        {selected ? '当前字段' : '可编辑'}
      </span>
    </div>
  )

  if (field.fixedValue) {
    return <CanvasLockedBlock text={field.fixedValue} label={field.label} />
  }

  if (field.kind === 'toggle') {
    const enabled = value ? value !== 'false' : field.toggleDefault !== false
    return (
      <div className={`rounded-2xl border p-3 ${selected ? 'border-gray-950' : 'border-gray-200'}`}>
        {commonLabel}
        <div className="nodrag flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${enabled ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => {
              onSelect?.(form, field.id)
              onUpdate?.(form, field.id, 'true')
            }}
          >
            {field.toggleLabels?.on || '开启'}
          </button>
          <button
            type="button"
            className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${!enabled ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'}`}
            onClick={() => {
              onSelect?.(form, field.id)
              onUpdate?.(form, field.id, 'false')
            }}
          >
            {field.toggleLabels?.off || '关闭'}
          </button>
        </div>
      </div>
    )
  }

  if (field.kind === 'shotRanges') {
    const ranges = parseStoryboardShotRanges(form.section.fields, field.id)
    const updateRanges = (nextRanges: StoryboardShotRange[]) => {
      onSelect?.(form, field.id)
      onUpdate?.(form, field.id, stringifyStoryboardShotRanges(nextRanges))
    }

    return (
      <div className={`rounded-2xl border p-3 ${selected ? 'border-gray-950' : 'border-gray-200'}`}>
        {commonLabel}
        <div className="space-y-3">
          {ranges.map(range => (
            <div key={range.id} className="rounded-xl bg-gray-50 p-3">
              <div className="nodrag mb-2 flex items-center gap-2">
                <select
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700"
                  value={range.start}
                  onChange={(event) => updateRanges(ranges.map(candidate => candidate.id === range.id ? { ...candidate, start: Number(event.target.value) } : candidate))}
                  onFocus={() => onSelect?.(form, field.id)}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(number => <option key={number} value={number}>{number}</option>)}
                </select>
                <span className="text-xs font-bold text-gray-400">-</span>
                <select
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-700"
                  value={range.end}
                  onChange={(event) => updateRanges(ranges.map(candidate => candidate.id === range.id ? { ...candidate, end: Number(event.target.value) } : candidate))}
                  onFocus={() => onSelect?.(form, field.id)}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(number => <option key={number} value={number}>{number}</option>)}
                </select>
              </div>
              <textarea
                className="nodrag nowheel min-h-[88px] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-900 outline-none focus:border-gray-950"
                value={range.content}
                placeholder={field.placeholder}
                onFocus={() => onSelect?.(form, field.id)}
                onChange={(event) => updateRanges(ranges.map(candidate => candidate.id === range.id ? { ...candidate, content: event.target.value } : candidate))}
              />
            </div>
          ))}
          <button
            type="button"
            className="nodrag w-full rounded-xl bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-200"
            onClick={() => updateRanges([...ranges, createStoryboardShotRange(Date.now())])}
          >
            新增镜头段
          </button>
        </div>
      </div>
    )
  }

  return (
    <label className={`block rounded-2xl border p-3 ${selected ? 'border-gray-950' : 'border-gray-200'}`}>
      {commonLabel}
      <textarea
        className="nodrag nowheel w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-950 focus:bg-white"
        value={value}
        rows={Math.max(3, field.rows || 3)}
        placeholder={field.placeholder}
        onFocus={() => onSelect?.(form, field.id)}
        onChange={(event) => onUpdate?.(form, field.id, event.target.value)}
      />
    </label>
  )
}

const CanvasLockedBlock = ({ text, label }: { text: string; label?: string }) => (
  <div className="rounded-2xl border border-gray-100 bg-[#f7f5ef] p-3">
    {label && <div className="mb-2 text-xs font-black text-gray-500">{label}</div>}
    <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-6 text-gray-700">{text}</pre>
  </div>
)

const FreeCanvasMediaNode = ({ data, selected }: NodeProps<Node<FreeCanvasNodeData>>) => {
  const media = data.mediaNode
  return (
    <div className={`w-[280px] rounded-[18px] border bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ${selected ? 'border-violet-500' : 'border-gray-200'}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          {media?.kind === 'textOverlay' ? <Type className="h-4 w-4" /> : media?.kind === 'arrowAnnotation' ? <MousePointer2 className="h-4 w-4" /> : <Image className="h-4 w-4" />}
        </span>
        <div>
          <div className="text-sm font-black text-gray-950">{data.title}</div>
          <div className="text-[11px] font-bold text-gray-400">{media?.kind}</div>
        </div>
      </div>
      {media?.imageUrl ? (
        <img src={media.imageUrl} alt="" className="h-28 w-full rounded-xl object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-xs font-bold text-gray-400">
          {data.subtitle}
        </div>
      )}
      {media?.text && <p className="mt-3 text-sm font-semibold text-gray-700">{media.text}</p>}
    </div>
  )
}

const nodeTypes = {
  threeStageForm: ThreeStageFormNode,
  freeCanvasMedia: FreeCanvasMediaNode
}

const CanvasCreateMenu = ({
  x,
  y,
  onCreateCharacter,
  onCreatePair,
  onCreateMedia
}: {
  x: number
  y: number
  onCreateCharacter: () => void
  onCreatePair: () => void
  onCreateMedia: (kind: FreeCanvasMediaNodeKind) => void
}) => (
  <div className="fixed z-40 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl" style={{ left: x, top: y }}>
    <CreateMenuButton label="新建人物板" onClick={onCreateCharacter} />
    <CreateMenuButton label="新建故事+提示词组" onClick={onCreatePair} />
    <CreateMenuButton label="新建图片节点" onClick={() => onCreateMedia('imageAsset')} />
    <CreateMenuButton label="新建文字标注" onClick={() => onCreateMedia('textOverlay')} />
    <CreateMenuButton label="新建箭头标注" onClick={() => onCreateMedia('arrowAnnotation')} />
  </div>
)

const CreateMenuButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="block w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-gray-950" onClick={onClick}>
    {label}
  </button>
)

const CanvasBottomToolbar = ({
  onCreateCharacter,
  onCreatePair,
  onCreateMedia
}: {
  onCreateCharacter: () => void
  onCreatePair: () => void
  onCreateMedia: (kind: FreeCanvasMediaNodeKind) => void
}) => (
  <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur" data-free-canvas-toolbar>
    <ToolbarButton title="人物板" onClick={onCreateCharacter}><Plus className="h-4 w-4" /></ToolbarButton>
    <ToolbarButton title="故事+提示词组" onClick={onCreatePair}><Workflow className="h-4 w-4" /></ToolbarButton>
    <ToolbarButton title="图片节点" onClick={() => onCreateMedia('imageAsset')}><Image className="h-4 w-4" /></ToolbarButton>
    <ToolbarButton title="文字标注" onClick={() => onCreateMedia('textOverlay')}><Type className="h-4 w-4" /></ToolbarButton>
    <ToolbarButton title="箭头标注" onClick={() => onCreateMedia('arrowAnnotation')}><MousePointer2 className="h-4 w-4" /></ToolbarButton>
  </div>
)

const ToolbarButton = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
  <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-950 hover:text-white" title={title} onClick={onClick}>
    {children}
  </button>
)

const findThreeStageForm = (threeStage: IThreeStageProject, formId: string): IThreeStageForm | undefined => {
  for (const page of normalizeThreeStagePages(threeStage)) {
    for (const item of page.items) {
      if (item.kind === 'character' && item.form.id === formId) return item.form
      if (item.kind === 'storyVideoPair') {
        if (item.storyboardForm.id === formId) return item.storyboardForm
        if (item.videoPromptForm.id === formId) return item.videoPromptForm
      }
    }
  }
  return undefined
}

const getFormPageId = (threeStage: IThreeStageProject, formId: string): string | null => {
  for (const page of normalizeThreeStagePages(threeStage)) {
    for (const item of page.items) {
      if (item.kind === 'character' && item.form.id === formId) return page.id
      if (item.kind === 'storyVideoPair' && (item.storyboardForm.id === formId || item.videoPromptForm.id === formId)) return page.id
    }
  }
  return null
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'TEXTAREA' ||
    target.tagName === 'INPUT' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
}

export default FreeCanvasBuilderScreen
