import { MESSAGE_MAX_LENGTH, RECEIVE_TIMEOUT_SEC } from '@/shared/config/constants'
import { buildInstanceUrl } from './buildUrl'
import { GreenApiHttpError, GreenApiValidationError } from './errors'
import type {
  CheckAccountResponse,
  DeleteNotificationResponse,
  GreenApiClient,
  GreenApiSettings,
  InstanceCredentials,
  InstanceState,
  ReceiveNotificationResponse,
  SendMessageResponse,
} from './types'

const MIN_RECEIVE_TIMEOUT_SEC = 5
const MAX_RECEIVE_TIMEOUT_SEC = 60

function redactTokenInUrl(url: string, apiTokenInstance: string): string {
  if (!apiTokenInstance) {
    return url
  }

  return url.replaceAll(apiTokenInstance, '***')
}

function apiUrlHost(apiUrl: string): string | undefined {
  try {
    return new URL(apiUrl).host
  } catch {
    return undefined
  }
}

type RequestOptions = {
  method: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

async function requestJson<T>(
  creds: InstanceCredentials,
  methodName: string,
  options: RequestOptions,
  suffix = '',
): Promise<T> {
  const url = buildInstanceUrl(creds, methodName, suffix)
  const response = await fetch(url, {
    method: options.method,
    signal: options.signal,
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const bodyText = await response.text()

  if (!response.ok) {
    console.error('GREEN-API request failed', {
      method: options.method,
      methodName,
      idInstance: creds.idInstance,
      apiHost: apiUrlHost(creds.apiUrl),
      status: response.status,
      bodyText,
      url: redactTokenInUrl(url, creds.apiTokenInstance),
    })

    throw new GreenApiHttpError(`Ошибка GREEN-API: ${response.status}`, response.status, bodyText)
  }

  return bodyText ? (JSON.parse(bodyText) as T) : (null as T)
}

function normalizeReceiveTimeout(receiveTimeoutSec?: number): number {
  const timeout = receiveTimeoutSec ?? RECEIVE_TIMEOUT_SEC

  if (
    !Number.isInteger(timeout) ||
    timeout < MIN_RECEIVE_TIMEOUT_SEC ||
    timeout > MAX_RECEIVE_TIMEOUT_SEC
  ) {
    throw new GreenApiValidationError('receiveTimeout должен быть от 5 до 60 секунд')
  }

  return timeout
}

export function createGreenApiClient(creds: InstanceCredentials): GreenApiClient {
  return {
    getStateInstance() {
      return requestJson<{ stateInstance: InstanceState }>(creds, 'getStateInstance', {
        method: 'GET',
      })
    },

    getSettings() {
      return requestJson<GreenApiSettings>(creds, 'getSettings', {
        method: 'GET',
      })
    },

    checkAccount(phoneNumber: number) {
      return requestJson<CheckAccountResponse>(creds, 'checkAccount', {
        method: 'POST',
        body: { phoneNumber },
      })
    },

    async sendMessage(chatId: string, message: string) {
      if (message.length > MESSAGE_MAX_LENGTH) {
        throw new GreenApiValidationError(`Сообщение длиннее ${MESSAGE_MAX_LENGTH} символов`)
      }

      return requestJson<SendMessageResponse>(creds, 'sendMessage', {
        method: 'POST',
        body: { chatId, message },
      })
    },

    async receiveNotification(receiveTimeoutSec?: number, signal?: AbortSignal) {
      const timeout = normalizeReceiveTimeout(receiveTimeoutSec)

      return requestJson<ReceiveNotificationResponse | null>(
        creds,
        'receiveNotification',
        {
          method: 'GET',
          signal,
        },
        `?receiveTimeout=${timeout}`,
      )
    },

    deleteNotification(receiptId: number, signal?: AbortSignal) {
      return requestJson<DeleteNotificationResponse>(
        creds,
        'deleteNotification',
        {
          method: 'DELETE',
          signal,
        },
        `/${receiptId}`,
      )
    },
  }
}
