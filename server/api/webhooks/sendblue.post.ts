import { defineHandler } from 'nitro'
import { useBot } from '../../utils/bot.ts'

export default defineHandler(async (event) => {
  const { chat } = useBot()
  await chat.initialize()
  return await chat.webhooks.sendblue(event.req, {
    waitUntil: task => event.waitUntil(task),
  })
})
