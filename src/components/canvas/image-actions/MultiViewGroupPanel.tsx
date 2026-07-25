import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import {
  deriveMultiViewGroupState,
  type MultiViewMemberState
} from '@/domain/image-actions/multi-view-recipe'

export interface MultiViewGroupPanelMember {
  nodeId: string
  itemId: string
  viewId: string
  viewLabel: string
  state: MultiViewMemberState
  assetId: string | null
}

export interface MultiViewGroupPanelProps {
  groupId: string
  members: readonly MultiViewGroupPanelMember[]
  sourceAvailable: boolean
  onSelect: (nodeId: string) => void
  onRetry: (member: MultiViewGroupPanelMember) => void
  onUseAsReference: (member: MultiViewGroupPanelMember) => void
}

export const MultiViewGroupPanel = ({
  groupId,
  members,
  sourceAvailable,
  onSelect,
  onRetry,
  onUseAsReference
}: MultiViewGroupPanelProps) => {
  const group = deriveMultiViewGroupState(members)
  return (
    <section
      className="absolute bottom-5 left-5 z-30 w-[340px] overflow-hidden rounded-[20px] border border-gray-200 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur"
      aria-label="多角度结果组"
      data-multi-view-group={groupId}
    >
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-black text-gray-950">
            <Sparkles className="h-3.5 w-3.5 text-[#c96442]" />
            多角度结果
          </div>
          <p className="mt-0.5 text-[11px] text-gray-500">{group.succeeded}/{group.total} 成功 · {group.failed} 失败</p>
        </div>
        <GroupStateBadge state={group.state} />
      </header>
      <div className="max-h-64 space-y-1 overflow-y-auto p-2">
        {members.map(member => (
          <div
            key={member.itemId}
            className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-gray-50"
            data-multi-view-member={member.itemId}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => onSelect(member.nodeId)}
            >
              <MemberStateIcon state={member.state} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-gray-800">{member.viewLabel}</span>
                <span className="block text-[10px] text-gray-500">{memberStateLabel(member.state)}</span>
              </span>
            </button>
            {member.state === 'failed' && (
              <button
                type="button"
                className="rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-bold text-gray-700 hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!sourceAvailable}
                title={sourceAvailable ? '只为这个视角创建一次新请求' : '原始源图片已不在画布中'}
                onClick={() => onRetry(member)}
              >
                重试此视角
              </button>
            )}
            {member.state === 'succeeded' && member.assetId && (
              <button
                type="button"
                className="rounded-full border border-gray-200 px-2.5 py-1 text-[10px] font-bold text-gray-700 hover:border-gray-400"
                onClick={() => onUseAsReference(member)}
              >
                作为参考
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="border-t border-gray-100 px-4 py-2 text-[10px] leading-4 text-gray-500">
        视角由 AI 推断，并非精确 3D 重建。重试只创建该失败视角的新运行。
      </p>
    </section>
  )
}

const GroupStateBadge = ({ state }: { state: ReturnType<typeof deriveMultiViewGroupState>['state'] }) => {
  const label = state === 'succeeded'
    ? '全部成功'
    : state === 'failed'
      ? '全部失败'
      : state === 'partial'
        ? '部分完成'
        : state === 'running'
          ? '生成中'
          : '等待中'
  return (
    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-600">
      {label}
    </span>
  )
}

const MemberStateIcon = ({ state }: { state: MultiViewMemberState }) => {
  if (state === 'succeeded') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
  if (state === 'failed') return <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
  if (state === 'running') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#c96442]" />
  return <RefreshCw className="h-4 w-4 shrink-0 text-gray-400" />
}

const memberStateLabel = (state: MultiViewMemberState): string => {
  if (state === 'succeeded') return '已生成'
  if (state === 'failed') return '生成失败'
  if (state === 'running') return '生成中'
  return '等待中'
}
