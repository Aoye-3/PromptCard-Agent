import type { IThreeStageProject, ThreeStageKey } from '@/models/PromptHistory.model'

export type FieldDefinition = {
  id: string
  label: string
  placeholder: string
  fixedValue?: string
  rows?: number
  presetType?: 'camera'
  kind?: 'textarea' | 'shotRanges' | 'toggle'
  toggleDefault?: boolean
  toggleLabels?: {
    on: string
    off: string
  }
}

export type StoryboardShotRange = {
  id: string
  start: number
  end: number
  content: string
}

export type StageDefinition = {
  key: ThreeStageKey
  title: string
  description: string
  fields: FieldDefinition[]
  layout?: StageLayoutItem[]
  buildOutput: (
    fields: Record<string, string>,
    project?: IThreeStageProject,
    fixedContent?: Record<string, string>
  ) => string
}

export type StageLayoutItem =
  | { type: 'locked'; id: string; text: string }
  | { type: 'field'; fieldId: string }

export type FixedContentOverrides = Record<string, { value: string; unlocked?: boolean }>

export const valueOf = (fields: Record<string, string>, key: string) => fields[key]?.trim() || ''

export const toggleAllows = (fields: Record<string, string>, key: string) => fields[key] !== 'false'
export const toggleEnabled = (fields: Record<string, string>, key: string, defaultValue = true) =>
  fields[key] ? fields[key] !== 'false' : defaultValue

export const bracketValue = (fields: Record<string, string>, key: string, fallback = '') =>
  `【${valueOf(fields, key) || fallback}】`

export const joinBlocks = (blocks: Array<string | false | undefined>) =>
  blocks.filter(Boolean).join('\n\n').trim()

const clampShotNumber = (value: unknown, fallback: number): number => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(12, Math.max(1, Math.floor(number)))
}

export const createStoryboardShotRange = (index = Date.now()): StoryboardShotRange => ({
  id: `shot-range-${index}`,
  start: 1,
  end: 4,
  content: ''
})

export const parseStoryboardShotRanges = (fields: Record<string, string>, fieldId = 'shotRanges'): StoryboardShotRange[] => {
  try {
    const parsed = JSON.parse(fields[fieldId] || '[]') as Partial<StoryboardShotRange>[]
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((range, index) => ({
        id: typeof range.id === 'string' && range.id ? range.id : `shot-range-${index + 1}`,
        start: clampShotNumber(range.start, 1),
        end: clampShotNumber(range.end, 4),
        content: typeof range.content === 'string' ? range.content : ''
      }))
    }
  } catch {
    // Fall through to legacy migration/default.
  }

  if (fieldId !== 'shotRanges' && fields[fieldId]?.trim()) {
    return [{ ...createStoryboardShotRange(1), content: fields[fieldId] }]
  }

  const legacyRanges = [
    { id: 'legacy-1-4', start: 1, end: 4, content: fields.narrativeOneToFour || '' },
    { id: 'legacy-5-8', start: 5, end: 8, content: fields.narrativeFiveToEight || '' },
    { id: 'legacy-8-12', start: 8, end: 12, content: fields.narrativeEightToTwelve || '' }
  ].filter(range => range.content.trim())

  return legacyRanges.length > 0 ? legacyRanges : [createStoryboardShotRange(1)]
}

export const stringifyStoryboardShotRanges = (ranges: StoryboardShotRange[]): string =>
  JSON.stringify(ranges)

export const buildStoryboardShotRangeOutput = (fields: Record<string, string>, fieldId = 'shotRanges', label = '镜头格', fallback = '这里填写镜头叙事，一个大概的剧情'): string => {
  const ranges = parseStoryboardShotRanges(fields, fieldId)
  return ranges
    .map(range => `${label}【${range.start}-${range.end}】：【${range.content.trim() || fallback}】`)
    .join('\n')
}

export const buildStoryboardInjectionForVideo = (fields: Record<string, string>): string => {
  return joinBlocks([
    valueOf(fields, 'theme') && `主题：${bracketValue(fields, 'theme')}`,
    valueOf(fields, 'storyMotion') && `故事节奏：${bracketValue(fields, 'storyMotion')}`
  ])
}

const objectBoardReference = `创建一张艺术性的 16:9 物品设定身份板。

[主体]：使用参考图像中的物品。`

