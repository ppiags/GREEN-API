import type { Message } from '@/entities/message/model/types'
import type { GreenApiClient } from '@/shared/api/types'
import { sleep } from '@/shared/lib/backoff'
import { classifyNotification } from './classifyNotification'

const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 10_000

type NotificationPollerArgs = {
  client: GreenApiClient
  signal: AbortSignal
  onIncoming: (message: Message) => void
  receiveTimeoutSec?: number
}

function nextBackoff(current: number): number {
  return Math.min(current * 2, MAX_BACKOFF_MS)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export async function startNotificationPoller({
  client,
  signal,
  onIncoming,
  receiveTimeoutSec,
}: NotificationPollerArgs): Promise<void> {
  let backoffMs = INITIAL_BACKOFF_MS

  while (!signal.aborted) {
    try {
      const notification = await client.receiveNotification(receiveTimeoutSec, signal)

      if (signal.aborted) {
        break
      }

      if (notification === null) {
        backoffMs = INITIAL_BACKOFF_MS
        continue
      }

      const classified = classifyNotification(notification.body)

      if (classified.kind === 'processingError') {
        console.error('GREEN-API notification processing failed', classified.error)
        await sleep(backoffMs, signal)
        backoffMs = nextBackoff(backoffMs)
        continue
      }

      if (classified.kind === 'incomingText') {
        try {
          onIncoming(classified.message)
        } catch (error) {
          console.error('GREEN-API incoming message handler failed', error)
          await sleep(backoffMs, signal)
          backoffMs = nextBackoff(backoffMs)
          continue
        }
      }

      try {
        const deleteResult = await client.deleteNotification(notification.receiptId, signal)

        if (!deleteResult.result) {
          throw new Error(`deleteNotification returned false for receipt ${notification.receiptId}`)
        }

        backoffMs = INITIAL_BACKOFF_MS
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          break
        }

        console.error('GREEN-API deleteNotification failed', error)
        await sleep(backoffMs, signal)
        backoffMs = nextBackoff(backoffMs)
      }
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        break
      }

      console.error('GREEN-API receiveNotification failed', error)
      await sleep(backoffMs, signal)
      backoffMs = nextBackoff(backoffMs)
    }
  }
}
