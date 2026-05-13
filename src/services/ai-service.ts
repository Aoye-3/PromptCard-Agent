import type { ICard } from '@/models/Card.model'
import type { EvaluationResult, OptimizationSuggestion } from './evaluation-service'
import { SCORING_DIMENSIONS, BEST_PRACTICES, COMMON_ISSUES, EXCELLENT_EXAMPLES } from '@/knowledge/prompt-guide-data'

// AI配置类型定义
export interface AIConfig {
  // 启用AI增强模式
  enabled: boolean
  // AI服务提供商
  provider: 'openai' | 'deepseek' | 'tongyi' | 'ernie' | 'local'
  // API地址
  apiBase: string
  // API密钥
  apiKey: string
  // 模型名称
  modelName: string
  // 最大tokens
  maxTokens: number
  // 温度参数，0-1，越低越准确
  temperature: number
}

// AI评估输入结构
export interface AIEvaluationInput {
  // 完整Prompt内容
  prompt: string
  // 所有卡片
  cards: ICard[]
  // 规则引擎的评分结果作为参考
  ruleBasedResult: EvaluationResult
  // 官方评分标准
  scoringRules: typeof SCORING_DIMENSIONS
  // 官方最佳实践
  bestPractices: typeof BEST_PRACTICES
  // 常见问题
  commonIssues: typeof COMMON_ISSUES
}

// AI评估输出结构，和现有规则引擎输出格式完全兼容
export interface AIEvaluationOutput {
  // 总分 0-100
  totalScore: number
  // 各维度得分
  dimensionScores: {
    [key: string]: {
      score: number
      desc: string
    }
  }
  // 优化建议列表
  suggestions: (OptimizationSuggestion & {
    // AI给出的修改理由
    reason?: string
    // AI生成的可直接应用的内容
    applyContent?: string
    // 对应要修改的卡片ID（如果是修改已有卡片）
    targetCardId?: string
    // 对应要添加的卡片类型（如果是新增卡片）
    targetCardType?: string
  })[]
  // AI详细分析说明
  analysis: string
  // AI优化后的完整Prompt
  optimizedPrompt: string
  // 优秀参考案例
  referenceExamples?: string[]
}

// 统一的AI服务抽象类
abstract class BaseAIService {
  protected config: AIConfig

  constructor(config: AIConfig) {
    this.config = config
  }

  abstract evaluate(input: AIEvaluationInput): Promise<AIEvaluationOutput>
}

// OpenAI兼容服务实现（支持OpenAI、DeepSeek、本地开源模型等所有兼容OpenAI API格式的服务）
class OpenAICompatibleService extends BaseAIService {
  async evaluate(input: AIEvaluationInput): Promise<AIEvaluationOutput> {
    const systemPrompt = this.buildSystemPrompt()
    const userPrompt = this.buildUserPrompt(input)

    const response = await fetch(`${this.config.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.modelName,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`AI调用失败: ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0].message.content

    try {
      return JSON.parse(content) as AIEvaluationOutput
    } catch (e) {
      console.error('AI返回解析失败:', content)
      throw new Error('AI返回格式解析失败，请重试')
    }
  }

