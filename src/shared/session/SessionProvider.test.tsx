import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { SessionProvider, useSession } from '@/shared/session/SessionProvider'
import { server } from '@/test/msw/server'

const baseUrl = 'https://api.green-api.example/waInstanceidInstance'

function SessionProbe() {
  const session = useSession()

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void session.connect({
            apiUrl: ' https://api.green-api.example/ ',
            idInstance: 'idInstance',
            apiTokenInstance: 'apiTokenInstance',
          })
        }}
      >
        connect
      </button>
      <button
        type="button"
        onClick={() => {
          const first = session.appendMessage({
            idMessage: 'message-id',
            chatId: '79991234567@c.us',
            text: 'first',
            timestamp: 1710000000,
            direction: 'incoming',
          })
          const second = session.appendMessage({
            idMessage: 'message-id',
            chatId: '79990000000@c.us',
            text: 'duplicate',
            timestamp: 1710000001,
            direction: 'outgoing',
          })
          window.sessionAppendResults = [first, second]
        }}
      >
        append duplicate
      </button>
      <output data-testid="api-url">{session.credentials?.apiUrl ?? ''}</output>
      <output data-testid="warning">{session.settingsWarning ?? ''}</output>
      <output data-testid="state">{session.instanceState ?? ''}</output>
      <output data-testid="chats">{session.chats.length}</output>
    </div>
  )
}

declare global {
  interface Window {
    sessionAppendResults?: boolean[]
  }
}

