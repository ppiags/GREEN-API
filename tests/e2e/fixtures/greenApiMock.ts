import type { Page, Route } from '@playwright/test'

export const testCredentials = {
  apiUrl: 'https://api.green-api.example',
  idInstance: 'idInstance',
  apiTokenInstance: 'apiTokenInstance',
}

export const testPhone = '79991234567'
export const testChatId = `${testPhone}@c.us`

type InstanceState =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'starting'
  | 'suspended'
  | 'pendingPassword'

type ReceiveNotification = {
  receiptId: number
  body: unknown
}

type MockOptions = {
  stateInstance?: InstanceState
  accountExists?: boolean
  sendStatus?: number
}

type MockCounters = {
  getStateInstance: number
  getSettings: number
  checkAccount: number
  sendMessage: number
  receiveNotification: number
  deleteNotification: number
}

export type GreenApiMock = {
  counters: MockCounters
  checkAccountBodies: unknown[]
  sendMessageBodies: unknown[]
  pendingReceiveCount(): number
  enqueueIncoming(input?: Partial<{ idMessage: string; text: string; chatId: string }>): void
  enqueueIrrelevant(): void
  setAccountExists(accountExists: boolean): void
  setSendStatus(sendStatus: number): void
}

const defaultSettings = {
  incomingWebhook: 'yes',
  webhookUrl: '',
}

function methodNameFromRoute(route: Route): string {
  const url = new URL(route.request().url())
  const [, methodName = ''] = url.pathname.match(/\/waInstance[^/]+\/([^/]+)/) ?? []

  return methodName
}

function incomingNotification(
  receiptId: number,
  input: Partial<{ idMessage: string; text: string; chatId: string }> = {},
): ReceiveNotification {
  return {
    receiptId,
    body: {
      typeWebhook: 'incomingMessageReceived',
      idMessage: input.idMessage ?? 'incoming-id',
      timestamp: 1_710_000_000,
      senderData: {
        chatId: input.chatId ?? testChatId,
      },
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: {
          textMessage: input.text ?? 'Ответ',
        },
      },
    },
  }
}

function irrelevantNotification(receiptId: number): ReceiveNotification {
  return {
    receiptId,
    body: {
      typeWebhook: 'outgoingMessageStatus',
    },
  }
}

export async function setupGreenApiMock(
  page: Page,
  options: MockOptions = {},
): Promise<GreenApiMock> {
  const stateInstance = options.stateInstance ?? 'authorized'
  let accountExists = options.accountExists ?? true
  let sendStatus = options.sendStatus ?? 200
  let nextReceiptId = 100
  let nextOutgoingId = 1
  const receiveQueue: ReceiveNotification[] = []
  const pendingReceives: Route[] = []
  const counters: MockCounters = {
    getStateInstance: 0,
    getSettings: 0,
    checkAccount: 0,
    sendMessage: 0,
    receiveNotification: 0,
    deleteNotification: 0,
  }
  const checkAccountBodies: unknown[] = []
  const sendMessageBodies: unknown[] = []

  const drainPendingReceives = () => {
    while (pendingReceives.length > 0 && receiveQueue.length > 0) {
      const pending = pendingReceives.shift()
      const notification = receiveQueue.shift()

      if (!pending || !notification) {
        return
      }

      void pending.fulfill({ json: notification }).catch(() => {
        receiveQueue.unshift(notification)
      })
    }
  }

  const enqueue = (notification: ReceiveNotification) => {
    receiveQueue.push(notification)
    drainPendingReceives()
  }

  await page.route('**/*waInstance*/**', async (route) => {
    const methodName = methodNameFromRoute(route)

    if (methodName === 'getStateInstance') {
      counters.getStateInstance += 1
      await route.fulfill({ json: { stateInstance } })
      return
    }

    if (methodName === 'getSettings') {
      counters.getSettings += 1
      await route.fulfill({ json: defaultSettings })
      return
    }

    if (methodName === 'checkAccount') {
      counters.checkAccount += 1
      const body = route.request().postDataJSON()
      checkAccountBodies.push(body)
      const phoneNumber = String((body as { phoneNumber?: number }).phoneNumber ?? testPhone)

      await route.fulfill({
        json: {
          exist: accountExists,
          chatId: accountExists ? `${phoneNumber}@c.us` : '',
          fromCache: false,
        },
      })
      return
    }

    if (methodName === 'sendMessage') {
      counters.sendMessage += 1
      sendMessageBodies.push(route.request().postDataJSON())

      if (sendStatus >= 400) {
        await route.fulfill({
          status: sendStatus,
          json: { error: 'send failed' },
        })
        return
      }

      await route.fulfill({ json: { idMessage: `outgoing-message-${nextOutgoingId}` } })
      nextOutgoingId += 1
      return
    }

    if (methodName === 'receiveNotification') {
      counters.receiveNotification += 1
      const notification = receiveQueue.shift()

      if (notification) {
        await route.fulfill({ json: notification })
        return
      }

      pendingReceives.push(route)
      drainPendingReceives()
      return
    }

    if (methodName === 'deleteNotification') {
      counters.deleteNotification += 1
      await route.fulfill({ json: { result: true } })
      drainPendingReceives()
      return
    }

    await route.fulfill({
      status: 500,
      json: { error: `Unhandled GREEN-API method: ${methodName}` },
    })
  })

  return {
    counters,
    checkAccountBodies,
    sendMessageBodies,
    pendingReceiveCount() {
      return pendingReceives.length
    },
    enqueueIncoming(input) {
      enqueue(incomingNotification(nextReceiptId, input))
      nextReceiptId += 1
    },
    enqueueIrrelevant() {
      enqueue(irrelevantNotification(nextReceiptId))
      nextReceiptId += 1
    },
    setAccountExists(nextAccountExists) {
      accountExists = nextAccountExists
    },
    setSendStatus(nextSendStatus) {
      sendStatus = nextSendStatus
    },
  }
}
