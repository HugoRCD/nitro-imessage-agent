import { Chat } from 'chat'
import { createSendblueAdapter, type SendblueAdapter } from 'chat-adapter-sendblue'
import { createMemoryState } from '@chat-adapter/state-memory'

interface Bot {
  chat: Chat
  sendblue: SendblueAdapter
}

let _bot: Bot | undefined

export function useBot(): Bot {
  if (_bot) return _bot

  const sendblue = createSendblueAdapter()

  const chat = new Chat({
    userName: 'imessage-agent',
    adapters: { sendblue },
    state: createMemoryState(),
  })

  _bot = { chat, sendblue }
  return _bot
}