const objectBoardFixedBody = `纯白色 / 柔和米白色背景。
无环境、无道具、无标志、无水印。
画面中不要出现任何文字、标题、标签、编号、箭头说明或可读批注。

固定批注：
只做多角度参考，不要直接整体作为画面主体物。

设计方向：
不要创建标准的产品目录图。
创建一张电影级的物品设定板，
感觉像高端动画工作室的道具研究与艺术书布局的结合。

布局应不对称、优雅且视觉上令人难忘。
使用大片留白、多样化图像比例和有意的不平衡。
避免网格、蓝图设计、商品展示页、说明书布局和重复的机械转场展示。

重要布局规则：
不要将任何物品视角垂直堆叠成列表。
每个视角必须有清晰的分离和呼吸空间。
保持整体、轮廓、结构、材质和细节研究的视觉区分。
无严重裁切、无遮挡关键结构、无堆叠物品、无合并角度。
不要让整张设定板看起来像一个单一场景中的主体物。

主要构图：
放置一个大型英雄视角的物品展示；
略微偏离中心作为视觉锚点。
该视角应完整、清晰、优雅，但不要像商业主视觉海报一样占据全部注意力。

围绕它，以干净的间距排列较小的辅助研究：
正面视角、背面视角、侧面视角、俯视角、仰视角、
三分之四视角、倾斜角度、局部结构角度、比例感研究、
使用状态参考、打开 / 闭合状态参考、静置状态参考。

每个视角应感觉像独立的干净物品研究，
而不是来自同一个场景的连续帧。

身份锁定：
在所有视角中保持严格的物品一致性：
相同造型语言、相同比例、相同结构、相同材质、
相同颜色关系、相同磨损程度、相同设计细节、相同视觉个性。

有用参考细节：
清晰的整体轮廓、清晰的结构分层、清晰的材质边界、
清晰的连接处、边缘、把手、开口、装饰件、功能部件。
强调物品的形状语言、比例节奏、材质对比和关键识别特征。

艺术性部分：
包含一个小轮廓研究区域，带有 2-3 个简化的黑色物品轮廓。
包含一个小结构变化研究区域，展示轻微角度或状态变化。
包含几个微小细节特写，展示表面材质、边缘、纹理、接口、装饰和关键视觉特征。

文本设计：
不要添加任何文字。
不要添加名称、说明、编号、标签、标题或手写风格标注。
不要出现任何可读字符、符号化注释或图形化说明文字。
允许极少量非文字性的细微编辑线条或构图引导，但必须抽象、简约、不可读，并且不影响物品参考清晰度。

整体感觉：
简约、电影感、高端、艺术书式、干净、富有设计感、适用于制作。

最终图像应像一张艺术性的物品设定身份板，
旨在帮助 AI 模型理解物品的轮廓、比例、结构、材质、角度、状态和关键细节，
而不是把整张图直接当作最终画面主体物。`

