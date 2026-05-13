import type { ICard } from './Card.model'

export interface IPromptTemplate {
  id: string
  title: string
  description: string
  cards: ICard[]
  tags: string[]
  usageCount: number
  isFavorite: boolean
  createdAt: number
  updatedAt: number
  meta: Record<string, any>
}
