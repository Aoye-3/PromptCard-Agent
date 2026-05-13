import type { ICard } from '@/models/Card.model'

export const assemblePrompt = (pages: { cards: ICard[] }[], separator: string = ', '): string => {
  if (!pages.length) return ''

  const pageContents = pages.map((page) => {
    const timingCard = page.cards.find(card => card.type === 'timing')
    const timingContent = timingCard?.content.trim() ?? ''
    const timePrefix = timingContent ? `[${timingContent}] ` : ''

    const order: ICard['type'][] = [
      'subject',
      'action',
      'scene',
      'style',
      'camera',
      'lighting',
      'audio',
      'constraint',
      'custom'
    ]
    const sortedCards = [...page.cards]
      .filter(card => card.type !== 'timing')
      .sort((a, b) => {
        const indexA = order.indexOf(a.type)
        const indexB = order.indexOf(b.type)
        return indexA - indexB
      })

    const content = sortedCards
      .map(card => card.content.trim())
      .filter(content => content.length > 0)
      .join(separator)

    return `${timePrefix}${content}`.trim()
  })

  return pageContents.filter(content => content.length > 0).join('\n')
}

export const parsePromptToCards = (prompt: string): Partial<ICard>[] => {
  const cards: Partial<ICard>[] = []
  const parts = prompt.split(/[,，。；;]/).map(p => p.trim()).filter(p => p.length > 0)

  const rules: { type: ICard['type']; keywords: string[] }[] = [
    { type: 'subject', keywords: ['人', '男人', '女人', '女孩', '男孩', '动物', '猫', '狗', '角色', '主角', '人物'] },
    { type: 'action', keywords: ['跑', '跳', '走', '站', '坐', '躺', '飞', '游', '动作', '表演', '运动'] },
    { type: 'scene', keywords: ['公园', '森林', '城市', '海边', '雪山', '沙漠', '背景', '场景', '环境'] },
    { type: 'style', keywords: ['风格', '质感', '画风', '动画', '手绘', '油画', '卡通', '3D', '写实'] },
    { type: 'camera', keywords: ['镜头', '视角', '拍摄', '特写', '全景', '中景', '跟拍', '航拍'] },
    { type: 'lighting', keywords: ['光线', '灯光', '光照', '阳光', '月光', '阴影', '冷暖光'] },
    { type: 'timing', keywords: ['时长', '秒', '分钟', '速度', '快慢', '节奏'] },
    { type: 'audio', keywords: ['声音', '音效', '音乐', '配音', 'bgm', 'BGM'] },
    { type: 'constraint', keywords: ['禁止', '不要', '不要出现', '分辨率', '比例', '画质'] }
  ]

  parts.forEach((content, index) => {
    let type: ICard['type'] = 'custom'
    let title = `自定义卡片${index + 1}`

    for (const rule of rules) {
      if (rule.keywords.some(keyword => content.includes(keyword))) {
        type = rule.type
        title = getCardDefaultTitle(type)
        break
      }
    }

    cards.push({
      type,
      title,
      content,
      mode: 'view',
      color: getCardColor(type),
      meta: {}
    })
  })

  return cards
}

export const getCardDefaultTitle = (type: ICard['type']): string => {
  const titleMap: Record<ICard['type'], string> = {
    subject: '主体',
    action: '动作',
    scene: '场景',
    style: '风格',
    camera: '镜头',
    lighting: '灯光',
    timing: '时序',
    audio: '音频',
    constraint: '约束',
    custom: '自定义'
  }
  return titleMap[type]
}

export const getCardColor = (type: ICard['type']): string => {
  const colorMap: Record<ICard['type'], string> = {
    subject: 'blue',
    action: 'green',
    scene: 'purple',
    style: 'orange',
    camera: 'red',
    lighting: 'yellow',
    timing: 'amber',
    audio: 'teal',
    constraint: 'purple',
    custom: 'gray'
  }
  return colorMap[type]
}
