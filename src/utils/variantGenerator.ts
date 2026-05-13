import type { ICard } from '@/models/Card.model'
import { assemblePrompt } from './promptParser'

export type VariantType = 'detail' | 'style' | 'perspective' | 'emotion'

export interface GeneratedVariant {
  type: VariantType
  name: string
  prompt: string
  description: string
}

/**
 * 生成四类Prompt变体
 * @param cards 原始卡片数组
 * @param types 要生成的变体类型，默认生成全部四类
 * @returns 生成的变体数组
 */
export const generateVariants = (
  cards: ICard[], 
  types: VariantType[] = ['detail', 'style', 'perspective', 'emotion']
): GeneratedVariant[] => {
  const variants: GeneratedVariant[] = []
  const originalPrompt = assemblePrompt([{ cards }])

  if (types.includes('detail')) {
    variants.push(generateDetailVariant(originalPrompt))
  }

  if (types.includes('style')) {
    variants.push(generateStyleVariant(originalPrompt))
  }

  if (types.includes('perspective')) {
    variants.push(generatePerspectiveVariant(originalPrompt))
  }

  if (types.includes('emotion')) {
    variants.push(generateEmotionVariant(originalPrompt))
  }

  return variants
}

/**
 * 生成细节增强变体
 */
const generateDetailVariant = (original: string): GeneratedVariant => {
  let prompt = original
  
  // 给主体增加细节
  const detailAdditions = [
    { keyword: '人', addition: '皮肤纹理细腻，发丝清晰可见，表情自然生动' },
    { keyword: '动物', addition: '毛发根根分明，眼神灵动，动作自然流畅' },
    { keyword: '建筑', addition: '材质纹理清晰，光影层次丰富，细节精致' },
    { keyword: '风景', addition: '层次分明，前景中景远景过渡自然，光影细节丰富' }
  ]

  detailAdditions.forEach(item => {
    if (prompt.includes(item.keyword)) {
      prompt = prompt.replace(item.keyword, `${item.keyword}, ${item.addition}`)
    }
  })

  // 增加通用细节
  prompt += ', 8K超高清, 细节丰富, 高分辨率, 纹理清晰'

  return {
    type: 'detail',
    name: '细节增强',
    prompt,
    description: '增加更多细节描述，提升生成画质和真实感'
  }
}

/**
 * 生成风格变换变体
 */
const generateStyleVariant = (original: string): GeneratedVariant => {
  // 移除原有风格描述
  let prompt = original.replace(/(风格|画风|质感|动画|手绘|油画|卡通|3D|写实)[^,，。；;]+/g, '').trim()
  
  // 随机选择一种新风格
  const styles = [
    '宫崎骏动画风格，色彩明亮温暖，笔触细腻',
    '赛博朋克风格，霓虹灯光，未来科技感，高对比度',
    '中国风水墨风格，写意，淡彩，意境悠远',
    '复古胶片风格，颗粒感，暖色调，怀旧氛围',
    '3D渲染风格，皮克斯动画质感，光影真实',
    '油画风格，笔触明显，色彩浓郁，艺术感强'
  ]
  
  const randomStyle = styles[Math.floor(Math.random() * styles.length)]
  prompt += `, ${randomStyle}`

  return {
    type: 'style',
    name: '风格变换',
    prompt,
    description: '更换不同的艺术风格，尝试多样化的视觉效果'
  }
}

/**
 * 生成视角调整变体
 */
const generatePerspectiveVariant = (original: string): GeneratedVariant => {
  // 移除原有镜头描述
  let prompt = original.replace(/(镜头|视角|拍摄|特写|全景|中景|跟拍|航拍)[^,，。；;]+/g, '').trim()
  
  // 随机选择一种新视角
  const perspectives = [
    '第一人称视角，沉浸式体验',
    '无人机航拍视角，上帝视角，全景展示',
    '低角度仰拍，显得主体高大有气势',
    '鱼眼镜头效果，夸张变形，视觉冲击力强',
    '特写镜头，聚焦主体细节，背景虚化',
    '长镜头慢动作，动态模糊，运动感十足'
  ]
  
  const randomPerspective = perspectives[Math.floor(Math.random() * perspectives.length)]
  prompt += `, ${randomPerspective}`

  return {
    type: 'perspective',
    name: '视角调整',
    prompt,
    description: '更换不同的拍摄视角，带来完全不同的视觉感受'
  }
}

/**
 * 生成情感强化变体
 */
const generateEmotionVariant = (original: string): GeneratedVariant => {
  // 随机选择一种情感基调
  const emotions = [
    { name: '温馨治愈', addition: '整体色调温暖柔和，光线柔和，氛围舒适治愈，给人温暖的感觉' },
    { name: '紧张刺激', addition: '高对比度，明暗对比强烈，节奏紧张，充满动感和冲击力' },
    { name: '史诗宏大', addition: '宏大叙事感，场景壮观，气势磅礴，史诗级背景音乐氛围' },
    { name: '唯美浪漫', addition: '柔和的光线，梦幻的色调，唯美浪漫的氛围，柔焦效果' },
    { name: '暗黑悬疑', addition: '低饱和度色调，阴影浓重，氛围神秘悬疑，暗黑色系' },
    { name: '清新明亮', addition: '明亮的色调，高曝光，清新自然，阳光充足，充满活力' }
  ]
  
  const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)]
  const prompt = `${original}, ${randomEmotion.addition}`

  return {
    type: 'emotion',
    name: '情感强化',
    prompt,
    description: `强化${randomEmotion.name}的情感氛围，突出整体情绪表达`
  }
}
