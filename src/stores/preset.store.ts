import { create } from 'zustand'
import type { IPreset, ICard } from '@/models/Card.model'
import { storage } from '@/utils/storage'
import { VIDPROM_PRESET_OPTIONS } from '@/knowledge/vidprom-preset-options'
import { reorderPresetsByCategory, type PresetReorderType } from './preset-order'

interface PresetState {
  presets: IPreset[]
  loading: boolean
  initialized: boolean
  init: () => Promise<void>
  getByType: (type: ICard['type']) => IPreset[]
  addPreset: (preset: Omit<IPreset, 'id' | 'usageCount' | 'meta'>) => Promise<void>
  updatePreset: (id: string, updates: Partial<IPreset>) => Promise<void> // 新增
  deletePreset: (id: string) => Promise<void> // 新增
  reorderPresets: (activeType: PresetReorderType, orderedIds: string[]) => Promise<void>
  incrementUsage: (id: string) => Promise<void>
  searchPresets: (searchTerm: string) => IPreset[]
}

// 默认预制数据
const defaultPresets: Omit<IPreset, 'id' | 'usageCount'>[] = [
  // 主体类
  { type: 'subject', category: 'scene', label: '年轻女孩', content: '18岁的亚洲女孩，黑色长发，穿着白色连衣裙，笑容甜美，皮肤白皙', meta: {} },
  { type: 'subject', category: 'scene', label: '帅气男孩', content: '20岁的年轻男孩，短发，穿着牛仔外套，阳光帅气，眼神明亮', meta: {} },
  { type: 'subject', category: 'scene', label: '金毛犬', content: '成年金毛寻回犬，金色毛发，吐着舌头，开心的表情，耳朵耷拉着', meta: {} },
  { type: 'subject', category: 'scene', label: '猫咪', content: '英短蓝猫，圆滚滚的，坐在沙发上，瞪着大眼睛，表情傲娇', meta: {} },
  
  // 动作类
  { type: 'action', category: 'scene', label: '奔跑', content: '快速向前奔跑，头发随风飘动，脸上带着开心的笑容，充满活力', meta: {} },
  { type: 'action', category: 'scene', label: '跳跃', content: '向上高高跳起，四肢舒展，身体腾空，表情兴奋', meta: {} },
  { type: 'action', category: 'scene', label: '跳舞', content: '动感的舞蹈动作，身体随着音乐节奏摇摆，充满韵律感', meta: {} },
  
  // 场景类
  { type: 'scene', category: 'scene', label: '公园', content: '春天的公园，绿草如茵，樱花盛开，阳光透过树叶洒下斑驳的光影', meta: {} },
  { type: 'scene', category: 'scene', label: '海边', content: '夏日的海边，蓝色的大海，白色的浪花，金色的沙滩，蓝天白云', meta: {} },
  { type: 'scene', category: 'scene', label: '城市夜景', content: '繁华的城市夜景，霓虹闪烁，车水马龙，高楼林立，灯火辉煌', meta: {} },
  { type: 'scene', category: 'scene', label: '雪山', content: '巍峨的雪山，白雪皑皑，蓝天映衬，阳光照射在雪面上闪闪发光', meta: {} },
  
  // 风格类
  { type: 'style', category: 'style', label: '宫崎骏动画', content: '宫崎骏动画风格，色彩明亮温暖，笔触细腻，充满治愈感', meta: {} },
  { type: 'style', category: 'style', label: '赛博朋克', content: '赛博朋克风格，霓虹灯光，未来科技感，高对比度，暗色调', meta: {} },
  { type: 'style', category: 'style', label: '中国风水墨', content: '中国风水墨画风格，写意，淡彩，意境悠远，笔触流畅', meta: {} },
  { type: 'style', category: 'style', label: '3D渲染', content: '3D渲染风格，皮克斯动画质感，光影真实，材质细腻', meta: {} },
  { type: 'style', category: 'style', label: '复古胶片', content: '复古胶片风格，颗粒感，暖色调，怀旧氛围，轻微漏光效果', meta: {} },
  
  // 镜头类
  { type: 'camera', category: 'lens', label: '特写', content: '特写镜头，聚焦主体面部，背景虚化，突出细节', meta: {} },
  { type: 'camera', category: 'lens', label: '全景', content: '全景镜头，展示完整场景，视野开阔，包含环境信息', meta: {} },
  { type: 'camera', category: 'lens', label: '航拍', content: '无人机航拍视角，上帝视角，俯瞰整个场景，气势宏大', meta: {} },
  { type: 'camera', category: 'lens', label: '低角度', content: '低角度仰拍，显得主体高大有气势，视觉冲击力强', meta: {} },
  
  // 灯光类
  { type: 'lighting', category: 'lens', label: '自然光', content: '柔和的自然光线，明亮均匀，阴影柔和，真实自然', meta: {} },
  { type: 'lighting', category: 'lens', label: '黄金小时', content: '黄金时刻的光线，暖黄色调，柔和温暖，光影层次丰富', meta: {} },
  { type: 'lighting', category: 'lens', label: '霓虹灯光', content: '彩色霓虹灯光，赛博朋克风格，高对比度，光影绚烂', meta: {} },
  
  // 时序/时长类
  { type: 'timing', category: 'lens', label: '0-4秒', content: '00:00-00:04', meta: {} },
  { type: 'timing', category: 'lens', label: '4-8秒', content: '00:04-00:08', meta: {} },
  { type: 'timing', category: 'lens', label: '8-12秒', content: '00:08-00:12', meta: {} },
  { type: 'timing', category: 'lens', label: '12-16秒', content: '00:12-00:16', meta: {} },
  { type: 'timing', category: 'lens', label: '16-20秒', content: '00:16-00:20', meta: {} },
  { type: 'timing', category: 'lens', label: '20秒总时长', content: '总时长20秒，前5秒特写，中间10秒动作，最后5秒全景展示，节奏舒缓', meta: {} },
  { type: 'timing', category: 'lens', label: '15秒慢动作', content: '15秒，慢动作效果，动作放慢2倍', meta: {} },
  { type: 'timing', category: 'lens', label: '5秒快节奏', content: '5秒，快节奏剪辑，动感十足', meta: {} },
  
  // 约束类
  { type: 'constraint', category: 'scene', label: '高清画质', content: '8K超高清，高分辨率，细节丰富，纹理清晰，画质优秀', meta: {} },
  { type: 'constraint', category: 'scene', label: '无畸形', content: '人物结构正常，无畸形手，无畸形五官，比例协调，自然真实', meta: {} }
]

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [],
  loading: false,
  initialized: false,

  init: async () => {
    if (get().initialized || get().loading) return

    set({ loading: true })
    try {
      // 首先尝试从本地存储加载数据
      let presets = await storage.presets.getAll()
      
      // 如果本地存储为空，则创建默认数据
      if (presets.length === 0) {
        presets = defaultPresets.map((p, index) => ({
          ...p,
          id: `preset-${index}`,
          usageCount: 0
        }))
        
        // 添加 VidProM 数据集的预制选项
        let vidpromPresetCount = defaultPresets.length
        for (const [, options] of Object.entries(VIDPROM_PRESET_OPTIONS)) {
          options.forEach(option => {
            presets.push({
              ...option,
              id: `vidprom-preset-${vidpromPresetCount++}`,
              usageCount: 0,
              meta: option.meta || {}
            })
          })
        }
        
        await storage.presets.saveAll(presets)
      }
      
      set({ presets, initialized: true })
    } catch (e) {
      console.error('加载预制数据失败:', e)
      set({ initialized: true })
    } finally {
      set({ loading: false })
    }
  },

  getByType: (type: ICard['type']) => {
    return get().presets.filter(p => p.type === type)
  },

  addPreset: async (preset) => {
    const newPreset: IPreset = {
      ...preset,
      id: `preset-${Date.now()}`,
      usageCount: 0,
      meta: {}
    }
    const updated = [...get().presets, newPreset]
    set({ presets: updated })
    await storage.presets.saveAll(updated)
  },

  // 新增更新方法
  updatePreset: async (id, updates) => {
    const updated = get().presets.map(p => 
      p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
    )
    set({ presets: updated })
    await storage.presets.saveAll(updated)
  },

  // 新增删除方法
  deletePreset: async (id) => {
    const updated = get().presets.filter(p => p.id !== id)
    set({ presets: updated })
    await storage.presets.saveAll(updated)
  },

  reorderPresets: async (activeType, orderedIds) => {
    const updated = reorderPresetsByCategory(get().presets, activeType, orderedIds)
    set({ presets: updated })
    await storage.presets.saveAll(updated)
  },

  incrementUsage: async (id: string) => {
    const updated = get().presets.map(p => 
      p.id === id ? { ...p, usageCount: p.usageCount + 1 } : p
    )
    set({ presets: updated })
    await storage.presets.saveAll(updated)
  },

  searchPresets: (searchTerm: string) => {
    return get().presets.filter(p => 
      p.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.content.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }
}))