export const stageDefinitions: StageDefinition[] = [
  {
    key: 'character',
    title: '人物版制作',
    description: '角色身份板、视觉研究和艺术布局。',
    fields: [
      {
        id: 'characterNotes',
        label: '角色设定注释',
        placeholder: '例如：性格、喜好、剧情倾向、人物关系、隐藏动机等',
        rows: 4
      }
    ],
    layout: [
      {
        type: 'locked',
        id: 'character-reference',
        text: `创建一张艺术性的 16:9 角色身份板。

[主体]：使用参考图像。`
      },
      { type: 'field', fieldId: 'characterNotes' },
      {
        type: 'locked',
        id: 'character-fixed-body',
        text: `纯白色 / 柔和米白色背景。
无环境、无道具、无标志、无水印。

设计方向：
不要创建标准的角色参考表。
创建一张电影级的身份板，
感觉像高端动画工作室的角色研究与艺术布布局的结合。

布局应不对称、优雅且视觉上令人难忘。
使用大片留白、多样化图像比例和有意的不平衡。
避免网格、蓝图设计、目录布局和重复的转场展示。

重要布局规则：
不要垂直任何角色图像。
每个视角必须有清晰的分离和呼吸空间。
保持所有身体、肖像、轮廓和细节研究的视觉区分。
无裁剪面部、无隐藏肢体、无堆叠人物、无合并姿势。

主要构图：
放置一个大型英雄全身视角；
略微偏离中心作为视觉锚点。

围绕它，以干净的间距排列较小的辅助研究：
中性全身视角、背面视角、侧面视角、坐姿、倾斜姿势、
蹲姿、俯视身体角度、仰视身体角度、富有表现力的肖像研究。

每个视角应感觉像独立的干净角色研究，
而不是来自同一个场景的帧。

身份锁定：
在所有视角中保持严格的身份一致性：
相同面部、相同面部比例、相同发型、相同服装、
相同身体比例、相同姿势语言、相同视觉个性。

有用参考细节：
清晰的面部形状、清晰的发型轮廓、清晰的服装轮廓、
清晰的身体形状、清晰的手部、清晰的姿势、清晰的表情范围。

艺术性部分：
包含一个小轮廓研究区域，带有 2-3 个简化的黑色角色轮廓。
包含一个小表情研究区域，带有细微的情感变化。
包含几个微小细节特写，展示面部、头发和服装的关键视觉特征。

文本设计：
添加一个时尚的角色 ID 块。保持简约、大胆且艺术导向。
仅使用：
名称角色核心情绪视觉标志。
仅在有帮助的地方使用小型手写风格标签。
允许使用细微的编辑箭头和标注，但保持简约和优雅。

整体感觉：
简约、电影感、高端、艺术书式、干净、富有表现力、适用于制作。

最终图像应像一张艺术性的角色身份板，
旨在帮助 AI 模型理解角色的面部、轮廓、服装、姿势和情感范围。`
      }
    ],
    buildOutput: (fields, _project, fixedContent) => joinBlocks([
      fixedContentValue('character', 'character-reference', fixedContent),
      valueOf(fields, 'characterNotes') && `角色设定注释：\n${bracketValue(fields, 'characterNotes')}`,
      fixedContentValue('character', 'character-fixed-body', fixedContent)
    ])
  },
  {
    key: 'object',
    title: '物品版制作',
    description: '物品设定身份板、结构研究和艺术书式布局。',
    fields: [
      {
        id: 'objectNotes',
        label: '物品设定批注',
        placeholder: '例如：用途、状态变化、材质、磨损程度、关键结构等',
        rows: 4
      }
    ],
    layout: [
      { type: 'locked', id: 'object-reference', text: objectBoardReference },
      { type: 'field', fieldId: 'objectNotes' },
      { type: 'locked', id: 'object-fixed-body', text: objectBoardFixedBody }
    ],
    buildOutput: (fields, _project, fixedContent) => joinBlocks([
      fixedContentValue('object', 'object-reference', fixedContent),
      valueOf(fields, 'objectNotes') && `物品设定批注：\n${bracketValue(fields, 'objectNotes')}`,
      fixedContentValue('object', 'object-fixed-body', fixedContent)
    ])
  },
  {
    key: 'storyboard',
    title: '故事版制作',
    description: '故事板表格、运动提示和环境限制。',
    fields: [
      {
        id: 'theme',
        label: '主题',
        placeholder: '为故事板创建的主题',
        rows: 2
      },
      {
        id: 'storyMotion',
        label: '故事节奏',
        placeholder: '例如：专注于角色穿行、回望、推进、环绕和情绪转折',
        rows: 3
      },
      {
        id: 'panelMustContain',
        label: '每个面板必须包含',
        placeholder: '例如：人物动作、情绪变化、镜头运动或环境反应',
        rows: 2
      },
      {
        id: 'avoid',
        label: '避免',
        placeholder: '例如：静态摆拍、重复构图、过度解释',
        rows: 2
      },
      {
        id: 'performerFeeling',
        label: '表演者感觉',
        placeholder: '例如：紧张、被追赶、逐渐坚定',
        rows: 2
      },
      {
        id: 'cameraStyle',
        label: '摄影方式',
        placeholder: '接入 Prompt 库，在其中挑选镜头',
        rows: 3,
        presetType: 'camera'
      },
      {
        id: 'environmentKeep',
        label: '环境保持',
        placeholder: '注意田地禾苗的生长、人物位置、场景变化等连续性要求',
        rows: 5
      },
      {
        id: 'shotRanges',
        label: '镜头格',
        placeholder: '这里填写镜头叙事，一个大概的剧情',
        kind: 'shotRanges'
      }
    ],
    layout: [
      { type: 'locked', id: 'storyboard-open', text: '为故事板创建一个' },
      { type: 'field', fieldId: 'theme' },
      { type: 'locked', id: 'storyboard-focus', text: '专注于' },
      { type: 'field', fieldId: 'storyMotion' },
      {
        type: 'locked',
        id: 'storyboard-fixed-setup',
        text: `使用参考图像作为角色。

创建一张 16:9 故事板表格，包含 12 个电影风格面板。

实际故事板绘图必须仅为黑白：
粗糙铅笔线条、最小细节、快速手绘能量、简单解剖结构、强烈轮廓可读性。

保持艺术作品轻量、动态、未完成，像早期剪辑预览。

请按照镜头叙事和摄影方式设计镜头格。`
      },
      { type: 'field', fieldId: 'panelMustContain' },
      { type: 'field', fieldId: 'avoid' },
      { type: 'field', fieldId: 'performerFeeling' },
      { type: 'field', fieldId: 'cameraStyle' },
      { type: 'field', fieldId: 'environmentKeep' },
      { type: 'field', fieldId: 'shotRanges' },
      {
        type: 'locked',
        id: 'storyboard-annotation',
        text: `使用颜色标注系统：
红色箭头 = 身体运动
蓝色箭头 = 摄影机运动
绿色标记 = 取景 / 构图笔记
橙色标记 = 灯光方向
紫色标记 = 声音 / 情感强调
黑色文本 = 简短镜头笔记和面板标签

无时间戳。`
      }
    ],
    buildOutput: (fields, _project, fixedContent) => joinBlocks([
      `${fixedContentValue('storyboard', 'storyboard-open', fixedContent)} ${bracketValue(fields, 'theme')}
${fixedContentValue('storyboard', 'storyboard-focus', fixedContent)} ${bracketValue(fields, 'storyMotion')}`,
      fixedContentValue('storyboard', 'storyboard-fixed-setup', fixedContent),
      `每个面板必须包含 ${bracketValue(fields, 'panelMustContain')}，避免 ${bracketValue(fields, 'avoid')}。表演者应该是 ${bracketValue(fields, 'performerFeeling')} 感觉。`,
      `摄影方式：
${bracketValue(fields, 'cameraStyle', '接入Prompt库，在其中挑选镜头')}`,
      `环境保持：
${bracketValue(fields, 'environmentKeep')}`,
      `镜头叙事：
${buildStoryboardShotRangeOutput(fields)}`,
      fixedContentValue('storyboard', 'storyboard-annotation', fixedContent)
    ])
  },
  {
    key: 'videoPrompt',
    title: '视频生成提示词制作',
    description: '把故事板压缩成视频生成提示词。',
    fields: [
      {
        id: 'storyboardRef',
        label: 'Storyboard Ref',
        placeholder: '使用故事板参考 @[STORYBOARD REF] 作为 15 秒视频的完整视觉和情感叙事来源。',
        fixedValue: '使用故事板参考 @[STORYBOARD REF] 作为 15 秒视频的完整视觉和情感叙事来源。',
        rows: 3
      },
      {
        id: 'shotOrder',
        label: '镜头顺序',
        placeholder: '从左到右、从上到下依次遵循所有 12 个节拍。不要重新诠释动作、构图、镜头角度或氛围。保留故事板的镜头顺序、动静反差、构图多样性和最终高潮风格。',
        fixedValue: '从左到右、从上到下依次遵循所有 12 个节拍。不要重新诠释动作、构图、镜头角度或氛围。保留故事板的镜头顺序、动静反差、构图多样性和最终高潮风格。',
        rows: 5
      },
      {
        id: 'duration',
        label: '压缩时长',
        placeholder: '将完整的 12 节拍序列压缩到 15 秒内。',
        fixedValue: '将完整的 12 节拍序列压缩到 15 秒内。',
        rows: 2
      },
      {
        id: 'actionSnapshot',
        label: '动作快照剪辑',
        placeholder: '每个节拍必须清晰呈现为充满节奏爆发力与掌控感的动作快照。使用具有视觉冲击力的硬切转场、凌厉动作匹配剪辑和微颤推进。',
        rows: 5
      },
      {
        id: 'identityLock',
        label: '角色身份锁定',
        placeholder: '保持角色参考相同的绝对核心主体身份：角色身份 / 服装 / 发型 / 道具 / 气质。不要改变角色外貌和身份。',
        fixedValue: '保持角色参考相同的绝对核心主体身份：角色身份 / 服装 / 发型 / 道具 / 气质。不要改变角色外貌和身份。',
        rows: 5
      },
      {
        id: 'actionKeywords',
        label: '动作关键词',
        placeholder: '[动作关键词]',
        rows: 2
      },
      {
        id: 'emotionKeywords',
        label: '情绪关键词',
        placeholder: '[情绪关键词]',
        rows: 2
      },
      {
        id: 'shotKeywords',
        label: '镜头关键词',
        placeholder: '这里填写每段镜头提示词，可从镜头 Prompt 库介入',
        presetType: 'camera',
        kind: 'shotRanges'
      },
      {
        id: 'environmentKeywords',
        label: '环境关键词',
        placeholder: '[环境关键词]',
        rows: 2
      },
      {
        id: 'finalShot',
        label: '最终镜头',
        placeholder: '在低角度仰拍、强烈光线或戏剧性构图下，角色完成一个极具仪式感 / 爆发力 / 信仰感的终极姿态。画面保持静谧但充满张力，呈现电影级收束。',
        rows: 5,
        presetType: 'camera'
      },
      {
        id: 'needsBackgroundBgm',
        label: '是否需要背景 BGM',
        placeholder: '需要背景 BGM',
        kind: 'toggle'
      },
      {
        id: 'needsVoiceDialogue',
        label: '是否需要人声对话',
        placeholder: '需要人声对话',
        kind: 'toggle'
      },
      {
        id: 'needsFirstLastFrame',
        label: '首尾帧控制',
        placeholder: '开启首尾帧控制',
        kind: 'toggle',
        toggleDefault: false,
        toggleLabels: {
          on: '开启',
          off: '关闭'
        }
      }
    ],
    buildOutput: (fields, project, fixedContent) => joinBlocks([
      fixedContentValue('videoPrompt', 'storyboardRef', fixedContent),
      fixedContentValue('videoPrompt', 'shotOrder', fixedContent),
      fixedContentValue('videoPrompt', 'duration', fixedContent),
      project?.storyboard && buildStoryboardInjectionForVideo(project.storyboard.fields) && `故事版内容注入：\n${buildStoryboardInjectionForVideo(project.storyboard.fields)}`,
      valueOf(fields, 'actionSnapshot'),
      fixedContentValue('videoPrompt', 'identityLock', fixedContent),
      valueOf(fields, 'actionKeywords'),
      valueOf(fields, 'emotionKeywords'),
      buildStoryboardShotRangeOutput(fields, 'shotKeywords', '镜头提示词', '这里填写每段镜头提示词'),
      valueOf(fields, 'environmentKeywords'),
      valueOf(fields, 'finalShot'),
      !toggleAllows(fields, 'needsBackgroundBgm') && '只保留物理音效，不要背景BGM音乐。',
      !toggleAllows(fields, 'needsVoiceDialogue') && '不要人声对话。',
      toggleEnabled(fields, 'needsFirstLastFrame', false) && `首帧：

尾帧：`
    ])
  }
]

