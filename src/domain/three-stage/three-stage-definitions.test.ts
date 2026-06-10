import { describe, expect, test } from 'vitest'
import { buildThreeStageOutput, getStageDefinition, getStageFixedContent, normalizeFixedContentOverrides } from './three-stage-definitions'

describe('three-stage definitions', () => {
  test('builds object identity board output from fixed copy and the optional object note', () => {
    const output = buildThreeStageOutput('object', {
      objectNotes: '打开状态展示内部接口，保持黄铜与深色皮革材质。'
    })

    expect(getStageDefinition('object').fields.map(field => field.id)).toEqual(['objectNotes'])
    expect(output).toContain('创建一张艺术性的 16:9 物品设定身份板。')
    expect(output).toContain('[主体]：使用参考图像中的物品。')
    expect(output).toContain('物品设定批注：\n【打开状态展示内部接口，保持黄铜与深色皮革材质。】')
    expect(output).toContain('固定批注：\n只做多角度参考，不要直接整体作为画面主体物。')
    expect(output).toContain('不要添加任何文字。')
    expect(output).not.toContain('角色身份板')
  })

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
    expect(definition.fields.find(field => field.id === 'storyMotion')?.label).toBe('故事节奏')
    expect(definition.fields.filter(field => field.presetType === 'camera').map(field => field.id)).toEqual(['cameraStyle'])
    expect(definition.fields.find(field => field.id === 'shotRanges')?.kind).toBe('shotRanges')
  })

  test('exposes camera preset fields for the video prompt stage', () => {
    const definition = getStageDefinition('videoPrompt')

    expect(definition.fields.filter(field => field.presetType === 'camera').map(field => field.id)).toEqual([
      'shotKeywords',
      'finalShot'
    ])
    expect(definition.fields.find(field => field.id === 'shotKeywords')?.kind).toBe('shotRanges')
  })

  test('builds video prompt output with fixed stage-three fields', () => {
    const output = buildThreeStageOutput('videoPrompt', {
      storyboardRef: '用户误填内容',
      shotOrder: '用户误填镜头顺序',
      duration: '用户误填时长',
      identityLock: '用户误填身份锁定',
      shotKeywords: '追逐，滚动，回望'
    })

    expect(output).toContain('使用故事板参考 @[STORYBOARD REF] 作为 15 秒视频的完整视觉和情感叙事来源。')
    expect(output).toContain('从左到右、从上到下依次遵循所有 12 个节拍。')
    expect(output).toContain('将完整的 12 节拍序列压缩到 15 秒内。')
    expect(output).toContain('保持角色参考相同的绝对核心主体身份')
    expect(output).toContain('镜头提示词【1-4】：【追逐，滚动，回望】')
    expect(output).not.toContain('用户误填')
  })

  test('applies per-form fixed content overrides without changing the default definition', () => {
    const defaultFixed = getStageFixedContent('videoPrompt').duration
    const overridden = buildThreeStageOutput('videoPrompt', {}, undefined, {
      duration: { value: 'Custom node duration', unlocked: false }
    })
    const defaultOutput = buildThreeStageOutput('videoPrompt', {})

    expect(overridden).toContain('Custom node duration')
    expect(overridden).not.toContain(defaultFixed)
    expect(defaultOutput).toContain(defaultFixed)
    expect(getStageFixedContent('videoPrompt').duration).toBe(defaultFixed)
  })

  test('applies layout locked-block overrides to final output', () => {
    const defaultFixed = getStageFixedContent('storyboard')['storyboard-annotation']
    const overridden = buildThreeStageOutput('storyboard', {}, undefined, {
      'storyboard-annotation': { value: 'Custom annotation', unlocked: true }
    })

    expect(overridden).toContain('Custom annotation')
    expect(overridden).not.toContain(defaultFixed)
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

  test('injects storyboard output and optional audio constraints into video prompt output', () => {
    const project = {
      character: { fields: {}, updatedAt: 1, meta: {} },
      storyboard: {
        fields: {
          theme: '松鼠追逐主题',
          storyMotion: '松鼠跨越现代与未来',
          cameraStyle: '手持跟拍',
          shotRanges: JSON.stringify([{ id: 'range-1-4', start: 1, end: 4, content: '松鼠从树尖冲入画面' }])
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

    expect(output).toContain('故事版内容注入：')
    expect(output).toContain('主题：【松鼠追逐主题】')
    expect(output).toContain('故事节奏：【松鼠跨越现代与未来】')
    expect(output).not.toContain('手持跟拍')
    expect(output).not.toContain('镜头格【1-4】：【松鼠从树尖冲入画面】')
    expect(output).not.toContain('使用颜色标注系统')
    expect(output).toContain('只保留物理音效，不要背景BGM音乐。')
    expect(output).toContain('不要人声对话。')
    expect(output).not.toContain('首帧：')
  })

  test('injects first and last frame placeholders only when enabled', () => {
    const defaultOutput = buildThreeStageOutput('videoPrompt', {})
    const enabledOutput = buildThreeStageOutput('videoPrompt', {
      needsFirstLastFrame: 'true'
    })

    expect(defaultOutput).not.toContain('首帧：')
    expect(defaultOutput).not.toContain('尾帧：')
    expect(enabledOutput).toContain('首帧：')
    expect(enabledOutput).toContain('尾帧：')
  })
})
