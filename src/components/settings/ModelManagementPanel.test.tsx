import { renderToStaticMarkup } from 'react-dom/server'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { modelManagementClient } from '@/services/model-management-client'
import {
  INITIAL_MODEL_CREDENTIAL_DRAFT,
  ModelManagementPanel,
  ModelManagementPanelContent,
  assignmentDisabledReason,
  recordModelConnectionTestResult
} from './ModelManagementPanel'

const snapshot = {
  catalog: {
    providers: [
      { id: 'deepseek', displayName: 'DeepSeek', defaultApiBase: 'https://api.deepseek.com' },
      { id: 'volcengine-ark', displayName: '火山方舟', defaultApiBase: 'https://ark.cn-beijing.volces.com/api/v3' }
    ],
    models: [
      { id: 'deepseek-chat', providerId: 'deepseek', displayName: 'DeepSeek Chat', modality: 'chat' as const },
      {
        id: 'seedream',
        providerId: 'volcengine-ark',
        displayName: 'Seedream 5.0 Pro',
        modality: 'image' as const,
        capabilities: {
          modes: ['generate', 'edit', 'region-edit'],
          maxReferenceImages: 10,
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
      displayName: '文字连接',
      apiBase: 'https://api.deepseek.com',
      enabled: true,
      credentialConfigured: true,
      credentialMask: '********',
      lastTest: { ok: true, checkedAt: 1_720_000_000, message: '连接正常' },
      createdAt: 1,
      updatedAt: 2
    },
    {
      id: 'connection-image',
      providerId: 'volcengine-ark',
      displayName: '图片生成连接',
      apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
      enabled: true,
      credentialConfigured: true,
      credentialMask: '********',
      lastTest: { ok: true, checkedAt: 1_720_000_000, message: '连接正常' },
      createdAt: 1,
      updatedAt: 2
    }
  ],
  assignments: [
    { slot: 'chat.primary' as const, connectionId: 'connection-chat', modelId: 'deepseek-chat' },
    { slot: 'image.primary' as const, connectionId: 'connection-image', modelId: 'seedream' }
  ]
}

const imageStatus = {
  serverEnabled: true,
  checkedAt: 1_720_000_000,
  credentialStore: { available: true },
  providers: [{
    providerId: 'volcengine-ark',
    status: 'ready' as const,
    sdk: {
      packageName: 'volcengine-python-sdk[ark]',
      installedVersion: '5.0.36',
      requiredVersion: '5.0.36',
      compatible: true,
      error: null
    }
  }]
}

const actions = {
  onSelectConnection: vi.fn(),
  onCreateConnection: vi.fn(),
  onDraftChange: vi.fn(),
  onCredentialChange: vi.fn(),
  onSaveConnection: vi.fn(),
  onSaveAndTestConnection: vi.fn(),
  onCancelEdit: vi.fn(),
  onClearCredential: vi.fn(),
  onTestConnection: vi.fn(),
  onDeleteConnection: vi.fn(),
  onAssignmentChange: vi.fn(),
  onClearAssignment: vi.fn(),
  onReload: vi.fn(),
  onReloadImageStatus: vi.fn()
}

describe('ModelManagementPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    Object.values(actions).forEach(mock => mock.mockClear())
  })

  it('renders the graphical Ark SDK chain and image-only connections', () => {
    const markup = renderToStaticMarkup(
      <ModelManagementPanelContent
        modality="image"
        snapshot={snapshot}
        imageStatus={imageStatus}
        selectedConnectionId="connection-image"
        draft={{
          providerId: 'volcengine-ark',
          displayName: '图片生成连接',
          apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
          enabled: true
        }}
        credentialDraft=""
        busyAction={null}
        testResults={{}}
        error={null}
        actions={actions}
      />
    )

    expect(markup).toContain('图片生成模型')
    expect(markup).toContain('火山方舟')
    expect(markup).toContain('Ark SDK')
    expect(markup).toContain('图片生成连接')
    expect(markup).toContain('Seedream 5.0 Pro')
    expect(markup).toContain('默认图片模型')
    expect(markup).toContain('volcengine-python-sdk[ark]')
    expect(markup).toContain('重新检测')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toContain('文字连接')
    expect(markup).not.toContain('image.primary')
  })

  it('renders the official Ark API address as read-only and exposes all edit actions', () => {
    const markup = renderToStaticMarkup(
      <ModelManagementPanelContent
        modality="image"
        snapshot={snapshot}
        imageStatus={imageStatus}
        selectedConnectionId="connection-image"
        draft={{
          providerId: 'volcengine-ark',
          displayName: '图片生成连接',
          apiBase: 'https://ark.cn-beijing.volces.com/api/v3',
          enabled: true
        }}
        credentialDraft=""
        busyAction={null}
        testResults={{}}
        error={null}
        actions={actions}
      />
    )

    expect(markup).toMatch(/aria-label="API 地址"[^>]*readonly=""/)
    expect(markup).toContain('取消')
    expect(markup).toContain('仅保存')
    expect(markup).toContain('保存并测试')
    expect(markup).toContain('连接测试通过')
    expect(markup).toContain('上次检测')
  })

  it('explains every default-model gate in user-facing language', () => {
    const connection = snapshot.connections[1]
    const providerStatus = imageStatus.providers[0]

    expect(assignmentDisabledReason({ ...connection, enabled: false }, providerStatus)).toBe('连接已停用')
    expect(assignmentDisabledReason({ ...connection, credentialConfigured: false }, providerStatus)).toBe('尚未配置凭据')
    expect(assignmentDisabledReason({ ...connection, lastTest: undefined }, providerStatus)).toBe('请先测试连接')
    expect(assignmentDisabledReason({ ...connection, lastTest: { ...connection.lastTest!, ok: false } }, providerStatus)).toBe('最近一次连接测试未通过')
    expect(assignmentDisabledReason(connection, { ...providerStatus, status: 'incompatible', sdk: { ...providerStatus.sdk, compatible: false } })).toBe('Ark SDK 版本不兼容')
    expect(assignmentDisabledReason(connection, undefined, true)).toBe('正在检测 Ark SDK 状态')
    expect(assignmentDisabledReason(connection, { ...providerStatus, status: 'check_failed' }, true)).toBe('Ark SDK 检测失败')
    expect(assignmentDisabledReason(connection, providerStatus)).toBeNull()
  })

  it('does not delete when canvas dependencies cannot be confirmed', async () => {
    mockPanelLoad()
    const deleteConnection = vi.spyOn(modelManagementClient, 'deleteConnection').mockResolvedValue()
    vi.spyOn(modelManagementClient, 'getConnectionDependencies').mockResolvedValue({
      assignments: [],
      canvasNodeCount: null,
      canvasNodeCountAvailable: false
    })
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(<ModelManagementPanel modality="image" />)
    })

    await act(async () => {
      renderer!.root.findAllByType('button').find(button => button.children.includes('删除连接'))!.props.onClick()
    })

    expect(deleteConnection).not.toHaveBeenCalled()
    expect(renderer!.root.findByProps({ role: 'alert' }).children.join('')).toContain('无法确认画布引用')
  })

  it('clears the credential field after a successful save', async () => {
    mockPanelLoad()
    vi.spyOn(modelManagementClient, 'updateConnection').mockResolvedValue(snapshot.connections[1])
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(<ModelManagementPanel modality="image" />)
    })
    const credential = renderer!.root.findByProps({ type: 'password' })
    await act(async () => credential.props.onChange({ target: { value: 'secret-value' } }))

    await act(async () => {
      renderer!.root.findAllByType('button').find(button => button.children.includes('仅保存'))!.props.onClick()
    })

    expect(modelManagementClient.updateConnection).toHaveBeenCalledWith('connection-image', expect.objectContaining({ credential: 'secret-value' }))
    expect(renderer!.root.findByProps({ type: 'password' }).props.value).toBe('')
  })

  it('tests the saved connection when using save and test', async () => {
    mockPanelLoad()
    vi.spyOn(modelManagementClient, 'updateConnection').mockResolvedValue(snapshot.connections[1])
    const testConnection = vi.spyOn(modelManagementClient, 'testConnection').mockResolvedValue({ success: true, message: 'Connection ok.' })
    let renderer: ReactTestRenderer
    await act(async () => {
      renderer = create(<ModelManagementPanel modality="image" />)
    })

    await act(async () => {
      renderer!.root.findAllByType('button').find(button => button.children.includes('保存并测试'))!.props.onClick()
    })

    expect(testConnection).toHaveBeenCalledWith('connection-image')
  })

  it('clears the current assignment when selecting no default model', () => {
    const markupRenderer = create(
      <ModelManagementPanelContent
        modality="image"
        snapshot={snapshot}
        imageStatus={imageStatus}
        selectedConnectionId="connection-image"
        draft={{ providerId: 'volcengine-ark', displayName: '图片生成连接', apiBase: 'https://ark.cn-beijing.volces.com/api/v3', enabled: true }}
        credentialDraft=""
        busyAction={null}
        testResults={{}}
        error={null}
        actions={actions}
      />
    )

    const selects = markupRenderer.root.findAllByType('select')
    act(() => selects[selects.length - 1].props.onChange({ target: { value: '' } }))

    expect(actions.onClearAssignment).toHaveBeenCalledWith('image.primary')
  })

  it('starts every fresh panel mount with an empty credential draft', () => {
    expect(INITIAL_MODEL_CREDENTIAL_DRAFT).toBe('')
  })

  it('replaces a stale successful connection test when the next request fails', () => {
    expect(recordModelConnectionTestResult(
      { 'connection-image': { success: true, message: '连接正常' } },
      'connection-image',
      { success: false, message: '服务暂时不可用' }
    )).toEqual({ 'connection-image': { success: false, message: '服务暂时不可用' } })
  })
})

function mockPanelLoad() {
  vi.spyOn(modelManagementClient, 'getCatalog').mockResolvedValue(snapshot.catalog)
  vi.spyOn(modelManagementClient, 'listConnections').mockResolvedValue(snapshot.connections)
  vi.spyOn(modelManagementClient, 'listAssignments').mockResolvedValue([])
  vi.spyOn(modelManagementClient, 'getImageGenerationStatus').mockResolvedValue(imageStatus)
}
