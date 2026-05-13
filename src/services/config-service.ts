import type { AIConfig } from './ai-service'
import { defaultAIConfig } from './ai-service'

// 配置存储key
const CONFIG_STORAGE_KEY = 'prompt_card_config'
const API_KEY_ENCRYPTION_SALT = 'prompt_card_2024'

// 全局配置类型
export interface AppConfig {
  ai: AIConfig
  theme: 'light' | 'dark' | 'auto'
  defaultMode: 'learn' | 'creative' | 'evaluate'
  autoSave: boolean
  presetSort: 'usage' | 'name' | 'time'
}

// 默认配置
const defaultConfig: AppConfig = {
  ai: defaultAIConfig,
  theme: 'auto',
  defaultMode: 'learn',
  autoSave: true,
  presetSort: 'usage'
}

// 简单的加密解密函数，避免API密钥明文存储
const encrypt = (text: string): string => {
  if (!text) return ''
  const textToChars = (text: string) => text.split('').map(c => c.charCodeAt(0))
  const byteHex = (n: number) => ('0' + Number(n).toString(16)).substr(-2)
  const applySaltToChar = (code: number) => textToChars(API_KEY_ENCRYPTION_SALT).reduce((a, b) => a ^ b, code)
  return text.split('').map(textToChars).map(c => c.map(applySaltToChar).map(byteHex).join('')).join('')
}

const decrypt = (encrypted: string): string => {
  if (!encrypted) return ''
  const hexToBytes = (hex: string) => {
    const bytes: number[] = []
    for (let c = 0; c < hex.length; c += 2) {
      bytes.push(parseInt(hex.substr(c, 2), 16))
    }
    return bytes
  }
  const applySaltToChar = (code: number) => {
    return API_KEY_ENCRYPTION_SALT.split('').map(c => c.charCodeAt(0)).reduce((a, b) => a ^ b, code)
  }
  return hexToBytes(encrypted).map(applySaltToChar).map(c => String.fromCharCode(c)).join('')
}

// 配置服务
export class ConfigService {
  // 加载配置
  static loadConfig(): AppConfig {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (!saved) {
        return defaultConfig
      }
      const parsed = JSON.parse(saved) as Partial<AppConfig>
      
      // 解密API密钥
      if (parsed.ai?.apiKey) {
        parsed.ai.apiKey = decrypt(parsed.ai.apiKey)
      }

      // 合并默认配置，保证兼容性
      return {
        ...defaultConfig,
        ...parsed,
        ai: {
          ...defaultConfig.ai,
          ...parsed.ai
        }
      }
    } catch (e) {
      console.error('加载配置失败:', e)
      return defaultConfig
    }
  }

  // 保存配置
  static saveConfig(config: Partial<AppConfig>): void {
    try {
      const current = this.loadConfig()
      const toSave = { ...current, ...config }
      
      // 加密API密钥
      if (toSave.ai.apiKey) {
        toSave.ai.apiKey = encrypt(toSave.ai.apiKey)
      }

      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(toSave))
    } catch (e) {
      console.error('保存配置失败:', e)
      throw new Error('保存配置失败')
    }
  }

  // 更新AI配置
  static saveAIConfig(aiConfig: Partial<AIConfig>): void {
    const current = this.loadConfig()
    this.saveConfig({
      ai: {
        ...current.ai,
        ...aiConfig
      }
    })
  }

  // 切换AI增强模式开关
  static toggleAIEnabled(enabled: boolean): void {
    this.saveAIConfig({ enabled })
  }

  // 清除敏感数据
  static clearSensitiveData(): void {
    this.saveAIConfig({ apiKey: '' })
  }

  // 重置配置到默认
  static resetConfig(): void {
    localStorage.removeItem(CONFIG_STORAGE_KEY)
  }
}

// 全局配置实例，加载时初始化
export const appConfig = ConfigService.loadConfig()