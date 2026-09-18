import { useEffect, useRef, useState } from 'react'

import { useSession } from '@/shared/session/SessionProvider'
import { ChatListItem } from '@/entities/chat/ui/ChatListItem'
import { MessageBubble } from '@/entities/message/ui/MessageBubble'
import { createChatFromPhone } from '@/features/create-chat/model/createChat'
import { NewChatModal } from '@/features/create-chat/ui/NewChatModal'
import { sendTextMessage } from '@/features/send-message/model/sendText'
import { MessageComposer } from '@/features/send-message/ui/MessageComposer'

import styles from './MessengerPage.module.css'

export function MessengerPage() {
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const messagesEndRef = useRef<HTMLLIElement>(null)
  const {
    activeChatId,
    addChat,
    appendMessage,
    chats,
    credentials,
    disconnect,
    getClient,
    setActiveChatId,
    settingsWarning,
  } = useSession()
  const activeChat = chats.find((chat) => chat.chatId === activeChatId) ?? null
  const messageCount = activeChat?.messages.length ?? 0

  useEffect(() => {
    const anchor = messagesEndRef.current

    if (!anchor || typeof anchor.scrollIntoView !== 'function') {
      return
    }

    anchor.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [activeChatId, messageCount])

  const handleCreateChat = async (rawPhone: string) => {
    const client = getClient()

    if (!client) {
      throw new Error('Инстанс не подключен')
    }

    const chat = await createChatFromPhone(client, rawPhone)
    addChat({
      chatId: chat.chatId,
      phoneNumber: chat.phoneNumber,
      title: chat.phoneNumber,
    })
    setActiveChatId(chat.chatId)
  }

  const handleSendMessage = async (text: string) => {
    const client = getClient()

    if (!client || !activeChatId) {
      throw new Error('Чат не выбран')
    }

    const message = await sendTextMessage({
      client,
      chatId: activeChatId,
      text,
    })

    appendMessage({
      idMessage: message.idMessage,
      chatId: activeChatId,
      text: message.text,
      timestamp: Date.now(),
      direction: 'outgoing',
    })
  }

  const shellClassName = activeChat ? `${styles.shell} ${styles.shellChatOpen}` : styles.shell

  return (
    <main className={shellClassName}>
      <aside className={styles.sidebar} aria-label="Список чатов">
        <header className="instance-header">
          <div>
            <p className="eyebrow">Инстанс</p>
            <h1>{credentials?.idInstance}</h1>
          </div>
          <button className="ghost-button" type="button" onClick={disconnect}>
            Отключить
          </button>
        </header>

        {settingsWarning ? <p className="warning-banner">{settingsWarning}</p> : null}

        <button className="new-chat-button" type="button" onClick={() => setIsNewChatOpen(true)}>
          Новый чат
        </button>

        <nav className={styles.chatList} aria-label="Чаты">
          {chats.length === 0 ? (
            <p className={styles.emptyChats}>Чатов пока нет.</p>
          ) : (
            chats.map((chat) => (
              <ChatListItem
                isActive={chat.chatId === activeChatId}
                key={chat.chatId}
                phoneNumber={chat.phoneNumber}
                title={chat.title}
                onSelect={() => setActiveChatId(chat.chatId)}
              />
            ))
          )}
        </nav>
      </aside>

      <section className={styles.conversationPane} aria-label="Окно чата">
        {activeChat ? (
          <div className={styles.conversationCard}>
            <header className={styles.conversationHeader}>
              <button
                className={styles.backButton}
                type="button"
                onClick={() => setActiveChatId(null)}
              >
                Назад
              </button>
              <div className={styles.headerText}>
                <p className="eyebrow">Активный чат</p>
                <h2>{activeChat.title}</h2>
              </div>
            </header>

            <ol className={styles.messageList} aria-label="Сообщения" aria-live="polite">
              {activeChat.messages.length === 0 ? (
                <li className={styles.emptyMessages}>Сообщений пока нет. Напишите первое.</li>
              ) : (
                activeChat.messages.map((message) => (
                  <MessageBubble key={message.idMessage} message={message} />
                ))
              )}
              <li aria-hidden="true" ref={messagesEndRef} />
            </ol>

            <MessageComposer onSend={handleSendMessage} />
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p className={styles.emptyStateIcon} aria-hidden="true">
              +
            </p>
            <h2>Чат не выбран</h2>
            <p>Выберите чат слева или создайте новый.</p>
          </div>
        )}
      </section>

      {isNewChatOpen ? (
        <NewChatModal onClose={() => setIsNewChatOpen(false)} onCreate={handleCreateChat} />
      ) : null}
    </main>
  )
}
