import { useEffect, useRef, type KeyboardEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BringToFront,
  Copy,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Layers2,
  Scissors,
  SendToBack,
  Trash2,
  ZoomIn
} from 'lucide-react'
import type {
  ImageNodeCommandId,
  ResolvedImageNodeCommand
} from '@/domain/image-actions/image-node-commands'
import {
  clampContextMenuPosition,
  imageCommandDisabledReasonLabel,
  type ContextMenuPosition
} from './image-action-ui'

export interface CanvasNodeContextMenuProps {
  position: ContextMenuPosition
  commands: readonly ResolvedImageNodeCommand[]
  onExecute: (commandId: ImageNodeCommandId) => void
  onClose: () => void
}

const menuWidth = 288
const menuHeight = 620

export const CanvasNodeContextMenu = ({
  position,
  commands,
  onExecute,
  onClose
}: CanvasNodeContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const clamped = clampContextMenuPosition(position, typeof window === 'undefined'
    ? { width: 1440, height: 900 }
    : { width: window.innerWidth, height: window.innerHeight }, { width: menuWidth, height: menuHeight })

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])

  const contextCommands = commands.filter(command => command.surfaces.includes('context'))
  const sections = commandSections(contextCommands)

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="图片节点菜单"
      className="fixed z-[75] max-h-[calc(100vh-24px)] w-72 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1.5 text-gray-900 shadow-[0_24px_80px_rgba(15,23,42,0.2)]"
      style={{ left: clamped.x, top: clamped.y }}
      onContextMenu={event => event.preventDefault()}
      onKeyDown={event => handleMenuKey(event, onClose)}
    >
      {sections.map((section, sectionIndex) => (
        <div key={section[0]?.id || sectionIndex} className={sectionIndex > 0 ? 'border-t border-gray-100 pt-1.5 mt-1.5' : ''}>
          {section.map(command => (
            <button
              key={command.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-300"
              disabled={!command.enabled}
              title={command.enabled ? command.label : imageCommandDisabledReasonLabel(command.disabledReason)}
              onClick={() => {
                onExecute(command.id)
                onClose()
              }}
            >
              <span className="flex h-5 w-5 items-center justify-center">{contextIcon(command.id)}</span>
              <span>{command.label}</span>
              {command.shortcut && <kbd className="ml-auto text-xs font-medium text-gray-400">{command.shortcut}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

const commandSections = (
  commands: readonly ResolvedImageNodeCommand[]
): ResolvedImageNodeCommand[][] => {
  const groups: readonly ImageNodeCommandId[][] = [
    ['copy', 'duplicate', 'copy-visible', 'export-visible', 'download-original', 'delete'],
    ['as-reference', 'effect-render', 'region-redraw', 'outpaint', 'multi-view', 'erase', 'subject-extract', 'text-edit', 'enhance'],
    ['crop', 'annotate'],
    ['zoom-selection'],
    ['layer-up', 'bring-front', 'layer-down', 'send-back'],
    ['flip-horizontal', 'flip-vertical']
  ]
  return groups
    .map(ids => ids.flatMap(id => {
      const command = commands.find(candidate => candidate.id === id)
      return command ? [command] : []
    }))
    .filter(section => section.length > 0)
}

const handleMenuKey = (
  event: KeyboardEvent<HTMLDivElement>,
  onClose: () => void
) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
    return
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
  if (buttons.length === 0) return
  event.preventDefault()
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? buttons.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}

const contextIcon = (id: ImageNodeCommandId) => {
  if (id === 'copy' || id === 'duplicate' || id === 'copy-visible') return <Copy className="h-4 w-4" />
  if (id === 'download-original' || id === 'export-visible') return <Download className="h-4 w-4" />
  if (id === 'delete') return <Trash2 className="h-4 w-4" />
  if (id === 'crop') return <Scissors className="h-4 w-4" />
  if (id === 'zoom-selection') return <ZoomIn className="h-4 w-4" />
  if (id === 'layer-up') return <Layers2 className="h-4 w-4" />
  if (id === 'bring-front') return <BringToFront className="h-4 w-4" />
  if (id === 'layer-down') return <ArrowDownToLine className="h-4 w-4" />
  if (id === 'send-back') return <SendToBack className="h-4 w-4" />
  if (id === 'flip-horizontal') return <FlipHorizontal2 className="h-4 w-4" />
  if (id === 'flip-vertical') return <FlipVertical2 className="h-4 w-4" />
  return <ArrowUpToLine className="h-4 w-4" />
}
