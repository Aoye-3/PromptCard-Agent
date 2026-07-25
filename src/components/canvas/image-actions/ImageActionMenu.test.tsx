import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ResolvedImageNodeCommand } from '@/domain/image-actions/image-node-commands'
import { CanvasNodeContextMenu } from './CanvasNodeContextMenu'
import { ImageNodeActionBar } from './ImageNodeActionBar'
import { clampContextMenuPosition } from './image-action-ui'

const command = (
  overrides: Partial<ResolvedImageNodeCommand> & Pick<ResolvedImageNodeCommand, 'id' | 'label'>
): ResolvedImageNodeCommand => ({
  surfaces: ['toolbar', 'more', 'context'],
  enabled: true,
  disabledReason: null,
  qualityStatus: null,
  ...overrides
})

describe('image action menu surfaces', () => {
  it('clamps context menus inside all viewport edges', () => {
    expect(clampContextMenuPosition({ x: -20, y: -40 }, { width: 1000, height: 800 }, { width: 280, height: 500 }))
      .toEqual({ x: 12, y: 12 })
    expect(clampContextMenuPosition({ x: 980, y: 790 }, { width: 1000, height: 800 }, { width: 280, height: 500 }))
      .toEqual({ x: 708, y: 288 })
  })

  it('renders one named toolbar and truthful disabled reason', () => {
    const html = renderToStaticMarkup(
      <ImageNodeActionBar
        commands={[
          command({ id: 'effect-render', label: '效果图', enabled: false, disabledReason: 'not_evaluated', qualityStatus: 'untested' }),
          command({ id: 'export-visible', label: '下载所见图片', surfaces: ['toolbar', 'context'] })
        ]}
        onExecute={vi.fn()}
      />
    )

    expect(html).toContain('role="toolbar"')
    expect(html).toContain('aria-label="图片编辑操作"')
    expect(html).toContain('此操作尚未完成质量评估')
    expect(html).toContain('下载所见图片')
  })

  it('renders context commands from the shared definitions with shortcuts', () => {
    const html = renderToStaticMarkup(
      <CanvasNodeContextMenu
        position={{ x: 12, y: 12 }}
        commands={[
          command({ id: 'copy', label: '复制', surfaces: ['context', 'shortcut'], shortcut: 'Ctrl+C' }),
          command({ id: 'delete', label: '删除', surfaces: ['context', 'shortcut'], shortcut: 'Backspace' })
        ]}
        onExecute={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(html).toContain('role="menu"')
    expect(html).toContain('Ctrl+C')
    expect(html).toContain('Backspace')
  })
})
