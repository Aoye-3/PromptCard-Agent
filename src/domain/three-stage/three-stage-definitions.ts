import type { ThreeStageKey } from '@/models/PromptHistory.model'

export type FieldDefinition = {
  id: string
  label: string
  placeholder: string
  rows?: number
  presetType?: 'camera'
}

export type StageDefinition = {
  key: ThreeStageKey
  title: string
  description: string
  fields: FieldDefinition[]
  buildOutput: (fields: Record<string, string>) => string
}

export const valueOf = (fields: Record<string, string>, key: string) => fields[key]?.trim() || ''

export const joinBlocks = (blocks: Array<string | false | undefined>) =>
  blocks.filter(Boolean).join('\n\n').trim()

export const stageDefinitions: StageDefinition[] = [
  {
    key: 'character',
    title: '人物版制作',
    description: '角色身份板、视觉研究和艺术布局。',
    fields: [
      {
        id: 'characterIdentityBoard',
        label: '画幅与身份板',
        placeholder: '创建一张艺术性的 16:9 角色身份板。',
        rows: 2
      },
      {
        id: 'referenceImage',
        label: '参考图',
        placeholder: '[主体]：使用参考图像。',
        rows: 2
      },
      {
        id: 'backgroundRules',
        label: '背景要求',
        placeholder: '纯白色 / 柔和米白色背景。无环境、无道具、无标志、无水印。',
        rows: 3
      },
      {
        id: 'designDirection',
        label: '设计方向',
        placeholder: '不要创建标准的角色参考表。创建一张电影级的身份板，感觉像高端动画工作室的角色研究与艺术布布局的结合。',
        rows: 4
      },
      {
        id: 'mainView',
        label: '主要构图',
        placeholder: '放置一个大型英雄全身视角，略微偏离中心作为视觉锚点。',
        rows: 3
      },
      {
        id: 'supportViews',
        label: '辅助视角',
        placeholder: '围绕它，以干净的间距排列较小的辅助研究：中性全身视角、背面视角、侧面视角、坐姿、倾斜姿势、蹲姿、俯视身体角度、仰视身体角度，富有表现力的肖像研究。',
        rows: 5
      },
      {
        id: 'identityLock',
        label: '身份锁定',
        placeholder: '在所有视角中保持严格的身份一致性：相同面部、相同面部比例、相同发型、相同服装、相同身体比例、相同姿势语言、相同视觉个性。',
        rows: 5
      },
      {
        id: 'referenceDetails',
        label: '参考细节',
        placeholder: '清晰的面部形状、清晰的发型轮廓、清晰的服装轮廓、清晰的身体形状、清晰的手部、清晰的姿势、清晰的表情范围。',
        rows: 5
      },
      {
        id: 'artisticSection',
        label: '艺术性部分',
        placeholder: '包含一个小轮廓研究区域，带有 2-3 个简化的黑色角色轮廓。包含一个小表情研究区域，带有细微的情感变化。包含几个微小细节特写，展示面部、头发和服装的关键视觉特征。',
        rows: 5
      },
      {
        id: 'textDesign',
        label: '文本设计',
        placeholder: '添加一个时尚的角色 ID 块。保持简约、大胆且艺术导向。仅使用辅助的地方使用小型手写风格标签。允许使用细微的编辑箭头和标注，但保持简约和优雅。',
        rows: 5
      },
      {
        id: 'overallMood',
        label: '整体感觉',
        placeholder: '简约、电影感、高端、艺术书式、干净、富有表现力；适用于制作。',
        rows: 3
      },
      {
        id: 'finalGoal',
        label: '最终图像目标',
        placeholder: '最终图像应该像一张艺术性的角色身份板，旨在帮助 AI 模型理解角色的面部、轮廓、服装、姿势和情感范围。',
        rows: 4
      }
    ],
    buildOutput: (fields) => joinBlocks([
      valueOf(fields, 'characterIdentityBoard'),
      valueOf(fields, 'referenceImage'),
      valueOf(fields, 'backgroundRules'),
      valueOf(fields, 'designDirection'),
      valueOf(fields, 'mainView'),
      valueOf(fields, 'supportViews'),
      valueOf(fields, 'identityLock'),
      valueOf(fields, 'referenceDetails'),
      valueOf(fields, 'artisticSection'),
      valueOf(fields, 'textDesign'),
      valueOf(fields, 'overallMood'),
      valueOf(fields, 'finalGoal')
    ])
  },
  {
    key: 'storyboard',
    title: '故事版制作',
    description: '故事板表格、运动提示和环境限制。',
    fields: [
      {
        id: 'performanceTheme',
        label: '当代表演主题',
        placeholder: '为故事版创建一个原始的当代表演，专注于激烈的身体动作和现场演唱。使用参考图像作为角色。',
        rows: 4
      },
      {
        id: 'boardFormat',
        label: '故事板格式',
        placeholder: '创建一张 16:9 故事板表格，包含 12 个电影风格面板。',
        rows: 3
      },
      {
        id: 'drawingRules',
        label: '绘图规则',
        placeholder: '实际故事板绘图必须仅为黑白：粗糙铅笔线条、最小细节、快速手绘能量、简单解剖结构、强烈轮廓可读性。',
        rows: 5
      },
      {
        id: 'mainPerformance',
        label: '核心表演段落',
        placeholder: '一位孤独的女表演者在巨大的空旷空间中持续演唱，同时执行情感强烈的当代舞例程。',
        rows: 4
      },
      {
        id: 'visibleMotion',
        label: '可见运动',
        placeholder: '每个面板必须包含可见运动和强烈身体动量。',
        rows: 3,
        presetType: 'camera'
      },
      {
        id: 'avoidStatic',
        label: '避免静态',
        placeholder: '避免静态站立姿势。',
        rows: 2
      },
      {
        id: 'performerState',
        label: '表演者状态',
        placeholder: '表演者应感觉被困在仪式、疲惫和情感释放之间。',
        rows: 3
      },
      {
        id: 'cameraLanguage',
        label: '摄影方式',
        placeholder: '手持能量、快速平移、环绕运动、头顶镜头、侧面轮廓、侵略性特写、长焦压缩、极端负空间。',
        rows: 4,
        presetType: 'camera'
      },
      {
        id: 'environmentMinimal',
        label: '环境最小化',
        placeholder: '环境保持最小化：空旷空间、烟雾、织物运动、刺眼灯光束、湿地板反射。',
        rows: 4
      },
      {
        id: 'annotationSystem',
        label: '颜色标注系统',
        placeholder: '红色箭头 = 身体运动；蓝色箭头 = 摄影机运动；绿色标记 = 取景 / 构图笔记；橙色标记 = 灯光方向；紫色标记 = 声音 / 情感强调；黑色文本 = 简短镜头笔记和面板标签。',
        rows: 6
      },
      {
        id: 'endingPose',
        label: '最终姿态',
        placeholder: '以一个压倒性的最终运动姿势结束，在刺眼的孤立聚光灯下。',
        rows: 3
      }
    ],
    buildOutput: (fields) => joinBlocks([
      valueOf(fields, 'performanceTheme'),
      valueOf(fields, 'boardFormat'),
      valueOf(fields, 'drawingRules'),
      valueOf(fields, 'mainPerformance'),
      valueOf(fields, 'visibleMotion'),
      valueOf(fields, 'avoidStatic'),
      valueOf(fields, 'performerState'),
      valueOf(fields, 'cameraLanguage'),
      valueOf(fields, 'environmentMinimal'),
      valueOf(fields, 'annotationSystem'),
      '无时间戳。',
      valueOf(fields, 'endingPose')
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
        rows: 3
      },
      {
        id: 'shotOrder',
        label: '镜头顺序',
        placeholder: '从左到右、从上到下依次遵循所有 12 个节拍。不要重新诠释动作、构图、镜头角度或氛围。保留故事板的镜头顺序、动静反差、构图多样性和最终高潮风格。',
        rows: 5,
        presetType: 'camera'
      },
      {
        id: 'duration',
        label: '压缩时长',
        placeholder: '将完整的 12 节拍序列压缩到 15 秒内。',
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
        placeholder: '[镜头关键词]',
        rows: 2,
        presetType: 'camera'
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
      }
    ],
    buildOutput: (fields) => joinBlocks([
      valueOf(fields, 'storyboardRef'),
      valueOf(fields, 'shotOrder'),
      valueOf(fields, 'duration'),
      valueOf(fields, 'actionSnapshot'),
      valueOf(fields, 'identityLock'),
      valueOf(fields, 'actionKeywords'),
      valueOf(fields, 'emotionKeywords'),
      valueOf(fields, 'shotKeywords'),
      valueOf(fields, 'environmentKeywords'),
      valueOf(fields, 'finalShot')
    ])
  }
]

export const stageByKey = Object.fromEntries(stageDefinitions.map(stage => [stage.key, stage])) as Record<ThreeStageKey, StageDefinition>


export const getStageDefinition = (stage: ThreeStageKey): StageDefinition => stageByKey[stage] || stageByKey.character

export const buildThreeStageOutput = (stage: ThreeStageKey, fields: Record<string, string>): string =>
  getStageDefinition(stage).buildOutput(fields)
