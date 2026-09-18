import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import App from '@/app/App'
import { server } from '@/test/msw/server'

const apiUrl = 'https://api.green-api.example'
const idInstance = 'idInstance'
const apiTokenInstance = 'apiTokenInstance'
const baseUrl = `${apiUrl}/waInstance${idInstance}`

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

describe('create chat UI', () => {
  it('valid RF phone calls CheckAccount, adds chat, and makes it active', async () => {
    let checkAccountCalls = 0

    server.use(
      http.post(`${baseUrl}/checkAccount/${apiTokenInstance}`, async ({ request }) => {
        checkAccountCalls += 1
        expect(await request.json()).toEqual({ phoneNumber: 79991234567 })

        return HttpResponse.json({
          exist: true,
          chatId: '79991234567@c.us',
          fromCache: false,
        })
      }),
    )

    await connectAuthorizedInstance()

    await userEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый чат' })
    await userEvent.type(within(dialog).getByLabelText('Номер телефона'), '+7 (999) 123-45-67')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать чат' }))

    await waitFor(() => {
      expect(checkAccountCalls).toBe(1)
    })
    expect(screen.getByRole('button', { name: /79991234567/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '79991234567' })).toBeInTheDocument()
  })

  it('invalid phone prefix shows validation error and does not call CheckAccount', async () => {
    let checkAccountCalls = 0

    server.use(
      http.post(`${baseUrl}/checkAccount/${apiTokenInstance}`, () => {
        checkAccountCalls += 1
        return HttpResponse.json({
          exist: true,
          chatId: '89991234567@c.us',
          fromCache: false,
        })
      }),
    )

    await connectAuthorizedInstance()

    await userEvent.click(screen.getByRole('button', { name: 'Новый чат' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый чат' })
    await userEvent.type(within(dialog).getByLabelText('Номер телефона'), '89991234567')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Создать чат' }))

    expect(await within(dialog).findByText('CheckAccount поддерживает только номера РФ (7) и РБ (375)')).toBeInTheDocument()
    expect(checkAccountCalls).toBe(0)
    expect(screen.getByText('Чатов пока нет.')).toBeInTheDocument()
  })

  it('existing false CheckAccount response shows error and does not add chat', async () => {
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
})
