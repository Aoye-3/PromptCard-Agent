import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  INITIAL_MODEL_CREDENTIAL_DRAFT,
  ModelManagementPanelContent,
  recordModelConnectionTestResult
} from './ModelManagementPanel'

const snapshot = {
  catalog: {
    providers: [
      { id: 'deepseek', displayName: 'DeepSeek', defaultApiBase: 'https://api.deepseek.com' },
      { id: 'volcengine-ark', displayName: 'Volcengine Ark', defaultApiBase: 'https://ark.example.com' }
    ],
    models: [
      { id: 'deepseek-chat', providerId: 'deepseek', displayName: 'DeepSeek Chat', modality: 'chat' as const },
      {
        id: 'seedream',
        providerId: 'volcengine-ark',
        displayName: 'Seedream',
        modality: 'image' as const,
        capabilities: {
          modes: ['generate', 'edit', 'region-edit'],
          maxReferenceImages: 10,
          mentionStrategy: 'ordered-image-labels',
          regionInputs: ['point', 'bbox'],
          resolutions: ['1K', '2K'],
          outputCount: 1,
          streaming: false
        }
      }
    ]
  },
  connections: [
    {
      id: 'connection-chat',
      providerId: 'deepseek',
      displayName: 'Primary chat',
      apiBase: 'https://api.deepseek.com',
      enabled: true,
      credentialConfigured: true,
      credentialMask: '••••••••',
      createdAt: 1,
      updatedAt: 2
    },
    {
      id: 'connection-image',
      providerId: 'volcengine-ark',
      displayName: 'Image generation',
      apiBase: 'https://ark.example.com',
      enabled: true,
      credentialConfigured: false,
      credentialMask: null,
      createdAt: 1,
      updatedAt: 2
    }
  ],
  assignments: [
    { slot: 'chat.primary' as const, connectionId: 'connection-chat', modelId: 'deepseek-chat' },
    { slot: 'image.primary' as const, connectionId: 'connection-image', modelId: 'seedream' }
  ]
}

const actions = {
  onSelectConnection: vi.fn(),
  onCreateConnection: vi.fn(),
  onDraftChange: vi.fn(),
  onCredentialChange: vi.fn(),
  onSaveConnection: vi.fn(),
  onClearCredential: vi.fn(),
  onTestConnection: vi.fn(),
  onDeleteConnection: vi.fn(),
  onAssignmentChange: vi.fn(),
  onReload: vi.fn()
}

describe('ModelManagementPanel', () => {
  it('renders provider-neutral connections, capabilities, credential state, tests, and both slots', () => {
    const markup = renderToStaticMarkup(
      <ModelManagementPanelContent
        snapshot={snapshot}
        selectedConnectionId="connection-chat"
        draft={{
          providerId: 'deepseek', displayName: 'Primary chat',
          apiBase: 'https://api.deepseek.com', enabled: true
        }}
        credentialDraft=""
        busyAction={null}
        testResults={{ 'connection-chat': { success: true, message: 'Connection ok.' } }}
        error={null}
        actions={actions}
      />
    )

    expect(markup).toContain('Primary chat')
    expect(markup).toContain('Volcengine Ark')
    expect(markup).toContain('generate / edit / region-edit')
    expect(markup).toContain('凭据已配置')
    expect(markup).toContain('凭据未配置')
    expect(markup).toContain('测试连接')
    expect(markup).toContain('Connection ok.')
    expect(markup).toContain('chat.primary')
    expect(markup).toContain('image.primary')
  })

  it('starts every fresh panel mount with an empty credential draft', () => {
    expect(INITIAL_MODEL_CREDENTIAL_DRAFT).toBe('')
  })

  it('replaces a stale successful connection test when the next request fails', () => {
    const testResults = recordModelConnectionTestResult(
      { 'connection-chat': { success: true, message: 'Connection ok.' } },
      'connection-chat',
      { success: false, message: '503 Service Unavailable' }
    )
    const markup = renderToStaticMarkup(
      <ModelManagementPanelContent
        snapshot={snapshot}
        selectedConnectionId="connection-chat"
        draft={{
          providerId: 'deepseek', displayName: 'Primary chat',
          apiBase: 'https://api.deepseek.com', enabled: true
        }}
        credentialDraft=""
        busyAction={null}
        testResults={testResults}
        error="503 Service Unavailable"
        actions={actions}
      />
    )

    expect(markup).toContain('503 Service Unavailable')
    expect(markup).not.toContain('Connection ok.')
  })
})
