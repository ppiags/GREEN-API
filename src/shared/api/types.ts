export type InstanceCredentials = {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export type InstanceState =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'starting'
  | 'suspended'
  | 'pendingPassword'

export type GreenApiSettings = {
  incomingWebhook: string
  webhookUrl: string
  [key: string]: unknown
}

export type CheckAccountResponse = {
  exist: boolean
  chatId: string
  fromCache: boolean
}

export type SendMessageResponse = {
  idMessage: string
}

export type ReceiveNotificationResponse = {
  receiptId: number
  body: unknown
}

export type DeleteNotificationResponse = {
  result: boolean
}

export type GreenApiClient = {
  getStateInstance(): Promise<{ stateInstance: InstanceState }>
  getSettings(): Promise<GreenApiSettings>
  checkAccount(phoneNumber: number): Promise<CheckAccountResponse>
  sendMessage(chatId: string, message: string): Promise<SendMessageResponse>
  receiveNotification(
    receiveTimeoutSec?: number,
    signal?: AbortSignal,
  ): Promise<ReceiveNotificationResponse | null>
  deleteNotification(
    receiptId: number,
    signal?: AbortSignal,
  ): Promise<DeleteNotificationResponse>
}