export const stageByKey = Object.fromEntries(stageDefinitions.map(stage => [stage.key, stage])) as Record<ThreeStageKey, StageDefinition>


export const getStageDefinition = (stage: ThreeStageKey): StageDefinition => stageByKey[stage] || stageByKey.character

export const getStageFixedContent = (stage: ThreeStageKey): Record<string, string> => {
  const definition = getStageDefinition(stage)
  return Object.fromEntries([
    ...(definition.layout || [])
      .filter((item): item is Extract<StageLayoutItem, { type: 'locked' }> => item.type === 'locked')
      .map(item => [item.id, item.text]),
    ...definition.fields
      .filter(field => Boolean(field.fixedValue))
      .map(field => [field.id, field.fixedValue || ''])
  ])
}

export const normalizeFixedContentOverrides = (
  stage: ThreeStageKey,
  candidate: unknown
): FixedContentOverrides => {
  if (!candidate || typeof candidate !== 'object') return {}
  const validIds = new Set(Object.keys(getStageFixedContent(stage)))
  return Object.fromEntries(Object.entries(candidate as Record<string, unknown>).flatMap(([contentId, value]) => {
    if (!validIds.has(contentId) || !value || typeof value !== 'object') return []
    const override = value as Record<string, unknown>
    if (typeof override.value !== 'string') return []
    if (override.unlocked !== undefined && typeof override.unlocked !== 'boolean') return []
    return [[contentId, {
      value: override.value,
      ...(typeof override.unlocked === 'boolean' ? { unlocked: override.unlocked } : {})
    }]]
  }))
}

const fixedContentValue = (
  stage: ThreeStageKey,
  contentId: string,
  fixedContent?: Record<string, string>
): string => fixedContent?.[contentId] ?? getStageFixedContent(stage)[contentId] ?? ''

export const buildThreeStageOutput = (
  stage: ThreeStageKey,
  fields: Record<string, string>,
  project?: IThreeStageProject,
  fixedContent?: FixedContentOverrides
): string => {
  const overrides = normalizeFixedContentOverrides(stage, fixedContent)
  const resolvedFixedContent = Object.fromEntries(Object.entries(getStageFixedContent(stage)).map(([contentId, defaultValue]) => [
    contentId,
    overrides[contentId]?.value ?? defaultValue
  ]))
  return getStageDefinition(stage).buildOutput(fields, project, resolvedFixedContent)
}
