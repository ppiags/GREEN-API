import type { Message } from '@/entities/message/model/types'

import styles from './MessageBubble.module.css'

type MessageBubbleProps = {
  message: Message
}

function formatMessageTime(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutgoing = message.direction === 'outgoing'

  return (
    <li
      className={`${styles.root} ${isOutgoing ? styles.outgoing : styles.incoming}`}
      data-testid={`message-${message.idMessage}`}
    >
      <p className={styles.text}>{message.text}</p>
      <time className={styles.time} dateTime={new Date(message.timestamp).toISOString()}>
        {formatMessageTime(message.timestamp)}
      </time>
    </li>
  )
}
