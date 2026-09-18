import styles from './ChatListItem.module.css'

type ChatListItemProps = {
  title: string
  phoneNumber: string
  isActive: boolean
  onSelect(): void
}

export function ChatListItem({ title, phoneNumber, isActive, onSelect }: ChatListItemProps) {
  return (
    <button
      aria-current={isActive ? 'true' : undefined}
      className={`${styles.item} ${isActive ? styles.active : ''}`}
      type="button"
      onClick={onSelect}
    >
      <span className={styles.title}>{title}</span>
      <small className={styles.phone}>{phoneNumber}</small>
    </button>
  )
}
