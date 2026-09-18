import { useState, type FormEvent } from 'react'

type NewChatModalProps = {
  onClose(): void
  onCreate(rawPhone: string): Promise<void>
}

export function NewChatModal({ onClose, onCreate }: NewChatModalProps) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await onCreate(phone)
      setPhone('')
      onClose()
    } catch (error) {
      console.error('Не удалось создать чат', error)
      setError(error instanceof Error ? error.message : 'Не удалось создать чат')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        aria-labelledby="new-chat-title"
        aria-modal="true"
        className="modal-card"
        role="dialog"
      >
        <div className="modal-card__header">
          <h2 id="new-chat-title">Новый чат</h2>
          <button className="ghost-button" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>

        <form className="new-chat-form" onSubmit={handleSubmit}>
          <label className="field">
            Номер телефона
            <input
              autoFocus
              inputMode="tel"
              placeholder="+7 999 123 45 67"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
                setError(null)
              }}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Проверяем...' : 'Создать чат'}
          </button>
        </form>
      </div>
    </div>
  )
}
