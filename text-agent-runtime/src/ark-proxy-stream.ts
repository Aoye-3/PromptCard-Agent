import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type SimpleStreamOptions
} from '@earendil-works/pi-ai'

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0
  }
}

export function createArkProxyStream(
  model: Model<any>,
  context: Context,
  options: SimpleStreamOptions | undefined
) {
  const stream = createAssistantMessageEventStream()
  queueMicrotask(async () => {
    try {
      const response = await fetch(`${requiredUrl('PROMPTCARD_GATEWAY_INTERNAL_URL')}/internal/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PromptCard-Internal-Token': requiredEnv('PROMPTCARD_INTERNAL_TOKEN')
        },
        body: JSON.stringify({
          model: model.id,
          systemPrompt: context.systemPrompt || '',
          messages: context.messages,
          tools: context.tools || [],
          temperature: options?.temperature,
          maxTokens: options?.maxTokens
        }),
        signal: options?.signal
      })
      if (!response.ok) {
        throw new Error(`Ark proxy returned ${response.status}`)
      }
      const payload = await response.json() as {
        content?: AssistantMessage['content']
        usage?: Partial<AssistantMessage['usage']>
        stopReason?: AssistantMessage['stopReason']
      }
      const message: AssistantMessage = {
        role: 'assistant',
        api: 'promptcard-ark-proxy',
        provider: 'promptcard-gateway',
        model: model.id,
        content: Array.isArray(payload.content) ? payload.content : [],
        usage: {
          ...EMPTY_USAGE,
          ...(payload.usage || {}),
          totalTokens:
            Number(payload.usage?.input || 0)
            + Number(payload.usage?.output || 0)
            + Number(payload.usage?.cacheRead || 0)
            + Number(payload.usage?.cacheWrite || 0)
        },
        stopReason: payload.stopReason || 'stop',
        timestamp: Date.now()
      }
      emitMessage(stream, message)
    } catch (error) {
      const message: AssistantMessage = {
        role: 'assistant',
        api: 'promptcard-ark-proxy',
        provider: 'promptcard-gateway',
        model: model.id,
        content: [],
        usage: EMPTY_USAGE,
        stopReason: options?.signal?.aborted ? 'aborted' : 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      }
      stream.push({
        type: 'error',
        reason: options?.signal?.aborted ? 'aborted' : 'error',
        error: message
      })
      stream.end(message)
    }
  })
  return stream
}

function emitMessage(stream: ReturnType<typeof createAssistantMessageEventStream>, message: AssistantMessage) {
  const partial: AssistantMessage = { ...message, content: [] }
  stream.push({ type: 'start', partial: { ...partial } })
  message.content.forEach((block, index) => {
    if (block.type === 'text') {
      partial.content = [...partial.content, { type: 'text', text: block.text }]
      stream.push({ type: 'text_start', contentIndex: index, partial: { ...partial } })
      stream.push({ type: 'text_delta', contentIndex: index, delta: block.text, partial: { ...partial } })
      stream.push({ type: 'text_end', contentIndex: index, content: block.text, partial: { ...partial } })
      return
    }
    if (block.type === 'toolCall') {
      partial.content = [...partial.content, block]
      stream.push({ type: 'toolcall_start', contentIndex: index, partial: { ...partial } })
      stream.push({
        type: 'toolcall_delta',
        contentIndex: index,
        delta: JSON.stringify(block.arguments),
        partial: { ...partial }
      })
      stream.push({ type: 'toolcall_end', contentIndex: index, toolCall: block, partial: { ...partial } })
    }
  })
  stream.push({ type: 'done', reason: message.stopReason === 'toolUse' ? 'toolUse' : 'stop', message })
  stream.end(message)
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function requiredUrl(name: string) {
  return requiredEnv(name).replace(/\/$/, '')
}
