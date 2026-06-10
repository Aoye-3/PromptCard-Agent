import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  PanOnScrollMode,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Connection,
  type Node,
  type NodeChange,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type NodeProps,
  type OnConnect,
  type OnNodeDrag,
  useReactFlow
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronLeft, ChevronRight, Copy, Database, FileText, Home, Image, Layers, Lock, MousePointer2, Package, PanelLeft, PanelRight, Pencil, Plus, RotateCcw, Trash2, Type, Unlock, Workflow } from 'lucide-react'
import { AIChatbotBox } from '@/components/AgentCollaborationPanel'
import {
  addCharacterFormToPage,
  addObjectFormToPage,
  addStoryVideoPairToPage,
  addThreeStagePage,
  getSelectedThreeStageFormContext,
  normalizeThreeStagePages,
  removeThreeStagePage,
  selectThreeStageForm,
  syncThreeStageLegacyFields,
  updateThreeStageFormSection
} from '@/domain/three-stage/three-stage-pages'
import {
  addFreeCanvasEdge,
  addFreeCanvasMediaNode,
  buildFreeCanvasFormOutput,
  buildFreeCanvasGraph,
  createFreeCanvasMediaNode,
  getFreeCanvasConnectedChain,
  getFormFixedContentOverrides,
  removeFreeCanvasNodes,
  removeFreeCanvasFlowNodes,
  type FreeCanvasFlowEdge,
  type FreeCanvasFlowNode,
  type FreeCanvasMediaNodeKind,
  type FreeCanvasNodeData,
  updateFreeCanvasMediaNode,
  updateFreeCanvasFormFixedContent,
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
  const selectedOutput = buildFreeCanvasFormOutput(selectedForm, getOutputProjectForForm(normalizedThreeStage, selectedForm))
  const graph = useMemo(() => buildFreeCanvasGraph(normalizedThreeStage), [normalizedThreeStage])
  const pages = useMemo(() => normalizeThreeStagePages(normalizedThreeStage), [normalizedThreeStage])
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(true)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  const updateFormSection = useCallback((form: IThreeStageForm, section: IThreeStageSection, fieldId?: string): void => {
    const pageId = getFormPageId(normalizedThreeStage, form.id) || selectedContext.page.id
    const updated = updateThreeStageFormSection({
      ...normalizedThreeStage,
      selectedPageId: pageId,
      selectedFormId: form.id,
      selectedStage: form.type,
      selectedFieldId: fieldId || normalizedThreeStage.selectedFieldId
    }, form.id, section)
    onChange(selectThreeStageForm(updated, pageId, form.id, fieldId))
  }, [normalizedThreeStage, onChange, selectedContext.page.id])

  const updateField = useCallback((form: IThreeStageForm, fieldId: string, nextValue: string): void => {
    updateFormSection(form, {
      ...form.section,
      fields: {
        ...form.section.fields,
        [fieldId]: nextValue
      },
      focusedFieldId: fieldId,
      updatedAt: Date.now()
    }, fieldId)
  }, [updateFormSection])

  const selectCanvasField = useCallback((form: IThreeStageForm, fieldId: string): void => {
    updateFormSection(form, {
      ...form.section,
      focusedFieldId: fieldId,
      updatedAt: Date.now()
    }, fieldId)
  }, [updateFormSection])

  const updateMediaText = useCallback((nodeId: string, text: string): void => {
    onChange(updateFreeCanvasMediaNode(normalizedThreeStage, nodeId.replace(/^media:/, ''), { text }))
  }, [normalizedThreeStage, onChange])

  const updateFixedContent = useCallback((form: IThreeStageForm, contentId: string, value: string): void => {
    onChange(updateFreeCanvasFormFixedContent(normalizedThreeStage, form.id, contentId, { value }))
  }, [normalizedThreeStage, onChange])

  const toggleFixedContent = useCallback((form: IThreeStageForm, contentId: string, unlocked: boolean): void => {
    const overrides = getFormFixedContentOverrides(form)
    const defaultValue = getFixedContentDefault(form, contentId)
    onChange(updateFreeCanvasFormFixedContent(normalizedThreeStage, form.id, contentId, {
      value: overrides[contentId]?.value ?? defaultValue,
      unlocked
    }))
  }, [normalizedThreeStage, onChange])

  const resetFixedContent = useCallback((form: IThreeStageForm, contentId: string): void => {
    onChange(updateFreeCanvasFormFixedContent(normalizedThreeStage, form.id, contentId, null))
  }, [normalizedThreeStage, onChange])

  const copyFormOutput = useCallback(async (form: IThreeStageForm): Promise<void> => {
    const output = buildFreeCanvasFormOutput(form, getOutputProjectForForm(normalizedThreeStage, form))
    if (!output.trim()) {
      window.alert(`${form.title}还没有可复制内容。`)
      return
    }
    try {
      await navigator.clipboard.writeText(output)
      window.alert('已复制到剪贴板。')
    } catch {
      window.alert('复制失败，请检查剪贴板权限。')
    }
  }, [normalizedThreeStage])

  const canvasNodes = useMemo(() => graph.nodes.map(node => {
    if (node.data.nodeKind !== 'threeStageForm' || !node.data.formId) {
      return {
        ...node,
        data: {
          ...node.data,
          onUpdateMediaText: updateMediaText
        }
      }
    }
    return {
      ...node,
      data: {
        ...node.data,
        form: findThreeStageForm(normalizedThreeStage, node.data.formId),
        selectedFieldId: normalizedThreeStage.selectedFieldId,
        onSelectField: selectCanvasField,
        onUpdateField: updateField,
        onUpdateFixedContent: updateFixedContent,
        onToggleFixedContent: toggleFixedContent,
        onResetFixedContent: resetFixedContent,
        onCopyOutput: copyFormOutput
      }
    }
  }), [copyFormOutput, graph.nodes, normalizedThreeStage, resetFixedContent, selectCanvasField, toggleFixedContent, updateField, updateFixedContent, updateMediaText])

  const [nodes, setNodes] = useState<FreeCanvasFlowNode[]>(canvasNodes)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [spacePressed, setSpacePressed] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
  const selectedNode = nodes.find(node => node.id === selectedNodeId) || null
  const selectedChain = useMemo(() => getFreeCanvasConnectedChain({ nodes: canvasNodes, edges: graph.edges }, selectedEdgeId), [canvasNodes, graph.edges, selectedEdgeId])
  const layerGroups = useMemo(() => buildLayerGroups(graph.nodes), [graph.nodes])
  const agentTargetTitle = selectedEdgeId
    ? `链条上下文 (${selectedChain.nodes.length} 个节点)`
    : selectedNode?.data.title || selectedForm.title
  const agentTargetDescription = selectedEdgeId
    ? 'Agent 将读取这条连通链上的人物版、故事版、提示词、图片节点和文字标注，用于补全故事版和其他提示词字段。'
    : `当前字段：${selectedField.label}。媒体节点只进入项目画布上下文，不获得 Prompt Library 写权限。`
  const workspaceContext = buildThreeStageWorkspaceContext({
    activeProject,
    threeStage: normalizedThreeStage,
    selectedOutput,
    freeCanvas: {
      selectedNodeId,
      selectedNodeType: selectedNode?.data.nodeKind,
      selectedMediaAssetId: selectedNode?.data.mediaNode?.assetId || null,
      selectedEdgeId,
      selectedChainNodeIds: selectedChain.nodeIds,
      nodes: graph.nodes.map(node => ({
        id: node.id,
        kind: node.data.nodeKind,
        title: node.data.title,
        formId: node.data.formId,
        mediaAssetId: node.data.mediaNode?.assetId || null
      })),
      selectedChainNodes: selectedChain.nodes.map(node => ({
        id: node.id,
        kind: node.data.nodeKind,
        title: node.data.title,
        formId: node.data.formId,
        formType: node.data.formType,
        mediaAssetId: node.data.mediaNode?.assetId || null,
        text: node.data.mediaNode?.text || node.data.subtitle,
        output: node.data.form ? buildFreeCanvasFormOutput(node.data.form, getOutputProjectForForm(normalizedThreeStage, node.data.form)) : undefined
      })),
      selectedChainEdges: selectedChain.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: typeof edge.label === 'string' ? edge.label : null
      }))
    }
  })

  useEffect(() => {
    setNodes(currentNodes => {
      const selectedIds = new Set(currentNodes.filter(node => node.selected).map(node => node.id))
      return canvasNodes.map(node => ({
        ...node,
        selected: selectedIds.has(node.id) || node.id === selectedNodeId
      }))
    })
  }, [canvasNodes, selectedNodeId])

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

  const createObject = (position = nextNodePosition()): void => {
    const currentNodeIds = new Set(graph.nodes.map(node => node.id))
    const withObject = addObjectFormToPage(normalizedThreeStage, selectedContext.page.id)
    const newNode = buildFreeCanvasGraph(withObject).nodes.find(node => !currentNodeIds.has(node.id) && node.data.nodeKind === 'threeStageForm')
    const positioned = newNode ? updateFreeCanvasNodePosition(withObject, newNode.id, position) : withObject
    onChange(positioned)
    setContextMenu(null)
  }

  const createPage = (): void => {
    onChange(addThreeStagePage(normalizedThreeStage))
  }

  const deletePage = (pageId: string): void => {
    if (pages.length <= 1) return
    if (!confirm('确定删除这个 Page 吗？')) return
    const removedFormNodeIds = graph.nodes
      .filter(node => node.data.nodeKind === 'threeStageForm' && node.data.pageId === pageId)
      .map(node => node.id)
    onChange(removeFreeCanvasFlowNodes(removeThreeStagePage(normalizedThreeStage, pageId), removedFormNodeIds))
  }

  const handleNodeClick: NodeMouseHandler<FreeCanvasFlowNode> = (_event, node): void => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    if (node.data.pageId && node.data.formId) {
      onChange(selectThreeStageForm(normalizedThreeStage, node.data.pageId, node.data.formId))
    }
  }

  const handleConnect: OnConnect = (connection: Connection): void => {
    if (!connection.source || !connection.target) return
    onChange(addFreeCanvasEdge(normalizedThreeStage, {
      source: connection.source,
      target: connection.target
    }))
  }

  const handleEdgeClick: EdgeMouseHandler<FreeCanvasFlowEdge> = (_event, edge): void => {
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }

  const handleNodesChange = (changes: NodeChange<FreeCanvasFlowNode>[]): void => {
    const nonRemovalChanges = changes.filter(change => change.type !== 'remove')
    if (nonRemovalChanges.length > 0) {
      setNodes(current => applyNodeChanges(nonRemovalChanges, current) as FreeCanvasFlowNode[])
    }
    const removedNodeIds = changes
      .filter(change => change.type === 'remove')
      .map(change => change.id)
    if (removedNodeIds.length === 0) return

    const result = removeFreeCanvasNodes(normalizedThreeStage, removedNodeIds)
    if (result.blockedReason) {
      window.alert(result.blockedReason)
      return
    }
    setSelectedNodeId(current => current && removedNodeIds.includes(current) ? null : current)
    setSelectedEdgeId(null)
    onChange(result.threeStage)
  }

  const selectLayerNode = (node: FreeCanvasFlowNode): void => {
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    reactFlow.setCenter(node.position.x + 160, node.position.y + 120, { zoom: reactFlow.getZoom(), duration: 260 })
    if (node.data.pageId && node.data.formId) {
      onChange(selectThreeStageForm(normalizedThreeStage, node.data.pageId, node.data.formId))
    }
  }

  const selectPage = (pageId: string): void => {
    const page = pages.find(candidate => candidate.id === pageId) || pages[0]
    const firstItem = page.items[0]
    const firstForm = firstItem?.kind === 'character' ? firstItem.form : firstItem?.storyboardForm
    if (firstForm) {
      onChange(selectThreeStageForm(normalizedThreeStage, page.id, firstForm.id))
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

  const canvasEdges = graph.edges.map(edge => edge.id === selectedEdgeId
    ? {
        ...edge,
        animated: true,
        style: { ...(edge.style || {}), stroke: '#c96442', strokeWidth: 2.4 }
      }
    : edge)

  return (
    <section className="fixed inset-x-0 bottom-[56px] top-14 z-20 overflow-hidden bg-[#f7f8fb]">
      <CanvasLayerDrawer
        open={leftDrawerOpen}
        projectTitle={activeProject.title}
        previewMode={previewMode}
        pages={pages}
        selectedPageId={normalizedThreeStage.selectedPageId || pages[0]?.id}
        layerGroups={layerGroups}
        selectedNodeId={selectedNodeId}
        selectedChainNodeIds={selectedChain.nodeIds}
        onBack={onBack}
        onRenameProject={onRenameProject}
        onSave={onSave}
        onToggle={() => setLeftDrawerOpen(value => !value)}
        onSelectPage={selectPage}
        onSelectNode={selectLayerNode}
        onCreatePage={createPage}
        onDeletePage={deletePage}
      />

      <div className={`h-full transition-[padding] ${leftDrawerOpen ? 'pl-[320px]' : 'pl-0'} ${rightPanelCollapsed ? 'pr-20' : 'pr-[520px]'}`} data-free-canvas-screen>
        <ReactFlow
          nodes={nodes}
          edges={canvasEdges}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          onNodesChange={handleNodesChange}
          onConnect={handleConnect}
          onEdgeClick={handleEdgeClick}
          onNodeClick={handleNodeClick}
          onNodeDragStop={handleNodeDragStop}
          onPaneClick={() => {
            setContextMenu(null)
            setSelectedEdgeId(null)
          }}
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
          <Background variant={BackgroundVariant.Lines} gap={32} size={1} color="#e2e8f0" />
          <MiniMap pannable zoomable className="!bottom-4 !left-4 !right-auto transition-all" />
          <Controls className="!bottom-6 !left-auto !right-6 transition-all" />
        </ReactFlow>
      </div>

      {contextMenu && (
        <CanvasCreateMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onCreateCharacter={() => createCharacter({ x: contextMenu.flowX, y: contextMenu.flowY })}
          onCreateObject={() => createObject({ x: contextMenu.flowX, y: contextMenu.flowY })}
          onCreatePair={() => createPair({ x: contextMenu.flowX, y: contextMenu.flowY })}
          onCreateMedia={(kind) => createMedia(kind, { x: contextMenu.flowX, y: contextMenu.flowY })}
        />
      )}

      <CanvasBottomToolbar
        onCreateCharacter={() => createCharacter()}
        onCreateObject={() => createObject()}
        onCreatePair={() => createPair()}
        onCreateMedia={(kind) => createMedia(kind)}
      />

      {rightPanelCollapsed ? (
        <button
          type="button"
          className="absolute bottom-6 right-6 top-6 z-40 flex w-12 flex-col items-center justify-center gap-3 rounded-[18px] border border-gray-200 bg-white/95 text-gray-500 shadow-[0_18px_55px_rgba(15,23,42,0.14)] transition hover:text-gray-950"
          onClick={() => setRightPanelCollapsed(false)}
          title="展开 Agent 面板"
        >
          <PanelRight className="h-5 w-5" />
          <span className="[writing-mode:vertical-rl] text-xs font-black uppercase tracking-wide">Agent</span>
        </button>
      ) : (
      <aside className="absolute bottom-0 right-0 top-0 z-30 flex w-[520px] flex-col overflow-hidden border-l border-gray-200 bg-white">
        <div className="shrink-0 border-b border-gray-100 px-4 py-3">
          <button type="button" className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-950" onClick={() => setRightPanelCollapsed(true)} title="收起 Agent 面板">
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="pr-8 text-sm font-black text-gray-950">{agentTargetTitle}</h2>
          <p className="mt-1 pr-8 text-[11px] leading-4 text-gray-500">{agentTargetDescription}</p>
          <p className="hidden">
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
            compact
            hideProposals
          />
        ) : (
          <div className="p-5 text-sm font-semibold text-gray-400">预览模式禁用 Agent Runtime。</div>
        )}
      </aside>
      )}
    </section>
  )
}

