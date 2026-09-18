import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '@/entities/message/model/types'
import { classifyNotification } from '@/features/receive-messages/model/classifyNotification'
import { startNotificationPoller } from '@/features/receive-messages/model/notificationPoller'
import type {
  DeleteNotificationResponse,
  GreenApiClient,
  GreenApiSettings,
  InstanceState,
  ReceiveNotificationResponse,
} from '@/shared/api/types'

type QueuedReceive =
  | ReceiveNotificationResponse
  | null
  | Error
  | (() => Promise<ReceiveNotificationResponse | null>)

const incomingBody = {
  typeWebhook: 'incomingMessageReceived',
  idMessage: 'incoming-id',
  timestamp: 1710000000,
  senderData: {
    chatId: '79991234567@c.us',
  },
  messageData: {
    typeMessage: 'textMessage',
    textMessageData: {
      textMessage: 'hello',
    },
  },
}

function notification(receiptId: number, body: unknown): ReceiveNotificationResponse {
  return { receiptId, body }
}

function createClient(queue: QueuedReceive[], deleteImpl?: GreenApiClient['deleteNotification']) {
  const receiveCalls: Array<{ timeout?: number; signal?: AbortSignal }> = []
  const deleteCalls: Array<{ receiptId: number; signal?: AbortSignal }> = []

  const client: GreenApiClient = {
    getStateInstance: async () => ({ stateInstance: 'authorized' as InstanceState }),
    getSettings: async () => ({ incomingWebhook: 'yes', webhookUrl: '' }) satisfies GreenApiSettings,
    checkAccount: async () => ({ exist: true, chatId: '79991234567@c.us', fromCache: false }),
    sendMessage: async () => ({ idMessage: 'sent-id' }),
    async receiveNotification(receiveTimeoutSec?: number, signal?: AbortSignal) {
      receiveCalls.push({ timeout: receiveTimeoutSec, signal })
      const next = queue.shift() ?? null

      if (next instanceof Error) {
        throw next
      }

      if (typeof next === 'function') {
        return next()
      }

      return next
    },
    async deleteNotification(receiptId: number, signal?: AbortSignal) {
      deleteCalls.push({ receiptId, signal })

      if (deleteImpl) {
        return deleteImpl(receiptId, signal)
      }

      return { result: true } satisfies DeleteNotificationResponse
    },
  }

  return { client, receiveCalls, deleteCalls }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('classifyNotification', () => {
  it('classifies GREEN-API incoming text payload into a Message', () => {
    const result = classifyNotification(incomingBody)

    expect(result).toEqual({
      kind: 'incomingText',
      message: {
        idMessage: 'incoming-id',
        chatId: '79991234567@c.us',
        text: 'hello',
        timestamp: 1710000000000,
        direction: 'incoming',
      } satisfies Message,
    })

    expect(result.kind).toBe('incomingText')
    if (result.kind === 'incomingText') {
      expect(new Date(result.message.timestamp).getUTCFullYear()).toBe(2024)
      expect(new Date(result.message.timestamp).getUTCFullYear()).not.toBe(1970)
    }
  })

  it('classifies outgoing, status, and non-text payloads as irrelevant', () => {
    expect(classifyNotification({ typeWebhook: 'outgoingAPIMessageReceived' })).toEqual({
      kind: 'irrelevant',
    })
    expect(classifyNotification({ typeWebhook: 'outgoingMessageStatus' })).toEqual({
      kind: 'irrelevant',
    })
    expect(
      classifyNotification({
        ...incomingBody,
        messageData: { typeMessage: 'imageMessage' },
      }),
    ).toEqual({ kind: 'irrelevant' })
  })

  it('classifies malformed bodies as processingError', () => {
    const result = classifyNotification({
      ...incomingBody,
      senderData: {},
    })

    expect(result.kind).toBe('processingError')
  })
})

describe('startNotificationPoller', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('appends incoming text and deletes the receipt after processing', async () => {
    const abortController = new AbortController()
    const received: Message[] = []
    const { client, receiveCalls, deleteCalls } = createClient(
      [notification(101, incomingBody)],
      async () => {
        abortController.abort()
        return { result: true }
      },
    )

    const poller = startNotificationPoller({
      client,
      signal: abortController.signal,
      receiveTimeoutSec: 5,
      onIncoming: (message) => {
        received.push(message)
      },
    })

    await poller

    expect(received).toHaveLength(1)
    expect(received[0]?.text).toBe('hello')
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([101])
    expect(receiveCalls).toHaveLength(1)
    expect(receiveCalls[0]?.timeout).toBe(5)
  })

  it('deletes irrelevant notifications without appending and keeps polling', async () => {
    const abortController = new AbortController()
    const received: Message[] = []
    const { client, deleteCalls } = createClient(
      [
        notification(201, { typeWebhook: 'outgoingAPIMessageReceived' }),
        notification(202, incomingBody),
      ],
      async (receiptId) => {
        if (receiptId === 202) {
          abortController.abort()
        }

        return { result: true }
      },
    )

    const poller = startNotificationPoller({
      client,
      signal: abortController.signal,
      receiveTimeoutSec: 5,
      onIncoming: (message) => {
        received.push(message)
      },
    })

    await poller

    expect(received.map((message) => message.idMessage)).toEqual(['incoming-id'])
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([201, 202])
  })

  it('attempts delete for duplicate successful notifications while session dedupe keeps one bubble', async () => {
    const abortController = new AbortController()
    const seen = new Set<string>()
    const appended: Message[] = []
    const { client, deleteCalls } = createClient(
      [notification(301, incomingBody), notification(302, incomingBody)],
      async (receiptId) => {
        if (receiptId === 302) {
          abortController.abort()
        }

        return { result: true }
      },
    )

    const poller = startNotificationPoller({
      client,
      signal: abortController.signal,
      receiveTimeoutSec: 5,
      onIncoming: (message) => {
        if (!seen.has(message.idMessage)) {
          seen.add(message.idMessage)
          appended.push(message)
        }
      },
    })

    await poller

    expect(appended).toHaveLength(1)
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([301, 302])
  })

  it('backs off after delete failure without appending duplicate redelivery', async () => {
    vi.useFakeTimers()

    const abortController = new AbortController()
    const seen = new Set<string>()
    const appended: Message[] = []
    const { client, deleteCalls } = createClient(
      [notification(401, incomingBody), notification(402, incomingBody)],
      async (receiptId) => {
        if (receiptId === 401) {
          throw new Error('temporary delete failure')
        }

        abortController.abort()
        return { result: true }
      },
    )

    const poller = startNotificationPoller({
      client,
      signal: abortController.signal,
      receiveTimeoutSec: 5,
      onIncoming: (message) => {
        if (!seen.has(message.idMessage)) {
          seen.add(message.idMessage)
          appended.push(message)
        }
      },
    })

    await flushPromises()
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([401])

    await vi.advanceTimersByTimeAsync(1000)
    await poller

    expect(appended).toHaveLength(1)
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([401, 402])
  })

  it('backs off when deleteNotification returns result false', async () => {
    vi.useFakeTimers()

    const abortController = new AbortController()
    const appended: Message[] = []
    const { client, receiveCalls, deleteCalls } = createClient(
      [notification(601, incomingBody), notification(602, incomingBody)],
      async (receiptId) => {
        if (receiptId === 601) {
          return { result: false }
        }

        abortController.abort()
        return { result: true }
      },
    )

    const poller = startNotificationPoller({
      client,
      signal: abortController.signal,
      receiveTimeoutSec: 5,
      onIncoming: (message) => {
        appended.push(message)
      },
    })

    await flushPromises()
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([601])
    expect(receiveCalls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1000)
    await poller

    expect(appended).toHaveLength(2)
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([601, 602])
    expect(receiveCalls).toHaveLength(2)
  })

  it('does not delete processingError notifications and recovers after receive network errors', async () => {
    vi.useFakeTimers()

    const abortController = new AbortController()
    const received: Message[] = []
    const { client, deleteCalls } = createClient(
      [
        notification(501, { typeWebhook: 'incomingMessageReceived', senderData: {} }),
        new Error('temporary receive failure'),
        notification(502, incomingBody),
      ],
      async (receiptId) => {
        if (receiptId === 502) {
          abortController.abort()
        }

        return { result: true }
      },
    )

    const poller = startNotificationPoller({
      client,
      signal: abortController.signal,
      receiveTimeoutSec: 5,
      onIncoming: (message) => {
        received.push(message)
      },
    })

    await flushPromises()
    expect(deleteCalls).toEqual([])

    await vi.advanceTimersByTimeAsync(1000)
    await flushPromises()
    expect(deleteCalls).toEqual([])

    await vi.advanceTimersByTimeAsync(2000)
    await poller

    expect(received).toHaveLength(1)
    expect(deleteCalls.map((call) => call.receiptId)).toEqual([502])
  })

  it('resolves on abort and never overlaps receive calls', async () => {
    const abortController = new AbortController()
    let inFlight = 0
    let maxInFlight = 0
    let releaseReceive: ((value: ReceiveNotificationResponse | null) => void) | undefined
    const { client, receiveCalls } = createClient([
      () =>
        new Promise<ReceiveNotificationResponse | null>((resolve) => {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          releaseReceive = (value) => {
            inFlight -= 1
            resolve(value)
          }
        }),
    ])

    const poller = startNotificationPoller({
      client,
      signal: abortController.signal,
      receiveTimeoutSec: 5,
      onIncoming: () => {
        throw new Error('unexpected incoming message')
      },
    })

    await flushPromises()
    expect(receiveCalls).toHaveLength(1)
    expect(maxInFlight).toBe(1)

    abortController.abort()
    releaseReceive?.(null)
    await poller

    expect(receiveCalls).toHaveLength(1)
    expect(maxInFlight).toBe(1)
  })
})
