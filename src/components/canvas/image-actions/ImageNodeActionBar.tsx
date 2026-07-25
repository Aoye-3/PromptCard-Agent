import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  BoxSelect,
  Brush,
  Download,
  Eraser,
  Expand,
  Image as ImageIcon,
  MoreHorizontal,
  ScanText,
  ScanFace,
  Sparkles,
  Wand2
} from 'lucide-react'
import type {
  ImageNodeCommandId,
  ResolvedImageNodeCommand
} from '@/domain/image-actions/image-node-commands'
import { imageCommandDisabledReasonLabel } from './image-action-ui'

export interface ImageNodeActionBarProps {
  commands: readonly ResolvedImageNodeCommand[]
  onExecute: (commandId: ImageNodeCommandId) => void
}

const primaryIds: readonly ImageNodeCommandId[] = [
  'as-reference',
  'outpaint',
  'effect-render',
  'region-redraw',
  'multi-view'
]

export const ImageNodeActionBar = ({ commands, onExecute }: ImageNodeActionBarProps) => {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const primary = primaryIds.flatMap(id => {
    const command = commands.find(candidate => candidate.id === id && candidate.surfaces.includes('toolbar'))
    return command ? [command] : []
  })
  const more = commands.filter(command => command.surfaces.includes('more'))
  const download = commands.find(command => command.id === 'export-visible')

  useEffect(() => {
    if (!moreOpen) return
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMoreOpen(false)
      moreButtonRef.current?.focus()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [moreOpen])

  return (
    <div
      role="toolbar"
      aria-label="图片编辑操作"
      className="nodrag nowheel relative flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-2 py-1.5 text-gray-900 shadow-[0_18px_55px_rgba(15,23,42,0.16)]"
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onKeyDown={handleToolbarKeys}
    >
      {primary.map(command => (
        <ActionButton
          key={command.id}
          command={command}
          icon={commandIcon(command.id)}
          onExecute={onExecute}
        />
      ))}
      {more.length > 0 && (
        <>
          <div className="mx-1 h-6 w-px bg-gray-200" aria-hidden="true" />
          <button
            ref={moreButtonRef}
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 transition hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            aria-label="更多图片操作"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(current => !current)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {moreOpen && (
            <div
              role="menu"
              aria-label="更多图片操作"
              className="absolute right-8 top-[calc(100%+8px)] z-50 min-w-52 rounded-2xl border border-gray-200 bg-white p-1.5 text-gray-900 shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
            >
              {more.map(command => (
                <MenuCommand
                  key={command.id}
                  command={command}
                  onExecute={id => {
                    setMoreOpen(false)
                    onExecute(id)
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
      {download && (
        <>
          <div className="mx-1 h-6 w-px bg-gray-200" aria-hidden="true" />
          <ActionButton command={download} icon={<Download className="h-4 w-4" />} iconOnly onExecute={onExecute} />
        </>
      )}
    </div>
  )
}

const ActionButton = ({
  command,
  icon,
  iconOnly = false,
  onExecute
}: {
  command: ResolvedImageNodeCommand
  icon: ReactNode
  iconOnly?: boolean
  onExecute: (commandId: ImageNodeCommandId) => void
}) => (
  <button
    type="button"
    className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
    disabled={!command.enabled}
    title={command.enabled ? command.label : imageCommandDisabledReasonLabel(command.disabledReason)}
    aria-label={command.label}
    onClick={() => onExecute(command.id)}
  >
    {icon}
    {!iconOnly && <span>{command.label}</span>}
  </button>
)

const MenuCommand = ({
  command,
  onExecute
}: {
  command: ResolvedImageNodeCommand
  onExecute: (commandId: ImageNodeCommandId) => void
}) => (
  <button
    type="button"
    role="menuitem"
    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
    disabled={!command.enabled}
    title={command.enabled ? command.label : imageCommandDisabledReasonLabel(command.disabledReason)}
    onClick={() => onExecute(command.id)}
  >
    {commandIcon(command.id)}
    <span>{command.label}</span>
    {command.qualityStatus === 'experimental' && (
      <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">实验</span>
    )}
  </button>
)

const handleToolbarKeys = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (index < 0 || buttons.length === 0) return
  event.preventDefault()
  const delta = event.key === 'ArrowRight' ? 1 : -1
  buttons[(index + delta + buttons.length) % buttons.length]?.focus()
}

const commandIcon = (id: ImageNodeCommandId): ReactNode => {
  if (id === 'as-reference') return <ImageIcon className="h-4 w-4" />
  if (id === 'outpaint') return <Expand className="h-4 w-4" />
  if (id === 'effect-render') return <Wand2 className="h-4 w-4" />
  if (id === 'region-redraw') return <Brush className="h-4 w-4" />
  if (id === 'multi-view') return <BoxSelect className="h-4 w-4" />
  if (id === 'erase') return <Eraser className="h-4 w-4" />
  if (id === 'subject-extract') return <ScanFace className="h-4 w-4" />
  if (id === 'text-edit') return <ScanText className="h-4 w-4" />
  return <Sparkles className="h-4 w-4" />
}
