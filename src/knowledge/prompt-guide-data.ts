/**
 * 基于官方Veo 3.1 Prompt Guide构建的知识库
 * 包含评分规则、最佳实践、优化建议等核心知识
 */

// 评分维度定义
export const SCORING_DIMENSIONS = [
  {
    id: 'completeness',
    name: '完整性',
    weight: 25,
    description: '是否包含所有必要的Prompt要素',
    maxScore: 25,
    checkPoints: [
      '是否包含主体描述',
      '是否包含动作行为',
      '是否包含环境背景',
      '是否包含风格氛围',
      '是否包含镜头语言（可选但推荐）',
      '是否包含音频设计（可选但推荐）'
    ]
  },
  {
    id: 'detail',
    name: '细节度',
    weight: 25,
    description: '描述是否足够具体和详细',
    maxScore: 25,
    checkPoints: [
      '是否包含主体特征细节',
      '是否包含动作细节描述',
      '是否包含环境细节描述',
      '是否使用了具体的修饰词而非模糊描述',
      '是否避免了"好看的"、"很棒的"等空泛词汇'
    ]
  },
  {
    id: 'compliance',
    name: '合规性',
    weight: 20,
    description: '是否符合官方Prompt规范',
    maxScore: 20,
    checkPoints: [
      '是否遵循官方五要素公式结构',
      '是否没有包含违禁内容',
      '是否使用了正确的音频标注方式（如果有音频）',
      '负面提示词是否采用了正向描述方式',
      '是否避免了容易导致生成异常的描述'
    ]
  },
  {
    id: 'structure',
    name: '结构合理性',
    weight: 20,
    description: 'Prompt结构是否清晰合理',
    maxScore: 20,
    checkPoints: [
      '要素顺序是否符合官方建议顺序（镜头→主体→动作→环境→风格）',
      '逻辑是否通顺，没有矛盾的描述',
      '如果是多镜头时间轴格式，时间戳是否正确',
      '是否没有重复的描述内容',
      '重要元素是否放在前面突出位置'
    ]
  },
  {
    id: 'innovation',
    name: '创新性',
    weight: 10,
    description: '是否有独特的创意和设计',
    maxScore: 10,
    checkPoints: [
      '是否有独特的镜头语言运用',
      '是否有新颖的场景或创意组合',
      '是否有有趣的叙事结构设计',
      '是否避免了常见的俗套描述',
      '整体创意是否有吸引力'
    ]
  }
]

// 最佳实践库
export const BEST_PRACTICES = [
  {
    id: 'bp-001',
    title: '使用官方五要素公式',
    content: '按照[镜头语言] + [主体描述] + [动作行为] + [环境背景] + [风格氛围]的结构组织Prompt',
    applicableType: 'all'
  },
  {
    id: 'bp-002',
    title: '使用具体的镜头术语',
    content: '使用专业的镜头描述术语，如"推轨镜头"、"浅景深特写"、"低角度拍摄"等，提升生成质量',
    applicableType: 'camera'
  },
  {
    id: 'bp-003',
    title: '音频标注规范',
    content: '对话使用引号标注：`A says, "Hello."`，音效使用`SFX:`前缀，环境音使用`Ambient noise:`前缀',
    applicableType: 'audio'
  },
  {
    id: 'bp-004',
    title: '负面提示词技巧',
    content: '使用正向描述排除不需要的内容，例如"desolate landscape with no buildings"比"no buildings"效果更好',
    applicableType: 'constraint'
  },
  {
    id: 'bp-005',
    title: '时间轴分段技巧',
    content: '多镜头场景使用[00:00-00:02]格式的时间戳分段描述，精确控制视频节奏',
    applicableType: 'timing'
  },
  {
    id: 'bp-006',
    title: '丰富细节描述',
    content: '添加材质、光线、颜色、质感等细节描述，例如"80年代复古电脑，屏幕发出绿色荧光，表面有划痕和灰尘"',
    applicableType: 'all'
  },
  {
    id: 'bp-007',
    title: '情绪氛围描述',
    content: '添加情绪和氛围描述，例如"忧郁的冷蓝色调，情绪化，电影质感"，提升整体氛围表达',
    applicableType: 'style'
  }
]

