import { Chat, type StateAdapter } from 'chat'
import { createSendblueAdapter, type SendblueAdapter } from 'chat-adapter-sendblue'
import { createMemoryState } from '@chat-adapter/state-memory'
import { createRedisState } from '@chat-adapter/state-redis'

interface Bot {
  chat: Chat
  sendblue: SendblueAdapter
}

let _bot: Bot | undefined

function resolveStateAdapter(): StateAdapter {
  const url = process.env.REDIS_URL ?? process.env.KV_URL
  if (url) return createRedisState({ url })
  return createMemoryState()
}

export function useBot(): Bot {
  if (_bot) return _bot

  const sendblue = createSendblueAdapter()

  const chat = new Chat({
    userName: 'imessage-agent',
    adapters: { sendblue },
    state: resolveStateAdapter(),
  })

  _bot = { chat, sendblue }
  return _bot
}
