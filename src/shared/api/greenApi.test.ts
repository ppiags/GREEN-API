import { http, HttpResponse } from 'msw'
import { expect, it, vi } from 'vitest'
import { MESSAGE_MAX_LENGTH, RECEIVE_TIMEOUT_SEC } from '@/shared/config/constants'
import { server } from '@/test/msw/server'
import { buildInstanceUrl } from './buildUrl'
import { GreenApiHttpError, GreenApiValidationError } from './errors'
import { createGreenApiClient } from './greenApi'
import type { InstanceCredentials } from './types'

const creds: InstanceCredentials = {
  apiUrl: 'https://api.green-api.example/',
  idInstance: 'idInstance',
  apiTokenInstance: 'apiTokenInstance',
}

const baseUrl = 'https://api.green-api.example/waInstanceidInstance'

it('builds exact GREEN-API instance URLs without trailing apiUrl slash', () => {
  expect(buildInstanceUrl(creds, 'getStateInstance')).toBe(
    `${baseUrl}/getStateInstance/apiTokenInstance`,
  )
  expect(buildInstanceUrl(creds, 'receiveNotification', '?receiveTimeout=20')).toBe(
    `${baseUrl}/receiveNotification/apiTokenInstance?receiveTimeout=20`,
  )
})

it('gets instance state with GET exact URL', async () => {
  server.use(
    http.get(`${baseUrl}/getStateInstance/apiTokenInstance`, () =>
      HttpResponse.json({ stateInstance: 'pendingPassword' }),
    ),
  )

  await expect(createGreenApiClient(creds).getStateInstance()).resolves.toEqual({
    stateInstance: 'pendingPassword',
  })
})

it('gets settings with GET exact URL and keeps passthrough fields', async () => {
  server.use(
    http.get(`${baseUrl}/getSettings/apiTokenInstance`, () =>
      HttpResponse.json({
        incomingWebhook: 'yes',
        webhookUrl: '',
        wid: 'instanceWid',
      }),
    ),
  )

  await expect(createGreenApiClient(creds).getSettings()).resolves.toEqual({
    incomingWebhook: 'yes',
    webhookUrl: '',
    wid: 'instanceWid',
  })
})

it('checks account with POST exact URL and numeric phoneNumber body only', async () => {
  server.use(
    http.post(`${baseUrl}/checkAccount/apiTokenInstance`, async ({ request }) => {
      const body = await request.json()

      expect(body).toEqual({ phoneNumber: 79991234567 })

      return HttpResponse.json({
        exist: true,
        chatId: '79991234567@c.us',
        fromCache: false,
      })
    }),
  )

  await expect(createGreenApiClient(creds).checkAccount(79991234567)).resolves.toEqual({
    exist: true,
    chatId: '79991234567@c.us',
    fromCache: false,
  })
})

it('sends message with POST exact URL and chatId/message body only', async () => {
  const message = 'x'.repeat(MESSAGE_MAX_LENGTH)

  server.use(
    http.post(`${baseUrl}/sendMessage/apiTokenInstance`, async ({ request }) => {
      const body = await request.json()

      expect(body).toEqual({
        chatId: '79991234567@c.us',
        message,
      })

      return HttpResponse.json({ idMessage: 'sentMessageId' })
    }),
  )

  await expect(
    createGreenApiClient(creds).sendMessage('79991234567@c.us', message),
  ).resolves.toEqual({ idMessage: 'sentMessageId' })
})

it('rejects overlong messages before fetch', async () => {
  server.use(
    http.post(`${baseUrl}/sendMessage/apiTokenInstance`, () => {
      throw new Error('sendMessage must not fetch overlong messages')
    }),
  )

  await expect(
    createGreenApiClient(creds).sendMessage('79991234567@c.us', 'x'.repeat(4001)),
  ).rejects.toThrow(GreenApiValidationError)
})

it('receives notification with default timeout query and returns payload', async () => {
  server.use(
    http.get(`${baseUrl}/receiveNotification/apiTokenInstance`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('receiveTimeout')).toBe(
        String(RECEIVE_TIMEOUT_SEC),
      )

      return HttpResponse.json({
        receiptId: 12345,
        body: { typeWebhook: 'incomingMessageReceived' },
      })
    }),
  )

  await expect(createGreenApiClient(creds).receiveNotification()).resolves.toEqual({
    receiptId: 12345,
    body: { typeWebhook: 'incomingMessageReceived' },
  })
})

it('returns null for empty receiveNotification body', async () => {
  server.use(
    http.get(
      `${baseUrl}/receiveNotification/apiTokenInstance`,
      () => new HttpResponse(null, { status: 200 }),
    ),
  )

  await expect(createGreenApiClient(creds).receiveNotification(5)).resolves.toBeNull()
})

it('rejects receiveNotification timeout outside 5-60 before fetch', async () => {
  server.use(
    http.get(`${baseUrl}/receiveNotification/apiTokenInstance`, () => {
      throw new Error('receiveNotification must not fetch with invalid timeout')
    }),
  )

  await expect(createGreenApiClient(creds).receiveNotification(4)).rejects.toThrow(
    GreenApiValidationError,
  )
  await expect(createGreenApiClient(creds).receiveNotification(61)).rejects.toThrow(
    GreenApiValidationError,
  )
})

it('deletes notification with DELETE exact URL', async () => {
  server.use(
    http.delete(`${baseUrl}/deleteNotification/apiTokenInstance/12345`, () =>
      HttpResponse.json({ result: true }),
    ),
  )

  await expect(createGreenApiClient(creds).deleteNotification(12345)).resolves.toEqual({
    result: true,
  })
})

it('throws typed HTTP error with status and body text on non-OK responses', async () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  server.use(
    http.get(
      `${baseUrl}/getStateInstance/apiTokenInstance`,
      () => new HttpResponse('instance is blocked', { status: 403 }),
    ),
  )

  await expect(createGreenApiClient(creds).getStateInstance()).rejects.toMatchObject({
    name: 'GreenApiHttpError',
    status: 403,
    bodyText: 'instance is blocked',
    message: 'Ошибка GREEN-API: 403',
  } satisfies Partial<GreenApiHttpError>)

  const logPayload = errorSpy.mock.calls[0]?.[1] as Record<string, unknown> | undefined

  expect(logPayload?.url).toBe(`${baseUrl}/getStateInstance/***`)
  expect(logPayload?.methodName).toBe('getStateInstance')
  expect(logPayload?.idInstance).toBe('idInstance')
  expect(logPayload?.apiHost).toBe('api.green-api.example')
  expect(JSON.stringify(logPayload)).not.toContain('apiTokenInstance')

  errorSpy.mockRestore()
})
