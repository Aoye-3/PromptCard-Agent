import { describe, expect, it } from 'vitest'
import type { RecentCaptureItemViewModel, RecentCaptureRole } from './media-types'
import { buildRecentCaptureRegistrationRequest, defaultPromptTypeForRole } from './recent-capture-registration'

const capture = (id: string, role: RecentCaptureRole, overrides: Partial<RecentCaptureItemViewModel> = {}): RecentCaptureItemViewModel => ({
  id,
  assetId: `asset-${id}`,
  kind: 'screenshot',
  status: 'recent',
  purpose: 'inspirationReference',
  role,
  title: `Title ${id}`,
  prompt: `Prompt ${id}`,
  userNote: '',
  sourcePlatform: 'Clipboard',
  sourceUrl: '',
  contentType: 'image/png',
  revision: 3,
  registeredPromptId: null,
  registeredAt: null,
  linkedProjectId: null,
  linkedCanvasNodeId: null,
  origin: { type: 'clipboard' },
  sizeLabel: '1 KB',
  dimensionsLabel: '100 x 100',
  capturedAtLabel: 'Today',
  ...overrides
})

describe('recent capture registration request', () => {
  it.each([
    ['character', 'subject'], ['prop', 'subject'], ['scene', 'scene'], ['composition', 'camera'],
    ['lighting', 'lighting'], ['color', 'style'], ['style', 'style'], ['mood', 'style'], ['other', 'custom']
  ] as const)('maps %s captures to %s prompts', (role, expected) => {
    expect(defaultPromptTypeForRole(role)).toBe(expected)
  })

  it('builds separate registrations with each capture revision and confirmed fields', () => {
    const captures = [capture('one', 'character'), capture('two', 'scene')]
    expect(buildRecentCaptureRegistrationRequest(captures, 'separate', [
      { label: 'Hero', content: 'A hero', type: 'subject' },
      { label: 'Station', content: 'A station', type: 'scene' }
    ])).toEqual({
      mode: 'separate',
      captures: [
        { id: 'one', revision: 3, label: 'Hero', content: 'A hero', type: 'subject' },
        { id: 'two', revision: 3, label: 'Station', content: 'A station', type: 'scene' }
      ]
    })
  })

  it('builds one merged registration and defaults mixed roles to custom', () => {
    const captures = [capture('one', 'character'), capture('two', 'lighting')]
    expect(buildRecentCaptureRegistrationRequest(captures, 'merged', [], {
      label: 'Reference group', content: 'Use both', type: 'custom'
    })).toEqual({
      mode: 'merged',
      captures: [{ id: 'one', revision: 3 }, { id: 'two', revision: 3 }],
      prompt: { label: 'Reference group', content: 'Use both', type: 'custom' }
    })
  })

  it('rejects blank prompt fields and already registered captures', () => {
    expect(() => buildRecentCaptureRegistrationRequest([capture('one', 'other')], 'separate', [
      { label: ' ', content: 'Prompt', type: 'custom' }
    ])).toThrow('名称和 Prompt 内容不能为空')
    expect(() => buildRecentCaptureRegistrationRequest([
      capture('one', 'other', { registeredPromptId: 'preset-existing' })
    ], 'merged', [], { label: 'One', content: 'Prompt', type: 'custom' })).toThrow('已经注册')
  })
})
