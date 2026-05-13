import type { ICard } from './Card.model'

export interface IPromptHistory {
  id: string
  content: string
  cards: ICard[]
  score: number
  variants?: string[]
  createdAt: number
  meta: Record<string, any>
}
