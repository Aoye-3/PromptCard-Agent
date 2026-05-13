import { SCORING_DIMENSIONS, BEST_PRACTICES, OPTIMIZATION_SUGGESTIONS, EXCELLENT_EXAMPLES, COMMON_ISSUES } from './prompt-guide-data'
import { VIDPROM_EXCELLENT_EXAMPLES } from './vidprom-examples'
import type { ICard } from '@/models/Card.model'

/**
 * 知识库检索工具类
 * 提供基于官方Prompt Guide的知识检索能力
 */

// 检索最佳实践
export const searchBestPractices = (keyword?: string, cardType?: string) => {
  let results = BEST_PRACTICES
  
  if (cardType && cardType !== 'all') {
    results = results.filter(p => p.applicableType === 'all' || p.applicableType === cardType)
  }
  
  if (keyword) {
    const lowerKeyword = keyword.toLowerCase()
    results = results.filter(p => 
      p.title.toLowerCase().includes(lowerKeyword) || 
      p.content.toLowerCase().includes(lowerKeyword)
    )
  }
  
  return results
}

// 检索优化建议
export const searchSuggestions = (promptContent: string, cards: ICard[]) => {
  const suggestions = [...OPTIMIZATION_SUGGESTIONS]
  const matchedSuggestions: typeof suggestions = []
  
  // 检测缺少的要素
  const hasCamera = cards.some(c => c.type === 'camera')
  const hasAudio = cards.some(c => c.type === 'audio')
  const hasStyle = cards.some(c => c.type === 'style')
  const hasTiming = cards.some(c => c.type === 'timing')
  
  if (!hasCamera) {
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-001')!)
  }
  
  if (!hasAudio) {
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-002')!)
  }
  
  if (!hasStyle) {
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-005')!)
  }
  
  if (!hasTiming && cards.length > 3) {
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-007')!)
  }
  
  // 检测细节丰富度
  const totalLength = cards.reduce((sum, c) => sum + c.content.length, 0)
  const avgLength = totalLength / Math.max(cards.length, 1)
  
  if (avgLength < 30) {
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-003')!)
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-004')!)
  }
  
  // 检测负面提示词
  const hasNegative = promptContent.toLowerCase().includes('no ') || promptContent.toLowerCase().includes('不要') || promptContent.toLowerCase().includes('避免')
  if (hasNegative) {
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-006')!)
  }
  
  // 检测结构顺序
  const typeOrder = cards.map(c => c.type)
  const expectedOrder = ['camera', 'subject', 'action', 'scene', 'style', 'lighting', 'timing', 'audio', 'constraint', 'custom']
  let orderScore = 0
  let lastIndex = -1
  
  typeOrder.forEach(type => {
    const currentIndex = expectedOrder.indexOf(type)
    if (currentIndex > lastIndex) {
      orderScore++
    }
    lastIndex = currentIndex
  })
  
  if (orderScore / typeOrder.length < 0.7) {
    matchedSuggestions.push(suggestions.find(s => s.id === 'suggest-008')!)
  }
  
  return matchedSuggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]
  })
}

// 检索相似优秀案例
export const searchSimilarExamples = (promptContent: string, limit: number = 3) => {
  const lowerContent = promptContent.toLowerCase()
  
  // 合并官方示例和 VidProM 示例
  const allExamples = [...EXCELLENT_EXAMPLES, ...VIDPROM_EXCELLENT_EXAMPLES]
  
  return allExamples.filter(example => {
    return example.tags.some(tag => lowerContent.includes(tag.toLowerCase())) ||
           example.content.toLowerCase().split(' ').some(word => lowerContent.includes(word))
  }).slice(0, limit)
}

// 检索常见问题解决方案
export const searchCommonIssues = (issue: string) => {
  const lowerIssue = issue.toLowerCase()
  return COMMON_ISSUES.filter(i => 
    i.issue.toLowerCase().includes(lowerIssue) || 
    i.solution.toLowerCase().includes(lowerIssue)
  )
}

// 获取完整的评分标准
export const getScoringCriteria = () => {
  return SCORING_DIMENSIONS
}