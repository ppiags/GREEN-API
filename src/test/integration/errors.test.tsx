import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '@/app/App'
import { server } from '@/test/msw/server'

const apiUrl = 'https://api.green-api.example'
const idInstance = 'idInstance'
const apiTokenInstance = 'apiTokenInstance'
const baseUrl = `${apiUrl}/waInstance${idInstance}`
const chatId = '79991234567@c.us'

const incomingTextNotification = {
  receiptId: 101,
  body: {
    typeWebhook: 'incomingMessageReceived',
    idMessage: 'incoming-after-retry',
    timestamp: 1710000000,
    senderData: {
      chatId,
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: {
        textMessage: 'Сообщение после восстановления',
      },
    },
  },
}

function mockExpectedErrorLogs() {
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

function mockAuthorizedConnection() {
  server.use(
    http.get(`${baseUrl}/getStateInstance/${apiTokenInstance}`, () =>
      HttpResponse.json({ stateInstance: 'authorized' }),
    ),
    http.get(`${baseUrl}/getSettings/${apiTokenInstance}`, () =>
      HttpResponse.json({ incomingWebhook: 'yes', webhookUrl: '' }),
    ),
    http.get(`${baseUrl}/receiveNotification/${apiTokenInstance}`, () =>
      HttpResponse.json({ error: 'poll disabled in this test' }, { status: 500 }),
    ),
  )
}

async function submitCredentials() {
  render(<App />)

  await userEvent.type(screen.getByLabelText('idInstance'), idInstance)
  await userEvent.type(screen.getByLabelText('apiTokenInstance'), apiTokenInstance)
  await userEvent.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
  await userEvent.type(screen.getByLabelText('apiUrl'), apiUrl)
  await userEvent.click(screen.getByRole('button', { name: 'Подключить' }))
}

async function connectAuthorizedInstance() {
  mockAuthorizedConnection()
  await submitCredentials()
  await screen.findByRole('button', { name: 'Новый чат' })
}

async function createActiveChat() {
  server.use(
    http.post(`${baseUrl}/checkAccount/${apiTokenInstance}`, () =>
      HttpResponse.json({
        exist: true,
        chatId,
        fromCache: false,
      }),
    ),
  )

  await connectAuthorizedInstance()

  await userEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
  const dialog = screen.getByRole('dialog', { name: 'Новый чат' })
  await userEvent.type(within(dialog).getByLabelText('Номер телефона'), '+7 999 123 45 67')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Создать чат' }))
  await screen.findByRole('heading', { name: '79991234567' })
}

afterEach(() => {
  const disconnectButton = screen.queryByRole('button', { name: 'Отключить' })

  if (disconnectButton) {
    fireEvent.click(disconnectButton)
  }

  cleanup()
  vi.restoreAllMocks()
})

describe('error-path integration UI', () => {
  it('shows HTTP error for invalid credentials and keeps main UI closed', async () => {
    mockExpectedErrorLogs()
    server.use(
      http.get(`${baseUrl}/getStateInstance/${apiTokenInstance}`, () =>
        HttpResponse.json({ error: 'invalid credentials' }, { status: 403 }),
      ),
    )

    await submitCredentials()

    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка GREEN-API: 403')
    expect(screen.queryByRole('button', { name: 'Новый чат' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Подключите инстанс' })).toBeInTheDocument()
  })

  it.each([
    ['notAuthorized', 'Инстанс не авторизован. Авторизуйте аккаунт в GREEN-API.'],
    ['blocked', 'Инстанс заблокирован.'],
    ['starting', 'Инстанс запускается. Повторите попытку позже.'],
    ['suspended', 'Инстанс приостановлен.'],
    ['pendingPassword', 'Инстанс ожидает пароль. Завершите авторизацию в GREEN-API.'],
  ])('shows human message for %s state and keeps main UI closed', async (stateInstance, message) => {
    mockExpectedErrorLogs()
    server.use(
      http.get(`${baseUrl}/getStateInstance/${apiTokenInstance}`, () =>
        HttpResponse.json({ stateInstance }),
      ),
    )

    await submitCredentials()

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('button', { name: 'Новый чат' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Подключите инстанс' })).toBeInTheDocument()
  })

  it('shows CheckAccount exist:false error and does not add a chat', async () => {
    mockExpectedErrorLogs()
    server.use(
      http.post(`${baseUrl}/checkAccount/${apiTokenInstance}`, () =>
        HttpResponse.json({
          exist: false,
          chatId: '',
          fromCache: false,
        }),
      ),
    )

    await connectAuthorizedInstance()

    await userEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый чат' })
    await userEvent.type(within(dialog).getByLabelText('Номер телефона'), '+7 999 123 45 67')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать чат' }))

    expect(await within(dialog).findByText('Аккаунт MAX не найден')).toBeInTheDocument()
    expect(screen.getByText('Чатов пока нет.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Чат не выбран' })).toBeInTheDocument()
  })

  it.each([400, 500])(
    'keeps composer text and shows HTTP %s when SendMessage fails',
    async (status) => {
      mockExpectedErrorLogs()
      server.use(
        http.post(`${baseUrl}/sendMessage/${apiTokenInstance}`, () =>
          HttpResponse.json({ error: `send failed with ${status}` }, { status }),
        ),
      )

      await createActiveChat()

      const messageInput = screen.getByLabelText('Сообщение')
      await userEvent.type(messageInput, 'Не терять текст')
      await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(`Ошибка GREEN-API: ${status}`)
      expect(messageInput).toHaveValue('Не терять текст')
      expect(screen.queryByTestId(`message-send-failed-with-${status}`)).not.toBeInTheDocument()
    },
  )

  it('recovers polling after transient ReceiveNotification 500', async () => {
    mockExpectedErrorLogs()
    let receiveCalls = 0
    let deleteCalls = 0

    server.use(
      http.get(`${baseUrl}/getStateInstance/${apiTokenInstance}`, () =>
        HttpResponse.json({ stateInstance: 'authorized' }),
      ),
      http.get(`${baseUrl}/getSettings/${apiTokenInstance}`, () =>
        HttpResponse.json({ incomingWebhook: 'yes', webhookUrl: '' }),
      ),
      http.get(`${baseUrl}/receiveNotification/${apiTokenInstance}`, () => {
        receiveCalls += 1

        if (receiveCalls === 1) {
          return HttpResponse.json({ error: 'temporary receive failure' }, { status: 500 })
        }

        if (receiveCalls === 2) {
          return HttpResponse.json(incomingTextNotification)
        }

        return HttpResponse.json({ error: 'poll disabled after recovery' }, { status: 500 })
      }),
      http.delete(`${baseUrl}/deleteNotification/${apiTokenInstance}/101`, () => {
        deleteCalls += 1
        return HttpResponse.json({ result: true })
      }),
    )

    await submitCredentials()
    await screen.findByRole('button', { name: 'Новый чат' })

    const recoveredChat = await screen.findByRole('button', { name: /79991234567/ }, { timeout: 3000 })
    await userEvent.click(recoveredChat)

    expect(await screen.findByTestId('message-incoming-after-retry')).toHaveTextContent(
      'Сообщение после восстановления',
    )
    await waitFor(() => {
      expect(receiveCalls).toBeGreaterThanOrEqual(2)
      expect(deleteCalls).toBe(1)
    })
  })
})
