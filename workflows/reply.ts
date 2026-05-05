import { DurableAgent } from '@workflow/ai/agent'
import { getWritable } from 'workflow'
import type { ModelMessage, UIMessageChunk } from 'ai'
import { useBot } from '../server/utils/bot.ts'
import { tools } from '../server/tools/index.ts'

const MODEL = 'google/gemini-3-flash'
const SYSTEM_PROMPT = 'You are a friendly assistant texting back over iMessage. Keep replies short, casual, and plain text. No markdown.'

export async function replyToMessage(threadId: string, prompt: string): Promise<void> {
  'use workflow'

  const agent = new DurableAgent({
    model: MODEL,
    instructions: SYSTEM_PROMPT,
    tools,
  })

  const writable = getWritable<UIMessageChunk>()
  const { messages } = await agent.stream({
    messages: [{ role: 'user', content: prompt }],
    writable,
  })

  const text = extractFinalText(messages)
  if (text) await postReply(threadId, text)
}

async function postReply(threadId: string, text: string): Promise<void> {
  'use step'

  if (!text.trim()) return

  const { sendblue } = useBot()
  await sendblue.postMessage(threadId, text)
}

function extractFinalText(messages: ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== 'assistant') continue

    const { content } = message
    if (typeof content === 'string') return content

    return content
      .filter((part): part is { type: 'text', text: string } => part.type === 'text')
      .map(part => part.text)
      .join('')
  }

  return ''
}
