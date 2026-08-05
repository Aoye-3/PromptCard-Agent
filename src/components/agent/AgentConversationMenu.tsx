import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, History, MessageSquarePlus, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { storageServiceClient, type AgentConversationDetail, type AgentConversationSummary } from '@/storage/storage-service-client'

export function AgentConversationMenu({
  projectId,
  mode,
  activeConversationId,
  onConversationChange
}: {
  projectId: string
  mode: string
  activeConversationId?: string
  onConversationChange: (conversation: AgentConversationDetail) => void
}) {
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([])
  const [trash, setTrash] = useState<AgentConversationSummary[]>([])
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'history' | 'trash' | null>(null)
  const [loadError, setLoadError] = useState('')
  const conversationChangeRef = useRef(onConversationChange)
  conversationChangeRef.current = onConversationChange
  const selected = conversations.find(item => item.id === activeConversationId)

  const selectConversation = useCallback(async (id: string) => {
    const detail = await storageServiceClient.agentConversations.get(id, projectId)
    localStorage.setItem(`promptcard-agent-conversation:${projectId}`, id)
    conversationChangeRef.current(detail)
    setOpen(false)
  }, [projectId])

  const load = useCallback(async () => {
    const [activePage, trashPage] = await Promise.all([
      storageServiceClient.agentConversations.list(projectId),
      storageServiceClient.agentConversations.list(projectId, 'trash')
    ])
    setConversations(activePage.conversations)
    setTrash(trashPage.conversations)
    let id = activeConversationId
    if (!id || !activePage.conversations.some(item => item.id === id)) {
      const remembered = localStorage.getItem(`promptcard-agent-conversation:${projectId}`)
      id = activePage.conversations.find(item => item.id === remembered)?.id
    }
    if (!id && activePage.conversations.length === 0) {
      const created = await storageServiceClient.agentConversations.create({
        projectId, entrypoint: 'workspace-chatbot-agent', mode, title: '新会话'
      })
      id = created.id
      setConversations([created])
    } else if (!id) {
      id = activePage.conversations[0]?.id
    }
    if (id) await selectConversation(id)
  }, [activeConversationId, mode, projectId, selectConversation])

  useEffect(() => {
    void load().catch(reason => setLoadError(reason instanceof Error ? reason.message : String(reason)))
  }, [load])

  async function createConversation() {
    const created = await storageServiceClient.agentConversations.create({
      projectId, entrypoint: 'workspace-chatbot-agent', mode, title: '新会话'
    })
    setConversations(current => [created, ...current])
    await selectConversation(created.id)
  }

  async function renameConversation(item: AgentConversationSummary) {
    const title = window.prompt('重命名会话', item.title)?.trim()
    if (!title) return
    await storageServiceClient.agentConversations.rename(item.id, projectId, title)
    await load()
  }

  async function trashConversation(item: AgentConversationSummary) {
    await storageServiceClient.agentConversations.trash(item.id, projectId)
    await load()
  }

  async function restoreConversation(item: AgentConversationSummary) {
    await storageServiceClient.agentConversations.restore(item.id, projectId)
    await load()
  }

  async function deleteForever(item: AgentConversationSummary) {
    if (!window.confirm(`永久删除会话“${item.title}”？此操作无法撤销。`)) return
    await storageServiceClient.agentConversations.deleteForever(item.id, projectId)
    await load()
  }

  return (
    <>
      <AgentConversationMenuView
        activeTitle={loadError ? '会话暂不可用' : selected?.title || '新会话'}
        conversations={conversations}
        trashCount={trash.length}
        open={open}
        onToggle={() => setOpen(value => !value)}
        onSelect={id => void selectConversation(id)}
        onNew={() => void createConversation()}
        onManage={() => { setDialog('history'); setOpen(false) }}
        onOpenTrash={() => { setDialog('trash'); setOpen(false) }}
      />
      {dialog ? (
        <ConversationDialog
          mode={dialog}
          items={dialog === 'history' ? conversations : trash}
          onClose={() => setDialog(null)}
          onSelect={id => { void selectConversation(id); setDialog(null) }}
          onRename={item => void renameConversation(item)}
          onTrash={item => void trashConversation(item)}
          onRestore={item => void restoreConversation(item)}
          onDeleteForever={item => void deleteForever(item)}
        />
      ) : null}
    </>
  )
}

