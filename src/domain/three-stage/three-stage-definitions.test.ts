import { describe, expect, test } from 'vitest'
import { buildThreeStageOutput, getStageDefinition } from './three-stage-definitions'

describe('three-stage definitions', () => {
  test('builds character output from non-empty fields in definition order', () => {
    const output = buildThreeStageOutput('character', {
      finalGoal: 'final',
      characterIdentityBoard: 'identity',
      mainView: 'main view'
    })

    expect(output).toBe(['identity', 'main view', 'final'].join('\n\n'))
  })

  test('includes the storyboard fixed no-timeline block', () => {
    const output = buildThreeStageOutput('storyboard', {
      performanceTheme: 'performance',
      endingPose: 'ending'
    })

    expect(output).toContain('performance')
    expect(output).toContain('无时间戳。')
    expect(output.endsWith('ending')).toBe(true)
  })

  test('exposes camera preset fields for the video prompt stage', () => {
    const definition = getStageDefinition('videoPrompt')

    expect(definition.fields.filter(field => field.presetType === 'camera').map(field => field.id)).toEqual([
      'shotOrder',
      'shotKeywords',
      'finalShot'
    ])
  })
})
