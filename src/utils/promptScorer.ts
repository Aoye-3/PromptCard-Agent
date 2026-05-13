import type { ICard } from '@/models/Card.model'
import { assemblePrompt } from './promptParser'

export interface ScoreResult {
  total: number
  completeness: number
  detail: number
  creativity: number
  coherence: number
  suggestions: string[]
}

/**
 * Prompt四维度评分函数
 * @param cards 卡片数组
 * @returns 评分结果和优化建议
 */
export const scorePrompt = (cards: ICard[]): ScoreResult => {
  const suggestions: string[] = []
  const prompt = assemblePrompt([{ cards }])

  // 1. 完整性评分 (0-25分)
  let completeness = 0
  const requiredTypes: ICard['type'][] = ['subject', 'action', 'scene', 'style']
  const optionalTypes: ICard['type'][] = ['camera', 'lighting', 'timing', 'audio', 'constraint']
  
  const hasType = (type: ICard['type']) => cards.some(c => c.type === type && c.content.trim().length > 0)
  
  requiredTypes.forEach(type => {
    if (hasType(type)) completeness += 5
    else suggestions.push(`缺少${getCardDefaultTitle(type)}描述，可以让Prompt更完整`)
  })
  
  optionalTypes.forEach(type => {
    if (hasType(type)) completeness += 1
  })
  
  completeness = Math.min(completeness, 25)

  // 2. 细节度评分 (0-25分)
  let detail = 0
  // 平均每个卡片的内容长度
  const avgContentLength = cards.reduce((sum, card) => sum + card.content.length, 0) / Math.max(cards.length, 1)
  
  // 内容长度得分
  if (avgContentLength > 30) detail += 10
  else if (avgContentLength > 20) detail += 7
  else if (avgContentLength > 10) detail += 4
  else suggestions.push('卡片内容描述可以更详细，增加细节提升生成效果')

  // 形容词/修饰词数量得分
  const adjectives = ['美丽的', '漂亮的', '高大的', '小巧的', '明亮的', '昏暗的', '快速的', '缓慢的', '开心的', '悲伤的', '复古的', '现代的', '未来的', '古老的']
  const adjCount = adjectives.filter(adj => prompt.includes(adj)).length
  detail += Math.min(adjCount * 2, 10)

  // 具体描述得分（避免模糊词）
  const vagueWords = ['好看的', '很棒的', '不错的', '很好的', '一般的', '普通的']
  const vagueCount = vagueWords.filter(word => prompt.includes(word)).length
  if (vagueCount === 0) detail += 5
  else suggestions.push(`避免使用"${vagueWords.find(word => prompt.includes(word))}"这类模糊描述，使用更具体的词汇`)

  detail = Math.min(detail, 25)

  // 3. 创意性评分 (0-25分)
  let creativity = 0
  // 卡片数量得分
  if (cards.length >= 7) creativity += 8
  else if (cards.length >= 5) creativity += 5
  else if (cards.length >= 3) creativity += 3
  else suggestions.push('增加更多不同类型的卡片，可以让Prompt更有创意')

  // 独特组合得分
  const uniqueCombinations = [
    { keywords: ['赛博朋克', '古风'], score: 5 },
    { keywords: ['科幻', '田园'], score: 5 },
    { keywords: ['蒸汽波', '中世纪'], score: 5 },
    { keywords: ['水下', '太空'], score: 5 }
  ]

  uniqueCombinations.forEach(combo => {
    if (combo.keywords.every(keyword => prompt.includes(keyword))) {
      creativity += combo.score
      suggestions.push(`发现独特的"${combo.keywords.join('+')}"组合，创意性加分`)
    }
  })

  // 场景复杂度得分
  if (prompt.includes('同时') || prompt.includes('并且') || prompt.includes('还有')) {
    creativity += Math.min(prompt.split('同时').length * 2, 7)
  }

  creativity = Math.min(creativity, 25)

  // 4. 连贯性评分 (0-25分)
  let coherence = 25
  // 逻辑冲突检查
  const conflictPairs = [
    { pair: ['白天', '黑夜'], suggestion: '同时出现"白天"和"黑夜"描述可能存在逻辑冲突' },
    { pair: ['古代', '现代'], suggestion: '同时出现"古代"和"现代"描述可能存在逻辑冲突' },
    { pair: ['下雨', '晴天'], suggestion: '同时出现"下雨"和"晴天"描述可能存在逻辑冲突' },
    { pair: ['写实', '卡通'], suggestion: '同时出现"写实"和"卡通"描述可能存在风格冲突' }
  ]

  conflictPairs.forEach(conflict => {
    if (conflict.pair.every(word => prompt.includes(word))) {
      coherence -= 5
      suggestions.push(conflict.suggestion)
    }
  })

  // 重复内容检查
  const contents = cards.map(c => c.content.trim())
  const duplicates = contents.filter((c, index) => contents.indexOf(c) !== index)
  if (duplicates.length > 0) {
    coherence -= Math.min(duplicates.length * 3, 10)
    suggestions.push(`存在重复内容："${duplicates[0]}"，建议合并或删除重复卡片`)
  }

  coherence = Math.max(coherence, 0)

  // 计算总分
  const total = Math.round((completeness + detail + creativity + coherence) / 100 * 100)

  // 总分优化建议
  if (total >= 90) {
    suggestions.unshift('🎉 Prompt质量优秀，可以直接生成')
  } else if (total >= 70) {
    suggestions.unshift('✅ Prompt质量良好，适当优化可以提升效果')
  } else if (total >= 50) {
    suggestions.unshift('⚠️ Prompt质量一般，建议按照下面的建议优化')
  } else {
    suggestions.unshift('❌ Prompt质量较差，需要重点优化')
  }

  return {
    total,
    completeness: Math.round(completeness),
    detail: Math.round(detail),
    creativity: Math.round(creativity),
    coherence: Math.round(coherence),
    suggestions
  }
}

// 辅助函数
const getCardDefaultTitle = (type: ICard['type']): string => {
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
