import { SCORING_DIMENSIONS } from '@/knowledge/prompt-guide-data'
import { searchSuggestions, searchSimilarExamples } from '@/knowledge/prompt-guide-processor'
import type { ICard } from '@/models/Card.model'
import { assemblePrompt } from '@/utils/promptParser'

// 评估结果类型定义
export interface DimensionScore {
  score: number
  maxScore: number
  desc: string
}

export interface OptimizationSuggestion {
  id: string
  type: 'add' | 'modify' | 'delete'
  title: string
  description: string
  applyContent?: string
  cardType?: string
  priority: 'high' | 'medium' | 'low'
  targetCardId?: string
}

export interface ExcellentExample {
  id: string
  title: string
  content: string
  score: number
  reason: string
  tags: string[]
  similarity: number
}

export interface EvaluationResult {
  totalScore: number
  maxScore: number
  level: 'excellent' | 'good' | 'average' | 'poor'
  levelText: string
  dimensionScores: {
    completeness: DimensionScore
    detail: DimensionScore
    compliance: DimensionScore
    structure: DimensionScore
    innovation: DimensionScore
  }
  suggestions: OptimizationSuggestion[]
  similarExamples: ExcellentExample[]
  evaluationTime: number
}

/**
 * 智能评分服务
 * 基于官方Prompt Guide知识库实现全自动化评分
 */
export class EvaluationService {
  // 评估Prompt质量
  static async evaluate(cards: ICard[]): Promise<EvaluationResult> {
    const promptContent = assemblePrompt([{ cards }])
    
    // 计算各维度得分
    const dimensionScores = this.calculateDimensionScores(cards, promptContent)
    
    // 计算总分
    const totalScore = Object.values(dimensionScores as any).reduce((sum: number, dim: any) => sum + dim.score, 0)
    const maxScore = Object.values(dimensionScores as any).reduce((sum: number, dim: any) => sum + dim.maxScore, 0)
    
    // 确定评分等级
    const level = this.getScoreLevel(totalScore)
    const levelText = this.getLevelText(level)
    
    // 生成优化建议
    const suggestions: OptimizationSuggestion[] = searchSuggestions(promptContent, cards) as any
    
    // 匹配相似优秀案例
    const similarExamples = searchSimilarExamples(promptContent, 3)
    
    // 计算相似度
    const examplesWithSimilarity = similarExamples.map(example => ({
      ...example,
      similarity: this.calculateSimilarity(promptContent, example.content)
    })).sort((a, b) => b.similarity - a.similarity)
    
    return {
      totalScore: Math.round(totalScore),
      maxScore,
      level,
      levelText,
      dimensionScores,
      suggestions,
      similarExamples: examplesWithSimilarity,
      evaluationTime: Date.now()
    }
  }