  // 构建系统提示词，严格对齐官方Prompt指南
  private buildSystemPrompt(): string {
    return `
# 角色定义
你是经过严格训练的官方Veo 3.1 Prompt评估专家，必须完全遵守官方发布的Prompt创作指南来进行评估，绝对不能主观臆断，所有判断必须基于官方标准。

# 评估原则（必须严格遵守）
1. 绝对公正，严格按照官方标准评分，不能放水也不能过于苛刻
2. 所有建议必须可落地，给出的优化内容必须可以直接使用
3. 必须指出具体的问题，不能空泛评价
4. 严格按照官方五要素结构来评估：镜头→主体→动作→环境→风格
5. 优先推荐官方最佳实践，优化建议必须符合官方规范

## 官方评分标准（权重固定，不能修改）
${JSON.stringify(SCORING_DIMENSIONS, null, 2)}

## 官方最佳实践（必须作为优化依据）
${JSON.stringify(BEST_PRACTICES, null, 2)}

## 常见问题与官方推荐解决方案
${JSON.stringify(COMMON_ISSUES, null, 2)}

## 优秀示例参考
${JSON.stringify(EXCELLENT_EXAMPLES, null, 2)}

# 评估输出要求
1. 总分必须在0-100分之间，各维度得分必须严格对应权重：完整性25，细节度25，合规性20，结构合理性20，创新性10
2. 每个维度必须给出具体的评分说明，指出哪里做得好哪里不足
3. 优化建议必须分类：
   - add：需要新增的卡片内容，必须指定对应的卡片类型
   - modify：需要修改的现有内容，必须给出完整的修改后的内容
   - delete：需要删除的冗余或矛盾内容
4. 优先级说明：
   - high：严重影响生成质量，必须修改
   - medium：优化后能明显提升效果，建议修改
   - low：细节优化，可选修改
5. 必须提供优化后的完整Prompt，完全符合官方规范
6. 可以提供相关的优秀案例作为参考

# 输出格式（必须严格返回JSON，不能有其他内容）
{
  "totalScore": 0-100,
  "dimensionScores": {
    "completeness": {"score": 0-25, "desc": "详细评分说明，包含优点和不足"},
    "detail": {"score": 0-25, "desc": "详细评分说明，包含优点和不足"},
    "compliance": {"score": 0-20, "desc": "详细评分说明，包含优点和不足"},
    "structure": {"score": 0-20, "desc": "详细评分说明，包含优点和不足"},
    "innovation": {"score": 0-10, "desc": "详细评分说明，包含优点和不足"}
  },
  "suggestions": [
    {
      "id": "唯一ID，比如suggest-ai-001",
      "type": "add/modify/delete",
      "title": "简洁的建议标题",
      "description": "详细的建议说明，解释为什么要这么修改",
      "reason": "对应的官方最佳实践或者问题依据",
      "applyContent": "可以直接复制使用的具体内容",
      "targetCardType": "对应的卡片类型：subject/action/scene/style/camera/lighting/timing/audio/constraint/custom，如果是修改现有内容可以不用填",
      "priority": "high/medium/low"
    }
  ],
  "analysis": "详细的整体分析，至少300字，包含Prompt的优点、存在的问题、改进方向",
  "optimizedPrompt": "完全优化后的完整Prompt，符合官方所有规范",
  "referenceExamples": ["3个以内和当前Prompt相关的优秀示例，直接取示例库中的content即可"]
}

# 重要提醒
- 绝对不能返回JSON以外的内容，包括解释、说明、markdown等
- 所有评分必须基于官方标准，不能凭空捏造
- 优化建议必须具体，不能说"增加细节"这种空泛的话，必须给出具体的内容
- 优化后的Prompt必须保持用户的核心需求不变，只是提升规范性和丰富度
`
  }

  // 构建用户输入提示词
  private buildUserPrompt(input: AIEvaluationInput): string {
    return `
请评估以下视频Prompt：

## 当前Prompt内容
${input.prompt}

## 结构化卡片内容
${JSON.stringify(input.cards.map(c => ({
  卡片类型: c.type,
  卡片标题: c.title,
  卡片内容: c.content
})), null, 2)}

## 现有规则引擎的评分结果参考
${JSON.stringify(input.ruleBasedResult, null, 2)}

请按照官方标准给出专业的评估结果，严格返回JSON格式，不要其他内容。
`
  }
}

// AI服务工厂
export class AIServiceFactory {
  static getService(config: AIConfig): BaseAIService {
    // 目前所有服务都兼容OpenAI API格式，后续可以根据不同provider扩展不同实现
    return new OpenAICompatibleService(config)
  }
}

// 默认AI配置
export const defaultAIConfig: AIConfig = {
  enabled: true,
  provider: 'openai',
  apiBase: '/api',
  apiKey: '', // 清空硬编码的API密钥
  modelName: 'deepseek-v3.2',
  maxTokens: 4000,
  temperature: 0.3
}