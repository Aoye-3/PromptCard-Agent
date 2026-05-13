
import React, { useState } from 'react'
import { ConfigService, appConfig } from '@/services/config-service'
import type { AIConfig } from '@/services/ai-service'
import { X, Check, AlertCircle, Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n'

interface AISettingsPanelProps {
  visible: boolean
  onClose: () => void
}

const AISettingsPanel: React.FC<AISettingsPanelProps> = ({ visible, onClose }) => {
  const { t } = useI18n()
  // 表单状态
  const [form, setForm] = useState<AIConfig>(appConfig.ai)
  // 保存状态
  const [saving, setSaving] = useState(false)
  // 测试状态
  const [testing, setTesting] = useState(false)
  // 测试结果
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // 服务商选项
  const providerOptions = [
    { value: 'openai', label: 'OpenAI', defaultBase: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
    { value: 'deepseek', label: 'DeepSeek', defaultBase: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
    { value: 'tongyi', label: '通义千问', defaultBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus' },
    { value: 'ernie', label: '文心一言', defaultBase: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', defaultModel: 'ernie-3.5-4k-0205' },
    { value: 'local', label: '本地开源模型', defaultBase: 'http://localhost:1234/v1', defaultModel: 'llama3' }
  ]

  // 切换服务商时自动填充默认值
  const handleProviderChange = (provider: AIConfig['provider']) => {
    const option = providerOptions.find(o => o.value === provider)
    if (option) {
      setForm(prev => ({
        ...prev,
        provider,
        apiBase: option.defaultBase,
        modelName: option.defaultModel
      }))
    }
  }

  // 保存配置
  const handleSave = async () => {
    setSaving(true)
    try {
      ConfigService.saveAIConfig(form)
      setTestResult(null)
      alert(t('configSaved'))
    } catch (e) {
      alert(t('configSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  // 测试API连接
  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // 调用模型列表接口测试连接
      const response = await fetch(`${form.apiBase}/models`, {
        headers: {
          'Authorization': `Bearer ${form.apiKey}`
        }
      })
      if (response.ok) {
        setTestResult({
          success: true,
          message: t('connectionSuccess')
        })
      } else {
        setTestResult({
          success: false,
          message: t('connectionFailed', { message: response.statusText })
        })
      }
    } catch (e) {
      setTestResult({
        success: false,
        message: t('connectionFailed', { message: (e as Error).message })
      })
    } finally {
      setTesting(false)
    }
  }

  // 重置为默认配置
  const handleReset = () => {
    if (confirm(t('resetConfirm'))) {
      const defaultAI = appConfig.ai
      setForm(defaultAI)
      ConfigService.saveAIConfig(defaultAI)
      setTestResult(null)
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-ivory rounded-xl w-[600px] max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-border-cream px-6 py-4">
          <h3 className="text-xl font-serif text-near-black flex items-center gap-2">
            <span>🤖</span> {t('aiEnhancedSettings')}
          </h3>
          <button
            className="text-stone-gray hover:text-near-black transition"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-6 space-y-6">
          {/* 启用开关 */}
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-near-black">{t('enableAiEvaluation')}</h4>
              <p className="text-sm text-stone-gray mt-1">{t('aiEvaluationDescription')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-border-cream peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-terracotta rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-warm after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-terracotta"></div>
            </label>
          </div>

          {/* 服务商选择 */}
          <div>
            <label className="block text-sm font-medium text-charcoal-warm mb-2">{t('aiProvider')}</label>
            <select
              value={form.provider}
              onChange={e => handleProviderChange(e.target.value as AIConfig['provider'])}
              className="w-full px-3 py-2 border border-border-warm rounded-lg focus:ring-2 focus:ring-terracotta focus:border-terracotta outline-none bg-parchment"
            >
              {providerOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* API地址 */}
          <div>
            <label className="block text-sm font-medium text-charcoal-warm mb-2">{t('apiBase')}</label>
            <input
              type="text"
              value={form.apiBase}
              onChange={e => setForm(prev => ({ ...prev, apiBase: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 border border-border-warm rounded-lg focus:ring-2 focus:ring-terracotta focus:border-terracotta outline-none bg-parchment"
            />
          </div>

          {/* API密钥 */}
          <div>
            <label className="block text-sm font-medium text-charcoal-warm mb-2">{t('apiKey')}</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-border-warm rounded-lg focus:ring-2 focus:ring-terracotta focus:border-terracotta outline-none bg-parchment"
            />
            <p className="text-xs text-stone-gray mt-1">
              {t('apiKeyHint')}
            </p>
          </div>

          {/* 模型名称 */}
          <div>
            <label className="block text-sm font-medium text-charcoal-warm mb-2">{t('modelName')}</label>
            <input
              type="text"
              value={form.modelName}
              onChange={e => setForm(prev => ({ ...prev, modelName: e.target.value }))}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 border border-border-warm rounded-lg focus:ring-2 focus:ring-terracotta focus:border-terracotta outline-none bg-parchment"
            />
          </div>

          {/* 高级设置 */}
          <div className="border-t border-border-cream pt-4">
            <h4 className="font-medium text-near-black mb-4">{t('advancedSettings')}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-charcoal-warm mb-2">{t('maxTokens')}</label>
                <input
                  type="number"
                  value={form.maxTokens}
                  onChange={e => setForm(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                  min="100"
                  max="8000"
                  step="100"
                  className="w-full px-3 py-2 border border-border-warm rounded-lg focus:ring-2 focus:ring-terracotta focus:border-terracotta outline-none bg-parchment"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal-warm mb-2">{t('temperature')}</label>
                <input
                  type="number"
                  value={form.temperature}
                  onChange={e => setForm(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                  min="0"
                  max="1"
                  step="0.1"
                  className="w-full px-3 py-2 border border-border-warm rounded-lg focus:ring-2 focus:ring-terracotta focus:border-terracotta outline-none bg-parchment"
                />
                <p className="text-xs text-stone-gray mt-1">{t('temperatureHint')}</p>
              </div>
            </div>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                testResult.success ? 'bg-warm-sand text-coral border border-border-warm' : 'bg-warm-sand text-error-crimson border border-border-warm'
              }`}
            >
              {testResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
              {testResult.message}
            </div>
          )}

          {/* 隐私提示 */}
          <div className="bg-warm-sand border border-border-cream rounded-lg p-4 text-sm text-charcoal-warm">
            <h5 className="font-medium mb-2 flex items-center gap-1">
              <span>🔒</span> {t('privacyTitle')}
            </h5>
            <ul className="space-y-1 text-xs">
              <li>{t('privacyLocalConfig')}</li>
              <li>{t('privacyEncryptedKey')}</li>
              <li>{t('privacyDirectRequest')}</li>
              <li>{t('privacyPromptPrivate')}</li>
            </ul>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between border-t border-border-cream px-6 py-4">
          <button
            className="px-4 py-2 text-stone-gray hover:text-charcoal-warm font-medium transition"
            onClick={handleReset}
          >
            {t('resetDefault')}
          </button>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 bg-warm-sand hover:bg-border-warm rounded-lg text-charcoal-warm font-medium transition flex items-center gap-2"
              onClick={handleTestConnection}
              disabled={testing || !form.apiKey}
            >
              {testing ? <Loader2 size={16} className="animate-spin" /> : null}
              {t('testConnection')}
            </button>
            <button
              className="px-4 py-2 primary-btn font-medium transition flex items-center gap-2"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {t('saveConfig')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AISettingsPanel
