import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import App from '@/app/App'
import { server } from '@/test/msw/server'

const apiUrl = 'https://api.green-api.example'
const idInstance = 'idInstance'
const apiTokenInstance = 'apiTokenInstance'
const baseUrl = `${apiUrl}/waInstance${idInstance}`

async function openAdvancedSettings() {
  await userEvent.click(screen.getByRole('button', { name: 'Расширенные настройки' }))
  expect(screen.getByLabelText('apiUrl')).toBeVisible()
}

describe('connect UI', () => {
  it('keeps apiUrl collapsed in Advanced Settings by default', async () => {
    render(<App />)

    expect(screen.getByLabelText('idInstance')).toBeVisible()
    expect(screen.getByLabelText('apiTokenInstance')).toBeVisible()
    expect(screen.queryByLabelText('apiUrl')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Расширенные настройки' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    await openAdvancedSettings()

    expect(screen.getByRole('button', { name: 'Расширенные настройки' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(
      screen.getByText(
        'apiUrl — отдельный access parameter из консоли GREEN-API. Не вычисляется из idInstance.',
      ),
    ).toBeVisible()
  })

  it('connect authorized opens main UI after Advanced apiUrl is filled', async () => {
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
    await openAdvancedSettings()
    await userEvent.type(screen.getByLabelText('apiUrl'), apiUrl)
    await userEvent.click(screen.getByRole('button', { name: 'Подключить' }))

    expect(await screen.findByText('Новый чат')).toBeInTheDocument()
  })
})