type CanvasLayerGroups = {
  promptNodes: FreeCanvasFlowNode[]
  imageNodes: FreeCanvasFlowNode[]
  textNodes: FreeCanvasFlowNode[]
}

const CanvasLayerDrawer = ({
  open,
  projectTitle,
  previewMode,
  pages,
  selectedPageId,
  layerGroups,
  selectedNodeId,
  selectedChainNodeIds,
  onBack,
  onRenameProject,
  onSave,
  onToggle,
  onSelectPage,
  onSelectNode,
  onCreatePage,
  onDeletePage
}: {
  open: boolean
  projectTitle: string
  previewMode?: boolean
  pages: ReturnType<typeof normalizeThreeStagePages>
  selectedPageId?: string
  layerGroups: CanvasLayerGroups
  selectedNodeId: string | null
  selectedChainNodeIds: string[]
  onBack: () => void
  onRenameProject?: () => void
  onSave: () => void
  onToggle: () => void
  onSelectPage: (pageId: string) => void
  onSelectNode: (node: FreeCanvasFlowNode) => void
  onCreatePage: () => void
  onDeletePage: (pageId: string) => void
}) => (
  <>
    {!open && (
      <button
        type="button"
        className="absolute left-3 top-3 z-40 flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:text-gray-950"
        onClick={onToggle}
        title="展开 Pages / Layers"
      >
        <PanelLeft className="h-3.5 w-3.5" />
      </button>
    )}
    {open && (
      <aside className="absolute bottom-0 left-0 top-0 z-30 flex w-[320px] flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-3 py-3">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950" onClick={onBack} title="返回项目">
              <Home className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-black text-gray-950">{projectTitle}</h1>
              <p className="truncate text-[10px] font-semibold text-gray-400">自由画布式构建</p>
            </div>
            {onRenameProject && (
              <button type="button" className="rounded-md p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-900" onClick={onRenameProject} title="重命名项目">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button type="button" className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950" onClick={onToggle} title="收起 Pages / Layers">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </div>
          <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-black px-3 py-2 text-xs font-bold text-white transition hover:bg-gray-800" onClick={onSave}>
            <Database className="h-3.5 w-3.5" />
            {previewMode ? '预览不保存' : '保存项目'}
          </button>
        </div>
        <div className="border-b border-gray-100 px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-black text-gray-950">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" />
              Pages
            </div>
          </div>
          <div className="space-y-0.5">
            {pages.map((page, index) => (
              <div key={page.id} className={`group flex items-center rounded-md transition ${page.id === selectedPageId ? 'bg-gray-950 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs font-bold"
                  onClick={() => onSelectPage(page.id)}
                >
                  {page.title || `Page ${index + 1}`}
                </button>
                <button
                  type="button"
                  className="mr-1 rounded p-1 opacity-40 transition hover:bg-white/15 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-15"
                  onClick={() => onDeletePage(page.id)}
                  disabled={pages.length <= 1}
                  title={pages.length <= 1 ? '至少保留一个 Page' : '删除 Page'}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-gray-200 px-2 py-1.5 text-[11px] font-bold text-gray-500 transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950"
            onClick={onCreatePage}
          >
            <Plus className="h-3.5 w-3.5" />
            新增 Page
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-black text-gray-950">
            <Layers className="h-3.5 w-3.5" />
            Layers
          </div>
          <LayerGroup title="提示词节点" nodes={layerGroups.promptNodes} selectedNodeId={selectedNodeId} selectedChainNodeIds={selectedChainNodeIds} onSelectNode={onSelectNode} />
          <LayerGroup title="图片节点" nodes={layerGroups.imageNodes} selectedNodeId={selectedNodeId} selectedChainNodeIds={selectedChainNodeIds} onSelectNode={onSelectNode} />
          <LayerGroup title="文字标注节点" nodes={layerGroups.textNodes} selectedNodeId={selectedNodeId} selectedChainNodeIds={selectedChainNodeIds} onSelectNode={onSelectNode} />
        </div>
      </aside>
    )}
  </>
)

const LayerGroup = ({
  title,
  nodes,
  selectedNodeId,
  selectedChainNodeIds,
  onSelectNode
}: {
  title: string
  nodes: FreeCanvasFlowNode[]
  selectedNodeId: string | null
  selectedChainNodeIds: string[]
  onSelectNode: (node: FreeCanvasFlowNode) => void
}) => (
  <div className="mb-3">
    <div className="mb-1.5 flex items-center justify-between text-[11px] font-black uppercase text-gray-400">
      <span>{title}</span>
      <span>{nodes.length}</span>
    </div>
    <div className="space-y-0.5">
      {nodes.length === 0 ? (
        <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-400">暂无节点</div>
      ) : nodes.map(node => {
        const inChain = selectedChainNodeIds.includes(node.id)
        return (
          <button
            key={node.id}
            type="button"
            className={`block w-full rounded-md px-2 py-1.5 text-left transition ${selectedNodeId === node.id ? 'bg-gray-950 text-white' : inChain ? 'bg-orange-50 text-orange-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}
            onClick={() => onSelectNode(node)}
          >
            <div className="truncate text-xs font-bold">{node.data.title}</div>
            <div className="truncate text-[10px] font-semibold opacity-60">{node.data.formType || node.data.nodeKind}</div>
          </button>
        )
      })}
    </div>
  </div>
)

const buildLayerGroups = (nodes: FreeCanvasFlowNode[]): CanvasLayerGroups => ({
  promptNodes: nodes.filter(node => node.data.nodeKind === 'threeStageForm'),
  imageNodes: nodes.filter(node => node.data.nodeKind === 'imageAsset'),
  textNodes: nodes.filter(node => node.data.nodeKind === 'textOverlay' || node.data.nodeKind === 'arrowAnnotation')
})

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
            return (
              <CanvasFixedContentBlock
                key={item.id}
                form={form}
                contentId={item.id}
                defaultValue={item.text}
                onUpdate={data.onUpdateFixedContent}
                onToggle={data.onToggleFixedContent}
                onReset={data.onResetFixedContent}
              />
            )
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
              onUpdateFixedContent={data.onUpdateFixedContent}
              onToggleFixedContent={data.onToggleFixedContent}
              onResetFixedContent={data.onResetFixedContent}
            />
          )
        }) : (
          <div className="rounded-2xl bg-gray-50 p-4 text-sm font-semibold text-gray-400">表单数据等待同步。</div>
        )}
      </div>
      {form && (
        <div className="border-t border-gray-100 p-4">
          <button
            type="button"
            className="nodrag flex w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            onClick={(event) => {
              event.stopPropagation()
              data.onCopyOutput?.(form)
            }}
          >
            <Copy className="h-4 w-4" />
            复制{form.title}
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-950" />
    </div>
  )
}

