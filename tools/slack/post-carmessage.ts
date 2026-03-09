import { app as slackApp } from './slack-bot-app.js'
import { createAttachments } from './create-attachments.js'
import type { CarWithType } from '../types.js'
import slackChannels from '../../generated/slack-config.json'

interface PostResult {
  carName: string
  ts?: string
}

export function getChannelId(startArea: string, returnArea: string): string | undefined {
  return slackChannels.channels[`${startArea}_${returnArea}` as keyof typeof slackChannels.channels] ?? (slackChannels.other || undefined)
}

export async function postCarMessage(car: CarWithType): Promise<PostResult | null> {
  const messageChannelId = getChannelId(car.startArea, car.returnArea)

  if (!messageChannelId) return null

  // 売切れ → スタンプ追加のみ
  if (car.type == 'soldOut') {
    if (car.ts) {
      await slackApp.client.reactions.add({
        channel: messageChannelId,
        name: 'sold_out',
        timestamp: car.ts,
      })
    }
    return null
  }

  const isThreadReply = (car.type == 'recovered' || car.type == 'updated') && car.ts
  const result = await slackApp.client.chat.postMessage({
    channel: messageChannelId,
    attachments: [createAttachments(car)],
    ...(isThreadReply
      ? { thread_ts: car.ts, reply_broadcast: true }
      : {}),
  } as Parameters<typeof slackApp.client.chat.postMessage>[0])

  if (car.type == 'new') {
    return { carName: car.carName, ts: result.ts ?? undefined }
  }

  if (car.type == 'recovered' && car.ts) {
    await slackApp.client.reactions.remove({
      channel: messageChannelId,
      name: 'sold_out',
      timestamp: car.ts,
    })
  }

  return null
}
