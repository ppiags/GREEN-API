import type { Message } from '@/entities/message/model/types'

export type ClassifyResult =
  | { kind: 'incomingText'; message: Message }
  | { kind: 'irrelevant' }
  | { kind: 'processingError'; error: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function processingError(message: string): ClassifyResult {
  return { kind: 'processingError', error: new Error(message) }
}

function normalizeTimestamp(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
}

export function classifyNotification(body: unknown): ClassifyResult {
  if (!isRecord(body)) {
    return processingError('Notification body is not an object')
  }

  if (typeof body.typeWebhook !== 'string') {
    return processingError('Notification typeWebhook is missing')
  }

  if (body.typeWebhook !== 'incomingMessageReceived') {
    return { kind: 'irrelevant' }
  }

  if (!isRecord(body.messageData)) {
    return processingError('Incoming notification messageData is missing')
  }

  if (typeof body.messageData.typeMessage !== 'string') {
    return processingError('Incoming notification typeMessage is missing')
  }

  if (body.messageData.typeMessage !== 'textMessage') {
    return { kind: 'irrelevant' }
  }

  if (
    typeof body.idMessage !== 'string' ||
    typeof body.timestamp !== 'number' ||
    !isRecord(body.senderData) ||
    typeof body.senderData.chatId !== 'string' ||
    !isRecord(body.messageData.textMessageData) ||
    typeof body.messageData.textMessageData.textMessage !== 'string'
  ) {
    return processingError('Incoming text notification has invalid shape')
  }

  return {
    kind: 'incomingText',
    message: {
      idMessage: body.idMessage,
      chatId: body.senderData.chatId,
      text: body.messageData.textMessageData.textMessage,
      timestamp: normalizeTimestamp(body.timestamp),
      direction: 'incoming',
    },
  }
}