// 常见优化建议库
export const OPTIMIZATION_SUGGESTIONS = [
  {
    id: 'suggest-001',
    type: 'add',
    title: '添加镜头语言描述',
    description: '当前Prompt缺少镜头语言描述，建议添加具体的镜头类型、运动方式、景别等信息',
    applyContent: '中景镜头，手持跟拍，浅景深',
    cardType: 'camera',
    priority: 'high'
  },
  {
    id: 'suggest-002',
    type: 'add',
    title: '添加音频设计',
    description: '当前Prompt没有音频设计，建议添加对话、音效或环境音描述，提升视频整体效果',
    applyContent: 'SFX: 环境音效，轻柔的背景音乐',
    cardType: 'audio',
    priority: 'medium'
  },
  {
    id: 'suggest-003',
    type: 'modify',
    title: '丰富主体细节',
    description: '主体描述过于简单，建议添加更多外貌、服装、表情等细节特征',
    applyContent: '{原有内容}，穿着休闲牛仔裤和白色T恤，脸上带着微笑，皮肤有自然的纹理',
    priority: 'high'
  },
  {
    id: 'suggest-004',
    type: 'modify',
    title: '优化环境描述',
    description: '环境描述不够具体，建议添加更多环境细节、光线、天气等信息',
    applyContent: '{原有内容}，阳光透过树叶洒下斑驳的光影，空气中飘着淡淡的花香，微风轻轻吹拂',
    priority: 'medium'
  },
  {
    id: 'suggest-005',
    type: 'add',
    title: '添加风格定义',
    description: '当前Prompt缺少风格定义，建议添加艺术风格、电影质感等描述',
    applyContent: '复古胶片风格，80年代彩色胶片质感，轻微颗粒感，暖色调',
    cardType: 'style',
    priority: 'medium'
  },
  {
    id: 'suggest-006',
    type: 'modify',
    title: '优化负面提示词',
    description: '负面提示词使用了否定描述，建议改为正向排除的描述方式',
    applyContent: '场景中没有多余的人物和物体',
    priority: 'low'
  },
  {
    id: 'suggest-007',
    type: 'add',
    title: '添加时长控制',
    description: '建议添加时长和节奏控制描述，更好地控制视频生成速度',
    applyContent: '总时长6秒，前2秒缓慢推进镜头，中间2秒展示主体动作，最后2秒拉远镜头',
    cardType: 'timing',
    priority: 'low'
  },
  {
    id: 'suggest-008',
    type: 'modify',
    title: '调整Prompt结构顺序',
    description: 'Prompt要素顺序不符合官方建议，建议调整为镜头→主体→动作→环境→风格的顺序',
    priority: 'medium'
  }
]

// 优秀Prompt案例库
export const EXCELLENT_EXAMPLES = [
  {
    id: 'example-001',
    title: '办公室场景',
    content: '中景镜头，疲惫的公司职员，疲惫地揉着太阳穴，深夜杂乱的办公室里一台笨重的80年代电脑前，场景被头顶刺眼的荧光灯和单色显示器的绿光点亮，复古美学，80年代彩色胶片拍摄，轻微颗粒感',
    score: 92,
    reason: '要素完整，细节丰富，结构合理，风格明确',
    tags: ['办公', '复古', '80年代']
  },
  {
    id: 'example-002',
    title: '雨夜公交场景',
    content: '极浅浅景深特写，年轻女性的脸，望着车窗外流动的城市灯光，玻璃上隐约可见她的倒影，雨夜的公交车内，忧郁的冷蓝色调，情绪化，电影质感',
    score: 94,
    reason: '镜头语言专业，氛围营造到位，细节描述精准',
    tags: ['情绪', '夜景', '特写']
  },
  {
    id: 'example-003',
    title: '丛林探险多镜头',
    content: '[00:00-00:02] 年轻女探险家的后背中景，她推开巨大的丛林藤蔓露出隐藏的路径\n[00:02-00:04] 探险家雀斑脸的反打镜头，她表情震撼地望着背景中古老的苔藓覆盖的遗迹。SFX：茂密树叶沙沙声，远处奇异鸟叫\n[00:04-00:06] 跟拍镜头，探险家走入空地，手抚过 crumbling石墙上的复杂雕刻。情绪：惊叹与敬畏\n[00:06-00:08] 高空广角升降镜头，展现孤独的探险家站在广阔的被丛林半吞噬的遗忘神庙中心。SFX：轻柔的管弦乐开始响起',
    score: 98,
    reason: '多镜头时间轴格式规范，细节丰富，节奏控制精准，包含专业音频设计',
    tags: ['多镜头', '探险', '时间轴']
  }
]

// 常见问题与解决方案
export const COMMON_ISSUES = [
  {
    issue: '人物面部畸形',
    solution: '添加"人物面部结构正常，五官对称，表情自然"的约束描述，使用特写镜头时增加更多面部细节描述'
  },
  {
    issue: '动作不连贯',
    solution: '添加更详细的动作过程描述，使用时间轴分段明确每个时间点的动作，避免太大的动作跨度'
  },
  {
    issue: '风格不统一',
    solution: '在Prompt开头明确整体风格定义，所有元素描述保持风格一致性，避免矛盾的风格描述'
  },
  {
    issue: '音频不同步',
    solution: '使用时间轴分段描述时，明确标注每个时间段对应的音频内容，对话内容使用引号准确标注'
  },
  {
    issue: '物体变形',
    solution: '添加"物体结构正常，透视准确，没有变形"的约束描述，复杂物体增加更多结构细节描述'
  }
]