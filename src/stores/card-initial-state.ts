import type { CardType, ICard } from '@/models/Card.model'

export interface IPage {
  id: string
  cards: ICard[]
}

export const DEFAULT_CARD_TYPES: CardType[] = [
  'timing',
  'subject',
  'action',
  'scene',
  'style',
  'camera',
  'lighting',
  'audio',
  'constraint'
]

const cardTitleMap: Record<CardType, string> = {
  timing: '时长',
  subject: '主体',
  action: '动作',
  scene: '场景',
  style: '风格',
  camera: '镜头',
  lighting: '灯光',
  audio: '音频',
  constraint: '约束',
  custom: '自定义'
}

const cardColorMap: Record<CardType, string> = {
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

export const getCardDefaultTitle = (type: CardType): string => cardTitleMap[type]

export const getCardColor = (type: CardType): string => cardColorMap[type]

export const createEmptyInitialCards = (timestamp = Date.now()): ICard[] =>
  DEFAULT_CARD_TYPES.map((type, index) => ({
    id: `${index + 1}`,
    type,
    title: getCardDefaultTitle(type),
    content: '',
    mode: 'edit',
    color: getCardColor(type),
    createdAt: timestamp,
    updatedAt: timestamp,
    meta: {}
  }))

export const createInitialPage = (timestamp = Date.now()): IPage => ({
  id: timestamp.toString(),
  cards: createEmptyInitialCards(timestamp)
})
