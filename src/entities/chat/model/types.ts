import type { Message } from '@/entities/message/model/types'

export type Chat = {
  chatId: string
  phoneNumber: string
  title: string
  messages: Message[]
}