export function AgentConversationMenuView({
  activeTitle, conversations, trashCount, open, onToggle, onSelect, onNew, onManage, onOpenTrash
}: {
  activeTitle: string
  conversations: Array<Pick<AgentConversationSummary, 'id' | 'title' | 'updatedAt'>>
  trashCount: number
  open: boolean
  onToggle: () => void
  onSelect: (id: string) => void
  onNew: () => void
  onManage: () => void
  onOpenTrash: () => void
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" onClick={onToggle} className="flex h-8 max-w-full items-center gap-1.5 rounded-lg px-2 text-left text-xs font-bold text-gray-800 hover:bg-gray-100" aria-expanded={open}>
        <History className="h-3.5 w-3.5 shrink-0 text-gray-500" /><span className="truncate">{activeTitle}</span><ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open ? (
        <div className="absolute left-0 top-9 z-40 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
          {conversations.slice(0, 5).map(item => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full truncate px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50">{item.title}</button>)}
          <div className="my-1 border-t border-gray-100" />
          <MenuAction icon={<MessageSquarePlus className="h-4 w-4" />} label="新建会话" onClick={onNew} />
          <MenuAction icon={<History className="h-4 w-4" />} label="管理全部会话" onClick={onManage} />
          <MenuAction icon={<Trash2 className="h-4 w-4" />} label={`会话回收站 · ${trashCount}`} onClick={onOpenTrash} />
        </div>
      ) : null}
    </div>
  )
}

function ConversationDialog({ mode, items, onClose, onSelect, onRename, onTrash, onRestore, onDeleteForever }: {
  mode: 'history' | 'trash'; items: AgentConversationSummary[]; onClose: () => void
  onSelect: (id: string) => void; onRename: (item: AgentConversationSummary) => void
  onTrash: (item: AgentConversationSummary) => void; onRestore: (item: AgentConversationSummary) => void
  onDeleteForever: (item: AgentConversationSummary) => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-4" role="dialog" aria-modal="true" aria-label={mode === 'history' ? '历史会话' : '会话回收站'}>
      <div className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="text-lg font-black">{mode === 'history' ? '历史会话' : '会话回收站'}</h2><p className="mt-1 text-xs text-gray-500">{mode === 'history' ? '切换、重命名或整理当前项目的 Agent 对话。' : '只包含当前项目被删除的 Agent 对话。'}</p></div><button type="button" onClick={onClose} aria-label="关闭"><X className="h-5 w-5" /></button></header>
        <ul className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto">
          {items.length === 0 ? <li className="p-10 text-center text-sm text-gray-400">这里还没有会话</li> : items.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-5 py-3"><button type="button" disabled={mode === 'trash'} onClick={() => onSelect(item.id)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-bold text-gray-900">{item.title}</span><span className="mt-1 block text-xs text-gray-400">{new Date(item.updatedAt).toLocaleString()}</span></button>{mode === 'history' ? <><button type="button" onClick={() => onRename(item)} aria-label="重命名会话" className="p-2 text-gray-500"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => onTrash(item)} aria-label="移入会话回收站" className="p-2 text-gray-500"><Trash2 className="h-4 w-4" /></button></> : <><button type="button" onClick={() => onRestore(item)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold"><RotateCcw className="h-3.5 w-3.5" />恢复</button><button type="button" onClick={() => onDeleteForever(item)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">永久删除</button></>}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function MenuAction({ icon, label, onClick }: { icon: JSX.Element; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-gray-700 hover:bg-gray-50">{icon}{label}</button>
}
