export type Message = {
  idMessage: string
  chatId: string
  text: string
  timestamp: number
  direction: 'incoming' | 'outgoing'
}
