import { Copy, Trash2, Wand2 } from 'lucide-react'
import type { ContextMenuPosition } from './image-action-ui'
import {
  CanvasContextMenu,
  CanvasContextMenuItem
} from './CanvasContextMenu'

export type TextNodeContextCommand = 'copy' | 'complete' | 'delete'

interface CanvasTextNodeContextMenuProps {
  position: ContextMenuPosition
  completeDisabled?: boolean
  onExecute: (command: TextNodeContextCommand) => void
  onClose: () => void
}

export const CanvasTextNodeContextMenu = ({
  position,
  completeDisabled = false,
  onExecute,
  onClose
}: CanvasTextNodeContextMenuProps) => {
  const execute = (command: TextNodeContextCommand) => {
    onExecute(command)
    onClose()
  }

  return (
    <CanvasContextMenu
      position={position}
      ariaLabel="文字节点菜单"
      estimatedHeight={112}
      onClose={onClose}
    >
      <CanvasContextMenuItem
        icon={<Copy className="h-3.5 w-3.5" />}
        label="复制"
        shortcut="Ctrl+C"
        onSelect={() => execute('copy')}
      />
      <CanvasContextMenuItem
        icon={<Wand2 className="h-3.5 w-3.5" />}
        label="补全"
        disabled={completeDisabled}
        title={completeDisabled ? '预览模式下无法使用 Agent 补全' : '补全'}
        onSelect={() => execute('complete')}
      />
      <div className="mt-1 border-t border-gray-100 pt-1">
        <CanvasContextMenuItem
          icon={<Trash2 className="h-3.5 w-3.5" />}
          label="删除"
          shortcut="Backspace"
          onSelect={() => execute('delete')}
        />
      </div>
    </CanvasContextMenu>
  )
}
