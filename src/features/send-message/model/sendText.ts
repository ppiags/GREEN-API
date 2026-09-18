import type { GreenApiClient } from '@/shared/api/types'
import { MESSAGE_MAX_LENGTH } from '@/shared/config/constants'

export async function sendTextMessage(args: {
  client: GreenApiClient
  chatId: string
  text: string
}): Promise<{ idMessage: string; text: string }> {
  const text = args.text.trim()

  if (!text) {
    throw new Error('Введите сообщение')
  }

  if (text.length > MESSAGE_MAX_LENGTH) {
    throw new Error(`Сообщение длиннее ${MESSAGE_MAX_LENGTH} символов`)
  }

  const response = await args.client.sendMessage(args.chatId, text)

  return {
    idMessage: response.idMessage,
    text,
  }
}
