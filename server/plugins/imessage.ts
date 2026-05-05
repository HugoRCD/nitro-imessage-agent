import { definePlugin } from 'nitro'
import { start } from 'workflow/api'
import { useBot } from '../utils/bot.ts'
import { replyToMessage } from '../../workflows/reply.ts'

export default definePlugin(() => {
  const { chat } = useBot()

  chat.onNewMention(async (thread, message) => {
    await thread.subscribe()
    if (message.text?.trim()) {
      await start(replyToMessage, [thread.id, message.text])
    }
  })

  chat.onSubscribedMessage(async (thread, message) => {
    if (message.text?.trim()) {
      await start(replyToMessage, [thread.id, message.text])
    }
  })
})