const CanvasFieldEditor = ({
  form,
  field,
  selected,
  onSelect,
  onUpdate,
  onUpdateFixedContent,
  onToggleFixedContent,
  onResetFixedContent
}: {
  form: IThreeStageForm
  field: FieldDefinition
  selected: boolean
  onSelect?: (form: IThreeStageForm, fieldId: string) => void
  onUpdate?: (form: IThreeStageForm, fieldId: string, value: string) => void
  onUpdateFixedContent?: (form: IThreeStageForm, contentId: string, value: string) => void
  onToggleFixedContent?: (form: IThreeStageForm, contentId: string, unlocked: boolean) => void
  onResetFixedContent?: (form: IThreeStageForm, contentId: string) => void
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
    return (
      <CanvasFixedContentBlock
        form={form}
        contentId={field.id}
        defaultValue={field.fixedValue}
        label={field.label}
        onUpdate={onUpdateFixedContent}
        onToggle={onToggleFixedContent}
        onReset={onResetFixedContent}
      />
    )
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

const CanvasFixedContentBlock = ({
  form,
  contentId,
  defaultValue,
  label,
  onUpdate,
  onToggle,
  onReset
}: {
  form: IThreeStageForm
  contentId: string
  defaultValue: string
  label?: string
  onUpdate?: (form: IThreeStageForm, contentId: string, value: string) => void
  onToggle?: (form: IThreeStageForm, contentId: string, unlocked: boolean) => void
  onReset?: (form: IThreeStageForm, contentId: string) => void
}) => {
  const override = getFormFixedContentOverrides(form)[contentId]
  const value = override?.value ?? defaultValue
  const unlocked = Boolean(override?.unlocked)

  return (
    <div className="rounded-2xl border border-gray-100 bg-[#f7f5ef] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-black text-gray-500">{label || '固定内容'}</div>
        <div className="nodrag flex items-center gap-1">
          {override && (
            <button
              type="button"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-gray-950"
              onClick={(event) => {
                event.stopPropagation()
                onReset?.(form, contentId)
              }}
              title="恢复默认"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-gray-950"
            onClick={(event) => {
              event.stopPropagation()
              onToggle?.(form, contentId, !unlocked)
            }}
            title={unlocked ? '重新锁定' : '解锁修改'}
          >
            {unlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {unlocked ? (
        <textarea
          className="nodrag nowheel min-h-[96px] w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-900 outline-none focus:border-gray-950"
          value={value}
          onChange={(event) => onUpdate?.(form, contentId, event.target.value)}
        />
      ) : (
        <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-6 text-gray-700">{value}</pre>
      )}
    </div>
  )
}

const FreeCanvasMediaNode = ({ data, selected }: NodeProps<Node<FreeCanvasNodeData>>) => {
  const media = data.mediaNode
  if (media?.kind === 'textOverlay') {
    return (
      <div className={`relative min-w-[180px] max-w-[360px] rounded-md p-1 ${selected ? 'ring-2 ring-violet-500' : ''}`}>
        <Handle type="target" position={Position.Left} className="!bg-violet-500" />
        <textarea
          className="nodrag nowheel block min-h-[42px] w-full resize-none bg-transparent text-base font-semibold leading-6 text-gray-950 outline-none placeholder:text-gray-400"
          value={media.text || ''}
          placeholder="文字标注"
          onChange={(event) => data.onUpdateMediaText?.(media.id, event.target.value)}
        />
        <Handle type="source" position={Position.Right} className="!bg-violet-500" />
      </div>
    )
  }

  return (
    <div className={`relative w-[280px] rounded-[18px] border bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)] ${selected ? 'border-violet-500' : 'border-gray-200'}`}>
      <Handle type="target" position={Position.Left} className="!bg-violet-500" />
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
          {media?.kind === 'arrowAnnotation' ? <MousePointer2 className="h-4 w-4" /> : <Image className="h-4 w-4" />}
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
      <Handle type="source" position={Position.Right} className="!bg-violet-500" />
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
  onCreateObject,
  onCreatePair,
  onCreateMedia
}: {
  x: number
  y: number
  onCreateCharacter: () => void
  onCreateObject: () => void
  onCreatePair: () => void
  onCreateMedia: (kind: FreeCanvasMediaNodeKind) => void
}) => (
  <div className="fixed z-40 w-64 rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl" style={{ left: x, top: y }}>
    <CreateMenuButton label="新建人物板" onClick={onCreateCharacter} />
    <CreateMenuButton label="新建物品版" onClick={onCreateObject} />
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
  onCreateObject,
  onCreatePair,
  onCreateMedia
}: {
  onCreateCharacter: () => void
  onCreateObject: () => void
  onCreatePair: () => void
  onCreateMedia: (kind: FreeCanvasMediaNodeKind) => void
}) => (
  <div className="absolute bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-3 py-2 shadow-[0_18px_60px_rgba(15,23,42,0.18)] backdrop-blur" data-free-canvas-toolbar>
    <ToolbarButton title="人物板" onClick={onCreateCharacter}><Plus className="h-4 w-4" /></ToolbarButton>
    <ToolbarButton title="物品版" onClick={onCreateObject}><Package className="h-4 w-4" /></ToolbarButton>
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

const getFixedContentDefault = (form: IThreeStageForm, contentId: string): string => {
  const stage = getStageDefinition(form.type)
  const layoutItem = stage.layout?.find(item => item.type === 'locked' && item.id === contentId)
  if (layoutItem?.type === 'locked') return layoutItem.text
  return stage.fields.find(field => field.id === contentId)?.fixedValue || ''
}

const getOutputProjectForForm = (threeStage: IThreeStageProject, form: IThreeStageForm): IThreeStageProject => {
  if (form.type !== 'videoPrompt') return threeStage
  for (const page of normalizeThreeStagePages(threeStage)) {
    for (const item of page.items) {
      if (item.kind === 'storyVideoPair' && item.videoPromptForm.id === form.id) {
        return { ...threeStage, storyboard: item.storyboardForm.section }
      }
    }
  }
  return threeStage
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
