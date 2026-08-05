export interface CanvasAgentAttachment {
  nodeId: string
  role: 'target' | 'reference'
}

export type CanvasAgentComposerPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; nodeId: string; label: string }

export const attachCanvasAgentNode = (
  current: CanvasAgentAttachment[],
  nodeId: string,
  role: CanvasAgentAttachment['role']
): CanvasAgentAttachment[] => {
  const existing = current.find(attachment => attachment.nodeId === nodeId)
  if (!existing && current.length >= 10) return current
  const withoutNode = current.filter(attachment => attachment.nodeId !== nodeId)
  if (role === 'target') {
    return [
      { nodeId, role: 'target' },
      ...withoutNode.map(attachment => ({ ...attachment, role: 'reference' as const }))
    ]
  }
  return [
    ...withoutNode.filter(attachment => attachment.role === 'target'),
    ...withoutNode.filter(attachment => attachment.role === 'reference'),
    { nodeId, role: 'reference' }
  ]
}

export const removeCanvasAgentNode = (
  current: CanvasAgentAttachment[],
  nodeId: string
): CanvasAgentAttachment[] => current.filter(attachment => attachment.nodeId !== nodeId)

export const clearCanvasAgentTarget = (
  current: CanvasAgentAttachment[]
): CanvasAgentAttachment[] => current.map(attachment => (
  attachment.role === 'target'
    ? { ...attachment, role: 'reference' as const }
    : attachment
))

export const serializeCanvasAgentComposer = (parts: CanvasAgentComposerPart[]) => {
  const mentions: Array<{ nodeId: string; label: string }> = []
  const content = parts.map(part => {
    if (part.type === 'text') return part.text
    mentions.push({ nodeId: part.nodeId, label: part.label })
    return `@${part.label}`
  }).join('').trim()
  return { content, mentions }
}
