import { describe, expect, test } from 'vitest'
import { buildThreeStageOutput, getStageDefinition } from './three-stage-definitions'

describe('three-stage definitions', () => {
  test('builds character output from fixed copy and the optional character note', () => {
    const output = buildThreeStageOutput('character', {
      characterNotes: '性格安静但执拗，剧情倾向是守护家人'
    })

    expect(getStageDefinition('character').fields.map(field => field.id)).toEqual(['characterNotes'])
    expect(output).toContain('创建一张艺术性的 16:9 角色身份板。')
    expect(output).toContain('[主体]：使用参考图像。')
    expect(output).toContain('角色设定注释：\n【性格安静但执拗，剧情倾向是守护家人】')
    expect(output).toContain('身份锁定：')
    expect(output).toContain('最终图像应像一张艺术性的角色身份板')
  })

  test('builds storyboard output with bracket inputs inside fixed copy', () => {
    const output = buildThreeStageOutput('storyboard', {
      theme: '乡村追逐主题',
      storyMotion: '角色穿过禾苗，镜头缓慢推进',
      panelMustContain: '人物动作和摄影机运动',
      avoid: '静态站立',
      performerFeeling: '紧张但坚定',
      cameraStyle: '手持跟拍',
      shotRanges: JSON.stringify([
        { id: 'range-2-6', start: 2, end: 6, content: '女主进入田地' },
        { id: 'range-7-12', start: 7, end: 12, content: '母女在庙后重逢' }
      ]),
      environmentKeep: '禾苗高度保持一致'
    })

    expect(output).toContain('为故事板创建一个 【乡村追逐主题】')
    expect(output).toContain('专注于 【角色穿过禾苗，镜头缓慢推进】')
    expect(output).toContain('每个面板必须包含 【人物动作和摄影机运动】，避免 【静态站立】。表演者应该是 【紧张但坚定】 感觉。')
    expect(output).toContain('摄影方式：\n【手持跟拍】')
    expect(output).toContain('环境保持：\n【禾苗高度保持一致】')
    expect(output.indexOf('环境保持：')).toBeLessThan(output.indexOf('镜头叙事：'))
    expect(output).toContain('镜头格【2-6】：【女主进入田地】')
    expect(output).toContain('镜头格【7-12】：【母女在庙后重逢】')
    expect(output).toContain('红色箭头 = 身体运动')
    expect(output.endsWith('无时间戳。')).toBe(true)
  })

  test('only exposes bracket fields for the storyboard stage', () => {
    const definition = getStageDefinition('storyboard')

    expect(definition.fields.map(field => field.id)).toEqual([
      'theme',
      'storyMotion',
      'panelMustContain',
      'avoid',
      'performerFeeling',
      'cameraStyle',
      'environmentKeep',
      'shotRanges'
    ])
    expect(definition.fields.filter(field => field.presetType === 'camera').map(field => field.id)).toEqual(['cameraStyle'])
    expect(definition.fields.find(field => field.id === 'shotRanges')?.kind).toBe('shotRanges')
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
