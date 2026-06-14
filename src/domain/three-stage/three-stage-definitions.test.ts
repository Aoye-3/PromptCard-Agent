import { describe, expect, test } from 'vitest'
import {
  buildThreeStageOutput,
  getStageDefinition,
  getStageFixedContent,
  normalizeFixedContentOverrides,
  normalizeThreeStageTemplateSettings,
  parseStoryboardShotRanges,
  stringifyStoryboardShotRanges
} from './three-stage-definitions'

describe('three-stage definitions', () => {
  test('exposes the expected editable fields for each stage', () => {
    expect(getStageDefinition('character').fields.map(field => field.id)).toEqual(['characterNotes'])
    expect(getStageDefinition('object').fields.map(field => field.id)).toEqual(['objectNotes'])
    expect(getStageDefinition('storyboard').fields.map(field => field.id)).toEqual([
      'theme',
      'storyMotion',
      'panelMustContain',
      'avoid',
      'performerFeeling',
      'cameraStyle',
      'environmentKeep',
      'shotRanges'
    ])
    expect(getStageDefinition('videoPrompt').fields.filter(field => field.presetType === 'camera').map(field => field.id)).toEqual([
      'shotKeywords',
      'finalShot'
    ])
  })

  test('builds character and object outputs from fixed copy plus optional notes', () => {
    const character = buildThreeStageOutput('character', { characterNotes: 'CHARACTER_MARKER' })
    const object = buildThreeStageOutput('object', { objectNotes: 'OBJECT_MARKER' })

    expect(character).toContain('CHARACTER_MARKER')
    expect(character).toContain(getStageFixedContent('character')['character-reference'])
    expect(object).toContain('OBJECT_MARKER')
    expect(object).toContain(getStageFixedContent('object')['object-reference'])
    expect(object).not.toContain('CHARACTER_MARKER')
  })

  test('builds storyboard output with sparse fields and shot range content', () => {
    const output = buildThreeStageOutput('storyboard', {
      theme: 'THEME_MARKER',
      storyMotion: 'MOTION_MARKER',
      panelMustContain: 'MUST_MARKER',
      avoid: 'AVOID_MARKER',
      performerFeeling: 'FEELING_MARKER',
      cameraStyle: 'CAMERA_MARKER',
      environmentKeep: 'ENV_MARKER',
      shotRanges: JSON.stringify([
        { id: 'range-1-4', start: 1, end: 4, content: 'SHOT_RANGE_MARKER' }
      ])
    })

    for (const marker of [
      'THEME_MARKER',
      'MOTION_MARKER',
      'MUST_MARKER',
      'AVOID_MARKER',
      'FEELING_MARKER',
      'CAMERA_MARKER',
      'ENV_MARKER',
      'SHOT_RANGE_MARKER'
    ]) {
      expect(output).toContain(marker)
    }
    expect(output).toContain(getStageFixedContent('storyboard')['storyboard-annotation'])
  })

  test('builds video prompt output with fixed fields and the default negative prompt', () => {
    const output = buildThreeStageOutput('videoPrompt', {
      storyboardRef: 'USER_FIXED_STORYBOARD_REF',
      shotOrder: 'USER_FIXED_SHOT_ORDER',
      duration: 'USER_FIXED_DURATION',
      identityLock: 'USER_FIXED_IDENTITY',
      shotKeywords: JSON.stringify([{ id: 'range-1-4', start: 1, end: 4, content: 'SHOT_KEYWORD_MARKER' }])
    })

    expect(output).toContain(getStageFixedContent('videoPrompt').storyboardRef)
    expect(output).toContain(getStageFixedContent('videoPrompt').shotOrder)
    expect(output).toContain(getStageFixedContent('videoPrompt').duration)
    expect(output).toContain(getStageFixedContent('videoPrompt').identityLock)
    expect(output).toContain('分镜头版的标注只做参考，不要出现任何文字，箭头和镜头号！')
    expect(output).toContain('SHOT_KEYWORD_MARKER')
    expect(output).not.toContain('USER_FIXED_')
  })

  test('maps legacy video prompt shot content into the first shot slot', () => {
    const ranges = parseStoryboardShotRanges({
      shotKeywords: JSON.stringify([{ id: 'range-1-3', start: 1, end: 3, content: 'LEGACY_SHOT_CONTENT' }])
    }, 'shotKeywords')

    expect(ranges[0].shots?.[1]).toBe('LEGACY_SHOT_CONTENT')
  })

  test('builds video prompt shot keywords as individual shot slots', () => {
    const output = buildThreeStageOutput('videoPrompt', {
      shotKeywords: stringifyStoryboardShotRanges([{
        id: 'range-1-3',
        start: 1,
        end: 3,
        content: 'legacy copy should not be used',
        shots: {
          1: 'SHOT_ONE_MARKER',
          2: 'SHOT_TWO_MARKER',
          3: 'SHOT_THREE_MARKER',
          4: 'OUT_OF_RANGE_MARKER'
        }
      }])
    })

    expect(output).toContain('镜头提示词【1-3】：')
    expect(output).toContain('时间：X-XS。')
    expect(output).toContain('镜头1@SHOT_ONE_MARKER')
    expect(output).toContain('镜头2@SHOT_TWO_MARKER')
    expect(output).toContain('镜头3@SHOT_THREE_MARKER')
    expect(output).not.toContain('OUT_OF_RANGE_MARKER')
    expect(output).not.toContain('legacy copy should not be used')
  })

  test('uses template snapshot defaults below per-node overrides and above built-in defaults', () => {
    const defaultFixed = getStageFixedContent('videoPrompt').negativePrompt
    const fromTemplate = buildThreeStageOutput('videoPrompt', {}, undefined, undefined, {
      negativePrompt: 'Template negative prompt'
    })
    const fromNode = buildThreeStageOutput('videoPrompt', {}, undefined, {
      negativePrompt: { value: 'Node negative prompt', unlocked: true }
    }, {
      negativePrompt: 'Template negative prompt'
    })

    expect(fromTemplate).toContain('Template negative prompt')
    expect(fromTemplate).not.toContain(defaultFixed)
    expect(fromNode).toContain('Node negative prompt')
    expect(fromNode).not.toContain('Template negative prompt')
  })

  test('applies every fixed block exposed by each stage to final output', () => {
    for (const stage of ['character', 'object', 'storyboard', 'videoPrompt'] as const) {
      for (const contentId of Object.keys(getStageFixedContent(stage))) {
        const marker = `override:${stage}:${contentId}`
        const output = buildThreeStageOutput(stage, {}, undefined, {
          [contentId]: { value: marker, unlocked: false }
        })
        expect(output, `${stage}:${contentId}`).toContain(marker)
      }
    }
  })

  test('ignores malformed and unknown persisted fixed content overrides', () => {
    const overrides = normalizeFixedContentOverrides('character', {
      'character-reference': { value: 42, unlocked: 'yes' },
      unknown: { value: 'must not appear', unlocked: true }
    })
    const output = buildThreeStageOutput('character', {}, undefined, overrides)

    expect(overrides).toEqual({})
    expect(output).not.toContain('undefined')
    expect(output).not.toContain('must not appear')
  })

  test('does not inject storyboard output into video prompt output', () => {
    const project = {
      character: { fields: {}, updatedAt: 1, meta: {} },
      storyboard: {
        fields: {
          theme: 'STORYBOARD_THEME_MARKER',
          storyMotion: 'STORYBOARD_MOTION_MARKER'
        },
        updatedAt: 1,
        meta: {}
      },
      videoPrompt: { fields: {}, updatedAt: 1, meta: {} },
      selectedStage: 'videoPrompt' as const,
      selectedFieldId: 'actionSnapshot',
      meta: {}
    }

    const output = buildThreeStageOutput('videoPrompt', {
      needsBackgroundBgm: 'false',
      needsVoiceDialogue: 'false'
    }, project)

    expect(output).not.toContain('STORYBOARD_THEME_MARKER')
    expect(output).not.toContain('STORYBOARD_MOTION_MARKER')
    expect(output).toContain(getStageFixedContent('videoPrompt').negativePrompt)
    expect(output).not.toContain('首帧')
  })

  test('injects first and last frame placeholders only when enabled', () => {
    const defaultOutput = buildThreeStageOutput('videoPrompt', {})
    const enabledOutput = buildThreeStageOutput('videoPrompt', {
      needsFirstLastFrame: 'true'
    })

    expect(defaultOutput).not.toContain('首帧')
    expect(defaultOutput).not.toContain('尾帧')
    expect(enabledOutput).toContain('首帧')
    expect(enabledOutput).toContain('尾帧')
  })

  test('normalizes template settings for the editable three-stage templates only', () => {
    const settings = normalizeThreeStageTemplateSettings({
      character: { 'character-reference': 'Custom character reference', unknown: 'ignored' },
      storyboard: { 'storyboard-open': 'Custom storyboard open' },
      videoPrompt: { negativePrompt: 'Custom negative prompt' },
      object: { 'object-reference': 'ignored object template' }
    })

    expect(settings.character).toEqual({ 'character-reference': 'Custom character reference' })
    expect(settings.storyboard).toEqual({ 'storyboard-open': 'Custom storyboard open' })
    expect(settings.videoPrompt).toEqual({ negativePrompt: 'Custom negative prompt' })
    expect(settings).not.toHaveProperty('object')
  })
})
