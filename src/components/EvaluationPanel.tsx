import React, { useState, useEffect } from 'react'
import type { EvaluationResult, OptimizationSuggestion } from '@/services/evaluation-service'
import { evaluatePrompt } from '@/services/evaluation-service'
import { useCardStore } from '@/stores/card.store'
import { SCORING_DIMENSIONS } from '@/knowledge/prompt-guide-data'
import { appConfig } from '@/services/config-service'
import { AIServiceFactory } from '@/services/ai-service'
import type { AIEvaluationOutput } from '@/services/ai-service'
import { Settings, Loader2 } from 'lucide-react'
import AISettingsPanel from './AISettingsPanel'
import { useI18n } from '@/i18n'

interface EvaluationPanelProps {
  onApplySuggestion?: (suggestion: OptimizationSuggestion) => void
}

const EvaluationPanel: React.FC<EvaluationPanelProps> = ({ onApplySuggestion }) => {
  const { t } = useI18n()
  const { pages, currentPage } = useCardStore()
  const cards = pages[currentPage]?.cards || []
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [aiResult, setAiResult] = useState<AIEvaluationOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  const [showSettings, setShowSettings] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(appConfig.ai.enabled)
  const [evaluateMode, setEvaluateMode] = useState<'rule' | 'ai'>('rule')

  useEffect(() => {
    setAiEnabled(appConfig.ai.enabled)
  }, [])

  useEffect(() => {
    if (cards.length > 0) {
      handleEvaluate()
    }
  }, [cards, evaluateMode])

  const handleEvaluate = async () => {
    if (cards.length === 0) {
      alert(t('addCardsBeforeEvaluateAlert'))
      return
    }
    
    if (evaluateMode === 'ai' && !appConfig.ai.apiKey) {
      alert(t('configureApiKey'))
      setShowSettings(true)
      return
    }

    setLoading(true)
    setAiLoading(evaluateMode === 'ai')
    try {
      if (evaluateMode === 'rule') {
        const evaluationResult = await evaluatePrompt(cards)
        setResult(evaluationResult)
        setAiResult(null)
      } else {
        const ruleResult = await evaluatePrompt(cards)
        setResult(ruleResult)
        
        const aiService = AIServiceFactory.getService(appConfig.ai)
        const prompt = cards.map(card => card.content).filter(content => content.trim()).join('\n')
        const aiEvaluationResult = await aiService.evaluate({
          prompt: prompt,
          cards,
          ruleBasedResult: ruleResult,
          scoringRules: SCORING_DIMENSIONS,
          bestPractices: [],
          commonIssues: []
        })
        setAiResult(aiEvaluationResult)
      }
    } catch (error) {
      console.error('评估失败:', error)
      alert(t('evaluationFailed', { message: (error as Error).message }))
    } finally {
      setLoading(false)
      setAiLoading(false)
    }
  }

  const handleOptimizeAll = () => {
    if (!result) return
    const highPrioritySuggestions = result.suggestions.filter(s => s.priority === 'high')
    if (highPrioritySuggestions.length === 0) {
      alert(t('noHighPrioritySuggestions'))
      return
    }
    if (confirm(t('applyHighPriorityConfirm', { count: highPrioritySuggestions.length }))) {
      highPrioritySuggestions.forEach(s => {
        onApplySuggestion?.(s)
      })
      alert(t('appliedHighPriority', { count: highPrioritySuggestions.length }))
    }
  }

  const getLevelColor = (level: string) => {
    const colorMap: Record<string, string> = {
      'excellent': 'text-coral bg-warm-sand border-border-warm',
      'good': 'text-terracotta bg-warm-sand border-border-warm',
      'average': 'text-stone-gray bg-warm-sand border-border-warm',
      'poor': 'text-error-crimson bg-warm-sand border-border-warm'
    }
    return colorMap[level] || 'text-stone-gray bg-warm-sand border-border-warm'
  }

  const getPriorityColor = (priority: string) => {
    const colorMap: Record<string, string> = {
      'high': 'bg-warm-sand text-error-crimson border border-border-warm',
      'medium': 'bg-warm-sand text-terracotta border border-border-warm',
      'low': 'bg-warm-sand text-charcoal-warm border border-border-warm'
    }
    return colorMap[priority] || 'bg-warm-sand text-stone-gray border border-border-warm'
  }

  const getPriorityText = (priority: string) => {
    const textMap: Record<string, string> = {
      'high': t('priorityHigh'),
      'medium': t('priorityMedium'),
      'low': t('priorityLow')
    }
    return textMap[priority] || priority
  }

  if (cards.length === 0) {
    return (
      <React.Fragment>
        <div className="p-6 text-center">
          <div className="text-gray-400 text-5xl mb-4">📊</div>
          <h3 className="text-lg font-medium text-gray-600 mb-2">{t('noContentToEvaluate')}</h3>
          <p className="text-sm text-gray-500">{t('addCardsBeforeEvaluation')}</p>
        </div>
        <AISettingsPanel
          visible={showSettings}
          onClose={() => setShowSettings(false)}
        />
      </React.Fragment>
    )
  }

  return (
    <React.Fragment>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-serif text-near-black">{t('promptEvaluation')}</h2>
          <div className="flex items-center gap-3">
            <div className="flex bg-warm-sand rounded-lg p-1">
              <button
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  evaluateMode === 'rule'
                    ? 'bg-ivory text-terracotta border border-border-warm shadow-sm'
                    : 'text-charcoal-warm hover:text-near-black'
                }`}
                onClick={() => setEvaluateMode('rule')}
              >
                {t('ruleEvaluation')}
              </button>
              {aiEnabled && (
                <button
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    evaluateMode === 'ai'
                      ? 'bg-ivory text-terracotta border border-border-warm shadow-sm'
                      : 'text-charcoal-warm hover:text-near-black'
                  }`}
                  onClick={() => setEvaluateMode('ai')}
                >
                  {t('aiEvaluation')}
                </button>
              )}
            </div>

            <button
              className="p-2 rounded-lg bg-warm-sand hover:bg-border-warm text-charcoal-warm transition"
              onClick={() => setShowSettings(true)}
              title={t('aiSettings')}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center p-12 space-y-4">
            <Loader2 className="w-12 h-12 text-terracotta animate-spin" />
            <p className="text-stone-gray">
              {aiLoading ? t('aiEvaluating') : t('ruleEvaluating')}
            </p>
          </div>
        )}

        {result && !loading && (
          <React.Fragment>
            {/* 总体评分 */}
            <div className="bg-ivory rounded-xl border border-border-cream p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-serif text-near-black mb-1">{t('overallScore')}</h3>
                  <p className="text-sm text-stone-gray">
                    {evaluateMode === 'ai' && aiResult ? t('aiCombinedScore') : t('ruleBasedScore')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-lg border ${getLevelColor(result.level)} font-medium`}>
                    {result.level === 'excellent' ? t('levelExcellent') : result.level === 'good' ? t('levelGood') : result.level === 'average' ? t('levelAverage') : t('levelPoor')}
                  </div>
                  <div className="text-4xl font-bold text-near-black">
                    {result.totalScore}<span className="text-xl text-stone-gray">/100</span>
                  </div>
                </div>
              </div>

              {/* 维度得分 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(result.dimensionScores).map(([name, score], idx) => (
                  <div key={idx} className="bg-warm-sand rounded-lg p-4 border border-border-cream">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-charcoal-warm">{name === 'completeness' ? t('dimensionCompleteness') : 
                                 name === 'detail' ? t('dimensionDetail') : 
                                 name === 'compliance' ? t('dimensionCompliance') : 
                                 name === 'structure' ? t('dimensionStructure') : 
                                 name === 'innovation' ? t('dimensionInnovation') : name}</span>
                      <span className="text-sm font-bold text-near-black">{score.score}/{score.maxScore}</span>
                    </div>
                    <div className="w-full h-2 bg-border-cream rounded-full overflow-hidden">
                      <div
                        className="h-full bg-terracotta transition-all"
                        style={{ width: `${(score.score / score.maxScore) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {aiResult && (
                <div className="mt-6 p-4 bg-purple-50 border border-purple-100 rounded-lg">
                  <h4 className="text-sm font-semibold text-purple-800 mb-2">{t('aiAnalysisSummary')}</h4>
                  <p className="text-sm text-purple-700">{aiResult.analysis}</p>
                </div>
              )}
            </div>

            {/* 优化建议 */}
            <div className="bg-ivory rounded-xl border border-border-cream shadow-sm">
              <div className="border-b border-border-cream px-6 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-serif text-near-black">{t('suggestions')}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-stone-gray">{t('suggestionCount', { count: result.suggestions.length })}</span>
                    {result.suggestions.length > 0 && (
                      <button
                        className="px-4 py-2 primary-btn text-sm font-medium"
                        onClick={handleOptimizeAll}
                      >
                        {t('applyAllHighPriority')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {result.suggestions.length === 0 ? (
                  <div className="text-center py-8 text-stone-gray">
                    <div className="text-4xl mb-2">🎉</div>
                    <p>{t('noOptimizationNeeded')}</p>
                  </div>
                ) : (
                  result.suggestions.map((suggestion, idx) => (
                    <div key={idx} className="border border-border-cream rounded-lg p-4 hover:border-terracotta transition bg-parchment">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(suggestion.priority)}`}>
                            {getPriorityText(suggestion.priority)}
                          </span>
                          <h4 className="font-medium text-near-black">{suggestion.title}</h4>
                        </div>
                        {onApplySuggestion && (
                          <button
                            className="px-3 py-1 text-xs secondary-btn transition"
                            onClick={() => onApplySuggestion(suggestion)}
                          >
                            {t('apply')}
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-charcoal-warm mb-2">{suggestion.description}</p>
                      {suggestion.applyContent && (
                        <div className="bg-warm-sand rounded p-3 text-sm border border-border-cream">
                          <div className="text-stone-gray text-xs mb-1">{t('optimizationSuggestion')}</div>
                          <div className="text-near-black font-mono">{suggestion.applyContent}</div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </React.Fragment>
        )}
      </div>

      <AISettingsPanel
        visible={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </React.Fragment>
  )
}

export default EvaluationPanel
