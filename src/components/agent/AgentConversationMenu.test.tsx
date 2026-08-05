import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentConversationMenuView } from './AgentConversationMenu'

describe('AgentConversationMenuView', () => {
  it('renders quick history actions and a separate conversation trash entry', () => {
    const markup = renderToStaticMarkup(
      <AgentConversationMenuView
        activeTitle="Lighting discussion"
        conversations={[{ id: 'c1', title: 'Lighting discussion', updatedAt: 2 }]}
        trashCount={3}
        open
        onToggle={() => undefined}
        onSelect={() => undefined}
        onNew={() => undefined}
        onManage={() => undefined}
        onOpenTrash={() => undefined}
      />
    )

    expect(markup).toContain('Lighting discussion')
    expect(markup).toContain('新建会话')
    expect(markup).toContain('管理全部会话')
    expect(markup).toContain('会话回收站')
    expect(markup).toContain('3')
  })
})
