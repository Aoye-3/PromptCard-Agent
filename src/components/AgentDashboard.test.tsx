import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentDashboard } from './AgentDashboard'

vi.mock('@/stores/agent.store', () => ({
  useAgentStore: vi.fn(() => ({
    runtimeStatus: 'connected',
    authStatus: 'authenticated',
    runtimeError: null,
    user: { email: 'tester@example.com' },
    models: [],
    skills: [],
    tools: [],
    builtinTools: [],
    subagentEnabled: false,
    getAgentSession: () => ({ messages: [], running: false, proposals: [], threadId: null }),
    modelConfig: null,
    checkRuntime: vi.fn(),
    sendMessage: vi.fn(),
    clearMessages: vi.fn()
  }))
}))

vi.mock('@/stores/preset.store', () => ({
  usePresetStore: vi.fn(() => ({ presets: [], initialized: true, init: vi.fn() }))
}))

describe('AgentDashboard model navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('offers separate text and image model destinations without a default-model destination', () => {
    const markup = renderToStaticMarkup(<AgentDashboard />)

    expect(markup).toContain('文字模型')
    expect(markup).toContain('图片生成模型')
    expect(markup).not.toContain('>默认模型<')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('aria-pressed="true"')
  })
})
