import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import type { Chat } from '@/entities/chat/model/types'
import type { Message } from '@/entities/message/model/types'
import { startNotificationPoller } from '@/features/receive-messages/model/notificationPoller'
import { createGreenApiClient } from '@/shared/api/greenApi'
import type {
  GreenApiClient,
  InstanceCredentials,
  InstanceState,
} from '@/shared/api/types'
import { normalizeApiUrl } from '@/shared/lib/normalizeApiUrl'

export type SessionContextValue = {
  credentials: InstanceCredentials | null
  instanceState: InstanceState | null
  settingsWarning: string | null
  chats: Chat[]
  activeChatId: string | null
  connect(input: {
    idInstance: string
    apiTokenInstance: string
    apiUrl: string
  }): Promise<void>
  disconnect(): void
  addChat(chat: Omit<Chat, 'messages'> & { messages?: Message[] }): void
  setActiveChatId(id: string | null): void
  appendMessage(message: Message): boolean
  getClient(): GreenApiClient | null
}

type SessionPollerInput = {
  client: GreenApiClient
  signal: AbortSignal
  appendMessage(message: Message): boolean
}

const SETTINGS_WARNING =
  'Входящие вебхуки не настроены: получение сообщений может не работать.'

const UNAUTHORIZED_STATE_ERRORS: Record<Exclude<InstanceState, 'authorized'>, string> = {
  notAuthorized: 'Инстанс не авторизован. Авторизуйте аккаунт в GREEN-API.',
  blocked: 'Инстанс заблокирован.',
  starting: 'Инстанс запускается. Повторите попытку позже.',
  suspended: 'Инстанс приостановлен.',
  pendingPassword: 'Инстанс ожидает пароль. Завершите авторизацию в GREEN-API.',
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function startSessionPoller(input: SessionPollerInput): () => void {
  const controller = new AbortController()
  const abortFromSession = () => {
    controller.abort()
  }

  if (input.signal.aborted) {
    controller.abort()
  } else {
    input.signal.addEventListener('abort', abortFromSession, { once: true })
  }

  void startNotificationPoller({
    client: input.client,
    signal: controller.signal,
    onIncoming: (message) => {
      input.appendMessage(message)
    },
  }).catch((error: unknown) => {
    if (!controller.signal.aborted) {
      console.error('GREEN-API notification poller stopped unexpectedly', error)
    }
  })

  return () => {
    input.signal.removeEventListener('abort', abortFromSession)
    controller.abort()
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [credentials, setCredentials] = useState<InstanceCredentials | null>(null)
  const [instanceState, setInstanceState] = useState<InstanceState | null>(null)
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const clientRef = useRef<GreenApiClient | null>(null)
  const pollerAbortRef = useRef<AbortController | null>(null)
  const stopPollerRef = useRef<(() => void) | null>(null)
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  const connectGenerationRef = useRef(0)

  const stopCurrentPoller = useCallback(() => {
    pollerAbortRef.current?.abort()
    pollerAbortRef.current = null
    stopPollerRef.current?.()
    stopPollerRef.current = null
  }, [])

  useEffect(() => () => stopCurrentPoller(), [stopCurrentPoller])

  const addChat = useCallback((chat: Omit<Chat, 'messages'> & { messages?: Message[] }) => {
    const nextChat: Chat = {
      ...chat,
      messages: chat.messages ?? [],
    }

    setChats((currentChats) => {
      const existingIndex = currentChats.findIndex((item) => item.chatId === nextChat.chatId)

      if (existingIndex === -1) {
        return [...currentChats, nextChat]
      }

      return currentChats.map((item, index) => (index === existingIndex ? nextChat : item))
    })
  }, [])

  const appendMessage = useCallback((message: Message): boolean => {
    if (seenMessageIdsRef.current.has(message.idMessage)) {
      return false
    }

    seenMessageIdsRef.current.add(message.idMessage)
    setChats((currentChats) => {
      const existingChat = currentChats.find((chat) => chat.chatId === message.chatId)

      if (!existingChat) {
        return [
          ...currentChats,
          {
            chatId: message.chatId,
            phoneNumber: message.chatId.replace(/@c\.us$/, ''),
            title: message.chatId,
            messages: [message],
          },
        ]
      }

      return currentChats.map((chat) =>
        chat.chatId === message.chatId
          ? { ...chat, messages: [...chat.messages, message] }
          : chat,
      )
    })

    return true
  }, [])

  const disconnect = useCallback(() => {
    connectGenerationRef.current += 1
    stopCurrentPoller()
    clientRef.current = null
    seenMessageIdsRef.current.clear()
    setCredentials(null)
    setInstanceState(null)
    setSettingsWarning(null)
    setChats([])
    setActiveChatId(null)
  }, [stopCurrentPoller])

  const connect = useCallback(
    async (input: {
      idInstance: string
      apiTokenInstance: string
      apiUrl: string
    }): Promise<void> => {
      const generation = ++connectGenerationRef.current
      stopCurrentPoller()

      const normalized = normalizeApiUrl(input.apiUrl)

      if (!normalized.ok) {
        throw new Error(normalized.reason)
      }

      const nextCredentials: InstanceCredentials = {
        apiUrl: normalized.apiUrl,
        idInstance: input.idInstance,
        apiTokenInstance: input.apiTokenInstance,
      }
      const nextClient = createGreenApiClient(nextCredentials)
      const { stateInstance } = await nextClient.getStateInstance()

      if (generation !== connectGenerationRef.current) {
        return
      }

      if (stateInstance !== 'authorized') {
        throw new Error(UNAUTHORIZED_STATE_ERRORS[stateInstance])
      }

      const settings = await nextClient.getSettings()

      if (generation !== connectGenerationRef.current) {
        return
      }

      const nextSettingsWarning =
        settings.incomingWebhook !== 'yes' || settings.webhookUrl.trim() !== ''
          ? SETTINGS_WARNING
          : null

      seenMessageIdsRef.current.clear()
      setChats([])
      setActiveChatId(null)
      clientRef.current = nextClient
      stopCurrentPoller()

      if (!nextSettingsWarning) {
        const pollerAbortController = new AbortController()
        pollerAbortRef.current = pollerAbortController
        stopPollerRef.current = startSessionPoller({
          client: nextClient,
          signal: pollerAbortController.signal,
          appendMessage,
        })
      }

      setCredentials(nextCredentials)
      setInstanceState(stateInstance)
      setSettingsWarning(nextSettingsWarning)
    },
    [appendMessage, stopCurrentPoller],
  )

  const getClient = useCallback(() => clientRef.current, [])

  const value = useMemo<SessionContextValue>(
    () => ({
      credentials,
      instanceState,
      settingsWarning,
      chats,
      activeChatId,
      connect,
      disconnect,
      addChat,
      setActiveChatId,
      appendMessage,
      getClient,
    }),
    [
      credentials,
      instanceState,
      settingsWarning,
      chats,
      activeChatId,
      connect,
      disconnect,
      addChat,
      appendMessage,
      getClient,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error('useSession должен использоваться внутри SessionProvider')
  }

  return context
}