  // 计算各维度得分
  private static calculateDimensionScores(cards: ICard[], promptContent: string) {
    const dimensionScores: any = {}
    
    SCORING_DIMENSIONS.forEach(dimension => {
      let score = 0
      const passedChecks: string[] = []
      const failedChecks: string[] = []
      
      switch (dimension.id) {
        case 'completeness': {
          // 完整性检查
          const requiredTypes = ['subject', 'action', 'scene', 'style']
          const optionalTypes = ['camera', 'audio', 'lighting', 'timing', 'constraint']
          
          requiredTypes.forEach(type => {
            if (cards.some(c => c.type === type && c.content.trim().length > 0)) {
              score += 5
              passedChecks.push(`包含${dimension.checkPoints[requiredTypes.indexOf(type)]}`)
            } else {
              failedChecks.push(`缺少${dimension.checkPoints[requiredTypes.indexOf(type)]}`)
            }
          })
          
          optionalTypes.forEach(type => {
            if (cards.some(c => c.type === type && c.content.trim().length > 0)) {
              score += 1
              passedChecks.push(`包含${dimension.checkPoints[4 + optionalTypes.indexOf(type)]}`)
            }
          })
          break
        }
        
        case 'detail': {
          // 细节度检查
          const avgLength = cards.reduce((sum, c) => sum + c.content.length, 0) / Math.max(cards.length, 1)
          const adjectiveCount = (promptContent.match(/的|地|得/g) || []).length
          const detailWords = ['明亮', '昏暗', '红色', '蓝色', '巨大', '微小', '快速', '缓慢', '微笑', '奔跑']
          const detailCount = detailWords.filter(word => promptContent.includes(word)).length
          
          // 长度得分
          if (avgLength > 50) score += 10
          else if (avgLength > 30) score += 7
          else if (avgLength > 15) score += 4
          
          // 修饰词得分
          score += Math.min(adjectiveCount * 2, 10)
          
          // 细节词汇得分
          score += Math.min(detailCount * 1, 5)
          
          // 空泛词汇检查
          const vagueWords = ['好看', '漂亮', '很棒', '美丽', '好的']
          const vagueCount = vagueWords.filter(word => promptContent.includes(word)).length
          score -= Math.min(vagueCount * 2, 5)
          break
        }
          
        case 'compliance': {
          // 合规性检查
          score += 8 // 基础分
          
          // 结构检查
          const hasGoodStructure = /(镜头|拍摄|视角).*(主体|人物|女孩|男孩).*(动作|奔跑|微笑).*(环境|场景|房间|户外).*(风格|质感|电影)/.test(promptContent)
          if (hasGoodStructure) score += 4
          
          // 音频标注检查
          const hasAudio = cards.some(c => c.type === 'audio')
          const hasGoodAudioFormat = hasAudio && /SFX:|Ambient:|".*"/.test(promptContent)
          if (hasAudio && hasGoodAudioFormat) score += 3
          else if (hasAudio) score += 1
          
          // 负面提示词检查
          const hasBadNegative = promptContent.includes('不要') || promptContent.includes('禁止') || promptContent.includes('no ')
          if (!hasBadNegative) score += 3
          
          // 违禁内容检查（简单模拟）
          const hasForbidden = /(色情|暴力|赌博)/.test(promptContent)
          if (!hasForbidden) score += 2
          else score -= 20
          break
        }
        
        case 'structure': {
          // 结构合理性检查
          score += 10 // 基础分
          
          // 顺序检查
          const typeOrder = cards.map(c => c.type)
          const expectedOrder = ['camera', 'subject', 'action', 'scene', 'style', 'lighting', 'timing', 'audio', 'constraint']
          let orderScore = 0
          let lastIndex = -1
          
          typeOrder.forEach(type => {
            const currentIndex = expectedOrder.indexOf(type)
            if (currentIndex > lastIndex) {
              orderScore++
            }
            lastIndex = currentIndex
          })
          
          score += Math.round((orderScore / Math.max(typeOrder.length, 1)) * 6)
          
          // 重复内容检查
          const contents = cards.map(c => c.content.trim())
          const uniqueContents = new Set(contents)
          if (uniqueContents.size === contents.length) score += 4
          else score -= (contents.length - uniqueContents.size) * 2
          break
        }
        
        case 'innovation': {
          // 创新性检查
          const hasUniqueShot = /(鱼眼镜头|第一人称|长镜头|一镜到底|慢动作)/i.test(promptContent)
          const hasUniqueStyle = /(赛博朋克|蒸汽波|水墨风|浮世绘|宫崎骏风格)/i.test(promptContent)
          const hasMultiScene = /\[00:.*\]/.test(promptContent)
          const hasStory = /(对话|剧情|故事|冒险|探索)/i.test(promptContent)
          
          if (hasUniqueShot) score += 3
          if (hasUniqueStyle) score += 3
          if (hasMultiScene) score += 2
          if (hasStory) score += 2
          break
        }
      }
      
      // 确保得分在有效范围内
      score = Math.max(0, Math.min(score, dimension.maxScore))
      
      // 生成分数描述
      let desc = ''
      if (score >= dimension.maxScore * 0.8) desc = '优秀'
      else if (score >= dimension.maxScore * 0.6) desc = '良好'
      else if (score >= dimension.maxScore * 0.4) desc = '一般'
      else desc = '较差'
      
      dimensionScores[dimension.id] = {
        name: dimension.name,
        score: Math.round(score),
        maxScore: dimension.maxScore,
        desc
      }
    })
    
    return dimensionScores
  }

  // 获取评分等级
  private static getScoreLevel(totalScore: number): 'excellent' | 'good' | 'average' | 'poor' {
    if (totalScore >= 85) return 'excellent'
    if (totalScore >= 70) return 'good'
    if (totalScore >= 50) return 'average'
    return 'poor'
  }

  // 获取等级文本
  private static getLevelText(level: string): string {
    const levelMap: Record<string, string> = {
      'excellent': '优秀',
      'good': '良好',
      'average': '一般',
      'poor': '较差'
    }
    return levelMap[level] || level
  }

  // 计算相似度（简单实现）
  private static calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))
    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])
    return intersection.size / union.size
  }
}

// 快捷评估函数
export const evaluatePrompt = async (cards: ICard[]) => {
  return EvaluationService.evaluate(cards)
}