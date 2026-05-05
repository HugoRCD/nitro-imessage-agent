import { z } from 'zod'

async function getCurrentTime({ timezone }: { timezone: string }): Promise<string> {
  'use step'

  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(new Date())
}

export const tools = {
  getCurrentTime: {
    description: 'Get the current date and time in a specific IANA timezone (e.g. "Europe/Paris"). Use when the user asks what time it is.',
    inputSchema: z.object({
      timezone: z.string().describe('IANA timezone identifier'),
    }),
    execute: getCurrentTime,
  },
}