describe('SessionProvider', () => {
  it('connects authorized instance with incompatible settings warning without starting poller', async () => {
    let receiveCalls = 0

    server.use(
      http.get(`${baseUrl}/getStateInstance/apiTokenInstance`, () =>
        HttpResponse.json({ stateInstance: 'authorized' }),
      ),
      http.get(`${baseUrl}/getSettings/apiTokenInstance`, () =>
        HttpResponse.json({
          incomingWebhook: 'no',
          webhookUrl: '',
        }),
      ),
      http.get(`${baseUrl}/receiveNotification/apiTokenInstance`, () => {
        receiveCalls += 1
        return HttpResponse.text('')
      }),
    )

    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(screen.getByTestId('api-url')).toHaveTextContent('https://api.green-api.example')
    })
    expect(screen.getByTestId('state')).toHaveTextContent('authorized')
    expect(screen.getByTestId('warning')).toHaveTextContent(
      'Входящие вебхуки не настроены: получение сообщений может не работать.',
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(receiveCalls).toBe(0)
  })

  it('stops the wired receive poller after disconnect', async () => {
    let receiveCalls = 0

    server.use(
      http.get(`${baseUrl}/getStateInstance/apiTokenInstance`, () =>
        HttpResponse.json({ stateInstance: 'authorized' }),
      ),
      http.get(`${baseUrl}/getSettings/apiTokenInstance`, () =>
        HttpResponse.json({
          incomingWebhook: 'yes',
          webhookUrl: '',
        }),
      ),
      http.get(`${baseUrl}/receiveNotification/apiTokenInstance`, async () => {
        receiveCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return HttpResponse.text('')
      }),
    )

    function DisconnectProbe() {
      const session = useSession()

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              void session.connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstance',
                apiTokenInstance: 'apiTokenInstance',
              })
            }}
          >
            connect
          </button>
          <button type="button" onClick={session.disconnect}>
            disconnect
          </button>
          <output data-testid="state">{session.instanceState ?? ''}</output>
        </div>
      )
    }

    render(
      <SessionProvider>
        <DisconnectProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('authorized')
    })
    await waitFor(() => {
      expect(receiveCalls).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'disconnect' }))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('')
    })
    const callsAfterDisconnect = receiveCalls

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(receiveCalls).toBe(callsAfterDisconnect)
  })

  it('stops the wired receive poller after provider unmount', async () => {
    let receiveCalls = 0

    server.use(
      http.get(`${baseUrl}/getStateInstance/apiTokenInstance`, () =>
        HttpResponse.json({ stateInstance: 'authorized' }),
      ),
      http.get(`${baseUrl}/getSettings/apiTokenInstance`, () =>
        HttpResponse.json({
          incomingWebhook: 'yes',
          webhookUrl: '',
        }),
      ),
      http.get(`${baseUrl}/receiveNotification/apiTokenInstance`, async () => {
        receiveCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return HttpResponse.text('')
      }),
    )

    const { unmount } = render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('authorized')
    })
    await waitFor(() => {
      expect(receiveCalls).toBeGreaterThan(0)
    })

    unmount()
    const callsAfterUnmount = receiveCalls

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(receiveCalls).toBe(callsAfterUnmount)
  })

  it('rejects connect when instance state is not authorized', async () => {
    server.use(
      http.get(`${baseUrl}/getStateInstance/apiTokenInstance`, () =>
        HttpResponse.json({ stateInstance: 'blocked' }),
      ),
    )

    let connectError: unknown

    function RejectProbe() {
      const session = useSession()

      return (
        <button
          type="button"
          onClick={() => {
            void session
              .connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstance',
                apiTokenInstance: 'apiTokenInstance',
              })
              .catch((error: unknown) => {
                connectError = error
              })
          }}
        >
          connect
        </button>
      )
    }

    render(
      <SessionProvider>
        <RejectProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(connectError).toEqual(new Error('Инстанс заблокирован.'))
    })
  })

  it('clears chats when connecting a new instance without disconnect', async () => {
    const instanceAUrl = `${baseUrl}/getStateInstance/apiTokenInstance`
    const instanceASettings = `${baseUrl}/getSettings/apiTokenInstance`
    const instanceBBase = 'https://api.green-api.example/waInstanceidInstanceB'
    const instanceBState = `${instanceBBase}/getStateInstance/apiTokenInstance`
    const instanceBSettings = `${instanceBBase}/getSettings/apiTokenInstance`

    server.use(
      http.get(instanceAUrl, () => HttpResponse.json({ stateInstance: 'authorized' })),
      http.get(instanceASettings, () =>
        HttpResponse.json({ incomingWebhook: 'yes', webhookUrl: '' }),
      ),
      http.get(instanceBState, () => HttpResponse.json({ stateInstance: 'authorized' })),
      http.get(instanceBSettings, () =>
        HttpResponse.json({ incomingWebhook: 'yes', webhookUrl: '' }),
      ),
    )

    function ReconnectProbe() {
      const session = useSession()

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              void session.connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstance',
                apiTokenInstance: 'apiTokenInstance',
              })
            }}
          >
            connect A
          </button>
          <button
            type="button"
            onClick={() => {
              session.addChat({
                chatId: '79991111111@c.us',
                phoneNumber: '79991111111',
                title: 'Chat A',
              })
            }}
          >
            add chat A
          </button>
          <button
            type="button"
            onClick={() => {
              void session.connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstanceB',
                apiTokenInstance: 'apiTokenInstance',
              })
            }}
          >
            connect B
          </button>
          <output data-testid="chat-ids">{session.chats.map((chat) => chat.chatId).join(',')}</output>
          <output data-testid="chats-count">{session.chats.length}</output>
        </div>
      )
    }

    render(
      <SessionProvider>
        <ReconnectProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'connect A' }))
    await waitFor(() => {
      expect(screen.getByTestId('chats-count')).toHaveTextContent('0')
    })

    fireEvent.click(screen.getByRole('button', { name: 'add chat A' }))
    await waitFor(() => {
      expect(screen.getByTestId('chats-count')).toHaveTextContent('1')
      expect(screen.getByTestId('chat-ids')).toHaveTextContent('79991111111@c.us')
    })

    fireEvent.click(screen.getByRole('button', { name: 'connect B' }))
    await waitFor(() => {
      expect(screen.getByTestId('chats-count')).toHaveTextContent('0')
      expect(screen.getByTestId('chat-ids')).toHaveTextContent('')
    })
  })

  it('stops stale poller before awaiting a reconnect with new credentials', async () => {
    let receiveCalls = 0

    server.use(
      http.get(`${baseUrl}/getStateInstance/apiTokenInstance`, () =>
        HttpResponse.json({ stateInstance: 'authorized' }),
      ),
      http.get(`${baseUrl}/getSettings/apiTokenInstance`, () =>
        HttpResponse.json({
          incomingWebhook: 'yes',
          webhookUrl: '',
        }),
      ),
      http.get(`${baseUrl}/receiveNotification/apiTokenInstance`, async () => {
        receiveCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return HttpResponse.text('')
      }),
      http.get(
        'https://api.green-api.example/waInstanceidInstanceB/getStateInstance/apiTokenInstance',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return HttpResponse.json({ stateInstance: 'authorized' })
        },
      ),
      http.get(
        'https://api.green-api.example/waInstanceidInstanceB/getSettings/apiTokenInstance',
        () =>
          HttpResponse.json({
            incomingWebhook: 'yes',
            webhookUrl: '',
          }),
      ),
      http.get(
        'https://api.green-api.example/waInstanceidInstanceB/receiveNotification/apiTokenInstance',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return HttpResponse.text('')
        },
      ),
    )

    function ReconnectRaceProbe() {
      const session = useSession()

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              void session.connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstance',
                apiTokenInstance: 'apiTokenInstance',
              })
            }}
          >
            connect A
          </button>
          <button
            type="button"
            onClick={() => {
              void session.connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstanceB',
                apiTokenInstance: 'apiTokenInstance',
              })
            }}
          >
            connect B
          </button>
          <output data-testid="state">{session.instanceState ?? ''}</output>
        </div>
      )
    }

    render(
      <SessionProvider>
        <ReconnectRaceProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'connect A' }))

    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('authorized')
    })
    await waitFor(() => {
      expect(receiveCalls).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'connect B' }))
    const callsAfterReconnectStart = receiveCalls

    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(receiveCalls).toBe(callsAfterReconnectStart)
  })

  it('keeps a single poller when two connect calls overlap and both finish', async () => {
    let releaseA: (() => void) | undefined
    const aGate = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    let receiveCallsA = 0
    let receiveCallsB = 0

    server.use(
      http.get(`${baseUrl}/getStateInstance/apiTokenInstance`, async () => {
        await aGate
        return HttpResponse.json({ stateInstance: 'authorized' })
      }),
      http.get(`${baseUrl}/getSettings/apiTokenInstance`, () =>
        HttpResponse.json({
          incomingWebhook: 'yes',
          webhookUrl: '',
        }),
      ),
      http.get(`${baseUrl}/receiveNotification/apiTokenInstance`, async () => {
        receiveCallsA += 1
        await new Promise((resolve) => setTimeout(resolve, 20))
        return HttpResponse.text('')
      }),
      http.get(
        'https://api.green-api.example/waInstanceidInstanceB/getStateInstance/apiTokenInstance',
        () => HttpResponse.json({ stateInstance: 'authorized' }),
      ),
      http.get(
        'https://api.green-api.example/waInstanceidInstanceB/getSettings/apiTokenInstance',
        () =>
          HttpResponse.json({
            incomingWebhook: 'yes',
            webhookUrl: '',
          }),
      ),
      http.get(
        'https://api.green-api.example/waInstanceidInstanceB/receiveNotification/apiTokenInstance',
        async () => {
          receiveCallsB += 1
          await new Promise((resolve) => setTimeout(resolve, 20))
          return HttpResponse.text('')
        },
      ),
    )

    function OverlapConnectProbe() {
      const session = useSession()

      return (
        <div>
          <button
            type="button"
            onClick={() => {
              void session.connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstance',
                apiTokenInstance: 'apiTokenInstance',
              })
            }}
          >
            connect A
          </button>
          <button
            type="button"
            onClick={() => {
              void session.connect({
                apiUrl: 'https://api.green-api.example',
                idInstance: 'idInstanceB',
                apiTokenInstance: 'apiTokenInstance',
              })
            }}
          >
            connect B
          </button>
          <output data-testid="id">{session.credentials?.idInstance ?? ''}</output>
        </div>
      )
    }

    render(
      <SessionProvider>
        <OverlapConnectProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'connect A' }))
    fireEvent.click(screen.getByRole('button', { name: 'connect B' }))

    await waitFor(() => {
      expect(screen.getByTestId('id')).toHaveTextContent('idInstanceB')
    })
    await waitFor(() => {
      expect(receiveCallsB).toBeGreaterThan(0)
    })

    releaseA?.()

    await waitFor(() => {
      expect(screen.getByTestId('id')).toHaveTextContent('idInstanceB')
    })

    const receiveCallsAAfterRelease = receiveCallsA
    const receiveCallsBAfterRelease = receiveCallsB

    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(receiveCallsA).toBe(receiveCallsAAfterRelease)
    expect(receiveCallsA).toBe(0)
    expect(receiveCallsB).toBeGreaterThanOrEqual(receiveCallsBAfterRelease)
  })

  it('deduplicates appended messages by idMessage globally', async () => {
    render(
      <SessionProvider>
        <SessionProbe />
      </SessionProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'append duplicate' }))

    expect(window.sessionAppendResults).toEqual([true, false])
    await waitFor(() => {
      expect(screen.getByTestId('chats')).toHaveTextContent('1')
    })
  })
})
