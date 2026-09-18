import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import App from '@/app/App'
import { MESSAGE_MAX_LENGTH } from '@/shared/config/constants'
import { server } from '@/test/msw/server'

const apiUrl = 'https://api.green-api.example'
const idInstance = 'idInstance'
const apiTokenInstance = 'apiTokenInstance'
const baseUrl = `${apiUrl}/waInstance${idInstance}`
const chatId = '79991234567@c.us'

async function connectAuthorizedInstance() {
  server.use(
    http.get(`${baseUrl}/getStateInstance/${apiTokenInstance}`, () =>
      HttpResponse.json({ stateInstance: 'authorized' }),
    ),
    http.get(`${baseUrl}/getSettings/${apiTokenInstance}`, () =>
      HttpResponse.json({ incomingWebhook: 'yes', webhookUrl: '' }),
    ),
  )

  render(<App />)

  await userEvent.type(screen.getByLabelText('idInstance'), idInstance)
  await userEvent.type(screen.getByLabelText('apiTokenInstance'), apiTokenInstance)
  await userEvent.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
  await userEvent.type(screen.getByLabelText('apiUrl'), apiUrl)
  await userEvent.click(screen.getByRole('button', { name: 'Подключить' }))

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

describe('send message UI', () => {
  it('sends trimmed text with active chatId and appends outgoing API idMessage', async () => {
    let sendCalls = 0

    server.use(
      http.post(`${baseUrl}/sendMessage/${apiTokenInstance}`, async ({ request }) => {
        sendCalls += 1
        expect(await request.json()).toEqual({ chatId, message: 'Привет' })

        return HttpResponse.json({ idMessage: 'outgoing-message-id' })
      }),
    )

    await createActiveChat()

    await userEvent.type(screen.getByLabelText('Сообщение'), '  Привет  ')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => {
      expect(sendCalls).toBe(1)
    })
    expect(screen.getByTestId('message-outgoing-message-id')).toHaveTextContent('Привет')
  })

  it('sends 4000 characters and blocks 4001 characters without a request', async () => {
    let sendCalls = 0

    server.use(
      http.post(`${baseUrl}/sendMessage/${apiTokenInstance}`, async ({ request }) => {
        sendCalls += 1
        expect(await request.json()).toEqual({
          chatId,
          message: 'x'.repeat(MESSAGE_MAX_LENGTH),
        })

        return HttpResponse.json({ idMessage: 'max-length-message-id' })
      }),
    )

    await createActiveChat()

    const messageInput = screen.getByLabelText('Сообщение')
    fireEvent.change(messageInput, { target: { value: 'x'.repeat(MESSAGE_MAX_LENGTH) } })
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => {
      expect(sendCalls).toBe(1)
    })

    fireEvent.change(messageInput, { target: { value: 'x'.repeat(MESSAGE_MAX_LENGTH + 1) } })
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Сообщение длиннее 4000 символов')).toBeInTheDocument()
    expect(sendCalls).toBe(1)
  })

  it('keeps composer text and shows error when SendMessage fails', async () => {
    server.use(
      http.post(`${baseUrl}/sendMessage/${apiTokenInstance}`, () =>
        HttpResponse.json({ error: 'failed' }, { status: 500 }),
      ),
    )

    await createActiveChat()

    const messageInput = screen.getByLabelText('Сообщение')
    await userEvent.type(messageInput, 'Не терять текст')
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Ошибка GREEN-API: 500')).toBeInTheDocument()
    expect(messageInput).toHaveValue('Не терять текст')
  })

  it('does not submit a second request while the first send is pending', async () => {
    let sendCalls = 0
    const sendGate: { release: (() => void) | null } = { release: null }

    server.use(
      http.post(`${baseUrl}/sendMessage/${apiTokenInstance}`, async () => {
        sendCalls += 1
        await new Promise<void>((resolve) => {
          sendGate.release = resolve
        })

        return HttpResponse.json({ idMessage: 'single-submit-message-id' })
      }),
    )

    await createActiveChat()

    await userEvent.type(screen.getByLabelText('Сообщение'), 'Один раз')
    const sendButton = screen.getByRole('button', { name: 'Отправить' })
    const firstClick = userEvent.click(sendButton)
    const secondClick = userEvent.click(sendButton)

    await waitFor(() => {
      expect(sendCalls).toBe(1)
    })

    sendGate.release?.()
    await Promise.all([firstClick, secondClick])
    expect(sendCalls).toBe(1)
  })
})
