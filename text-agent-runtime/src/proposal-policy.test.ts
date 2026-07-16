import { describe, expect, it } from 'vitest'
import { buildInvocation } from './proposal-policy.ts'

describe('pi text-agent invocation boundary', () => {
  it('allows only the selected canvas text node as an update target', () => {
    const invocation = buildInvocation({
      content: '补全当前文字节点',
      permissionScope: 'workspace-chatbot-agent',
      workspaceContext: {
        contextId: 'free-canvas:project-1:text-1',
        mode: 'free-canvas-workspace',
        projectId: 'project-1',
        projectTitle: 'Project',
        snapshot: {
          selectedNodeId: 'text-1',
          selectedNode: { id: 'text-1', kind: 'text', userText: 'old' },
          nodes: [{ id: 'text-1', kind: 'text' }, { id: 'text-2', kind: 'text' }]
        }
      },
      promptLibrary: []
    })

    expect(invocation.policy.allowedProposalKinds).toEqual(['free_canvas_text_update'])
    expect(invocation.policy.selectedTextNodeId).toBe('text-1')
  })

  it('allows creating a text node when no text node is selected', () => {
    const invocation = buildInvocation({
      content: '基于提示词库写一个提示词',
      permissionScope: 'workspace-chatbot-agent',
      workspaceContext: {
        contextId: 'free-canvas:project-1:canvas',
        mode: 'free-canvas-workspace',
        projectId: 'project-1',
        projectTitle: 'Project',
        snapshot: {
          selectedNodeId: null,
          selectedNode: null,
          nodes: [{ id: 'image-1', kind: 'image' }]
        }
      },
      promptLibrary: [{ id: 'preset-1', label: '电影光', content: 'cinematic light' }]
    })

    expect(invocation.policy.allowedProposalKinds).toEqual(['free_canvas_text_create'])
    expect(invocation.policy.selectedTextNodeId).toBeNull()
  })

  it('includes exactly one explicitly selected image for media analysis', () => {
    const invocation = buildInvocation({
      content: '分析风格',
      permissionScope: 'media-analysis-agent',
      workspaceContext: null,
      promptLibrary: [],
      attachment: {
        assetId: 'asset-selected',
        contentType: 'image/png',
        data: 'base64-data'
      }
    })

    expect(invocation.attachments).toEqual([
      {
        assetId: 'asset-selected',
        mimeType: 'image/png',
        data: 'base64-data'
      }
    ])
  })
})
