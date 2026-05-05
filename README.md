# nitro-imessage-agent

A **durable** iMessage AI agent built on:

- [Nitro](https://nitro.build) v3 — the API server
- [Chat SDK](https://chat-sdk.dev) + [`chat-adapter-sendblue`](https://chat-sdk.dev/adapters/sendblue) — message routing over [Sendblue](https://sendblue.com)
- [Vercel AI SDK](https://sdk.vercel.ai) + [AI Gateway](https://vercel.com/docs/ai-gateway) — LLM replies, swap models with one constant
- [Vercel Workflow](https://useworkflow.dev) + `@workflow/ai`'s `DurableAgent` — durable agent loop, retryable steps, observability

A user texts your Sendblue number, Sendblue posts a webhook to this server, the Chat SDK dispatches the message, a workflow runs an agent (LLM + tools), and the final reply is sent back through Sendblue. Each step is retryable on its own, so a transient LLM error or send hiccup never drops the inbound message.

```
   ┌─────────┐    ┌──────────────┐    ┌──────────────┐   ┌────────────┐
   │ user    │───▶│   Sendblue   │───▶│  POST /api/  │──▶│ Chat SDK   │
   │iMessage │    │  (cloud)     │    │webhooks/...  │   │ onMention  │
   └─────────┘    └──────────────┘    └──────────────┘   └─────┬──────┘
        ▲                                                       │
        │                                                       ▼
        │                                           ┌────────────────────────┐
        │                                           │ workflow start(...)    │
        │                                           └───────────┬────────────┘
        │                                                       ▼
        │                                           ┌────────────────────────┐
        │                                           │ DurableAgent.stream()  │
        │                                           │  ├── LLM (AI Gateway)  │
        │                                           │  └── tools (use step)  │
        │                                           └───────────┬────────────┘
        │                                                       ▼
        │                                           ┌────────────────────────┐
        └───────────────────────────────────────────┤ postReply (use step)   │
                  Sendblue postMessage              │ sendblue.postMessage   │
                                                    └────────────────────────┘
```

## Architecture

The Sendblue cloud holds your dedicated phone line and forwards inbound iMessages to your server as HTTPS webhooks. Outbound replies go back through the same API. There is no gateway listener to keep alive, no Mac in production, and no cron.

The [server/api/webhooks/sendblue.post.ts](server/api/webhooks/sendblue.post.ts) route receives every webhook and hands it to `chat.webhooks.sendblue(request)`. The Chat SDK then fires `onNewMention` (first DM in a thread) or `onSubscribedMessage` (every following DM) on the bot — handlers registered in [server/plugins/imessage.ts](server/plugins/imessage.ts) call `start(replyToMessage, [thread.id, message.text])` to queue a workflow.

[workflows/reply.ts](workflows/reply.ts) is a `"use workflow"` function. Inside, a `DurableAgent` (`@workflow/ai/agent`) drives the LLM loop against the Vercel AI Gateway. Tools registered in [server/tools/](server/tools/) use `"use step"` so each tool call is a retryable, observable step. After the agent finishes, the final assistant text is sent through one more `"use step"` (`postReply`) that calls `sendblue.postMessage`.

## Local setup (development)

Sendblue is webhook-based, so to receive iMessages on your local machine you expose `localhost:3000` through a public tunnel — we use **ngrok**.

**Prerequisites**

- Node 20+ (use `corepack enable` to get pnpm)
- A Sendblue account with API credentials and a provisioned phone line ([sendblue.com/pricing](https://sendblue.com/pricing) — the AI Agent plan at $100/month/line includes webhooks)
- [ngrok](https://ngrok.com/download) installed and authenticated (`ngrok config add-authtoken <your-token>`)

**Install & run**

```bash
pnpm install
cp .env.example .env
# fill in AI_GATEWAY_API_KEY + SENDBLUE_API_KEY + SENDBLUE_API_SECRET +
# SENDBLUE_FROM_NUMBER + SENDBLUE_WEBHOOK_SECRET
pnpm dev
```

In a second terminal:

```bash
ngrok http 3000
```

Copy the `https://<id>.ngrok-free.app` URL ngrok prints, then in the [Sendblue dashboard](https://dashboard.sendblue.com/) set the inbound webhook URL to:

```
https://<id>.ngrok-free.app/api/webhooks/sendblue
```

**Test**

Text your Sendblue number from any phone. The dev server logs the inbound webhook, the workflow run starts, and a reply lands on your phone. Try `"what time is it in Paris?"` to validate the `getCurrentTime` tool path.

## Production setup

Sendblue runs in the cloud and just talks HTTP, so production is the same as local minus the tunnel:

1. Deploy this repo to [Vercel](https://vercel.com) (or any Node host that supports Nitro): `pnpm dlx vercel`.
2. Set the same five env vars in your hosting provider's environment settings (Vercel → Project → Settings → Environment Variables).
3. In the Sendblue dashboard, point the inbound webhook URL at your production deployment:

   ```
   https://<your-app>.vercel.app/api/webhooks/sendblue
   ```

That's it — no `vercel.json`, no cron, no Mac. The Vercel function spins up on each webhook and the Workflow runs durably in the background.

> **Why Sendblue and not Photon?** Photon's [Spectrum dashboard](https://app.photon.codes/) gives you a `Project ID` + `Secret Key` for the new `spectrum-ts` SDK, which is **not compatible** with `chat-adapter-imessage`. The latter still uses the older `@photon-ai/advanced-imessage-kit` Enterprise SDK, which requires negotiated `serverUrl` + `apiKey` credentials from Photon sales. Sendblue gives you a working dedicated US line, webhooks, and SMS fallback — self-serve and no KYC for A2P — which is the cleanest path to production today.

## Configuration reference

| Env var | Required | When |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | yes | Always. Auto-detected by the AI SDK (no `NITRO_` prefix). |
| `SENDBLUE_API_KEY` | yes | Always. Auto-detected by the adapter from process env. |
| `SENDBLUE_API_SECRET` | yes | Always. Auto-detected by the adapter. |
| `SENDBLUE_FROM_NUMBER` | yes | Your provisioned Sendblue line in E.164 format (e.g. `+14155551234`). |
| `SENDBLUE_WEBHOOK_SECRET` | recommended | If set in the Sendblue dashboard, the adapter validates every incoming webhook against it. Set the same value here. |

## Switching the model

Edit one constant in [workflows/reply.ts](workflows/reply.ts):

```ts
const MODEL = 'google/gemini-3-flash'
```

Any [supported AI Gateway slug](https://vercel.com/ai-gateway/models) works. A few useful ones:

- `google/gemini-3-flash`
- `anthropic/claude-sonnet-4.5`
- `openai/gpt-4o-mini`
- `xai/grok-4`

The AI SDK reads `AI_GATEWAY_API_KEY` from the environment automatically, so no provider plumbing is needed.

## Extending the agent

### Add a tool

Tools live in [server/tools/index.ts](server/tools/index.ts). Each tool is a `description` + `inputSchema` (zod) + `execute` function. The `"use step"` directive on the execute body makes every tool call a retryable, observable workflow step.

Example (from this repo):

```ts
import { z } from 'zod'

// eslint-disable-next-line require-await
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
    description: 'Get the current date and time in a specific IANA timezone…',
    inputSchema: z.object({
      timezone: z.string().describe('IANA timezone identifier'),
    }),
    execute: getCurrentTime,
  },
}
```

To add another tool, write a new step function and register it in the `tools` map. The agent picks it up automatically through `new DurableAgent({ tools })`.

### Change the system prompt

Edit `SYSTEM_PROMPT` in [workflows/reply.ts](workflows/reply.ts).

### Add a workflow step

Any function annotated with `"use step"` becomes a retryable, durable step. Wrap higher-level orchestration in a `"use workflow"` function and call steps from it. See [Workflows and steps](https://useworkflow.dev/docs/foundations/workflows-and-steps) for the full mental model. [workflows/reply.ts](workflows/reply.ts) is the canonical example: a `"use workflow"` function calling `DurableAgent.stream()` (which itself orchestrates LLM/tool steps) followed by a `postReply` step.

## Project layout

```
workflows/
  reply.ts                          # "use workflow" — DurableAgent + postReply step
server/
  api/
    index.ts                        # GET /api — health check
    webhooks/sendblue.post.ts       # POST /api/webhooks/sendblue — Sendblue inbound webhook
  plugins/imessage.ts               # Chat SDK handlers, queues the workflow on each DM
  tools/index.ts                    # tools registered with the DurableAgent
  utils/bot.ts                      # Chat instance + Sendblue adapter (singleton)
nitro.config.ts                     # registers `workflow/nitro`
```

## Observability

```bash
pnpm workflow:web         # local dashboard with run history, step retries, live logs
npx workflow inspect runs # CLI
```

In production on Vercel, runs show up automatically in the Vercel dashboard.

## Scripts

```sh
pnpm dev        # start the Nitro dev server
pnpm build      # build for production
pnpm preview    # preview the production build
pnpm lint       # eslint
pnpm test       # vitest
pnpm typecheck  # tsc --noEmit
```

## References

- [`chat-adapter-sendblue`](https://chat-sdk.dev/adapters/sendblue) — adapter docs
- [Sendblue docs](https://docs.sendblue.com) — API, webhooks, line provisioning
- [Sendblue pricing](https://sendblue.com/pricing)
- [Chat SDK docs](https://chat-sdk.dev)
- [Vercel Workflow](https://useworkflow.dev) — durable execution model
- [`DurableAgent` API](https://useworkflow.dev/docs/api-reference/workflow-ai/durable-agent)
- [Vercel AI SDK](https://sdk.vercel.ai)
- [AI Gateway models](https://vercel.com/ai-gateway/models)
- [Nitro](https://nitro.build)
- [ngrok](https://ngrok.com/download)

## License

[Apache 2.0](./LICENSE) — Made by [@HugoRCD](https://github.com/HugoRCD).
