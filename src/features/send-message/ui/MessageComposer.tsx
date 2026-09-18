import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { MESSAGE_MAX_LENGTH } from '@/shared/config/constants'

type MessageComposerProps = {
  onSend(text: string): Promise<void>
}

export function MessageComposer({ onSend }: MessageComposerProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const isSendingRef = useRef(false)
  const trimmedText = text.trim()

  const submit = async () => {
    if (isSendingRef.current) {
      return
    }

    if (!trimmedText) {
      setError('Введите сообщение')
      return
    }

    if (trimmedText.length > MESSAGE_MAX_LENGTH) {
      setError(`Сообщение длиннее ${MESSAGE_MAX_LENGTH} символов`)
      return
    }

    isSendingRef.current = true
    setIsSending(true)
    setError(null)

    try {
      await onSend(text)
      setText('')
    } catch (error) {
      console.error('Не удалось отправить сообщение', error)
      setError(error instanceof Error ? error.message : 'Не удалось отправить сообщение')
    } finally {
      isSendingRef.current = false
      setIsSending(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    void submit()
  }

  return (
    <form aria-busy={isSending} className="message-composer" onSubmit={handleSubmit}>
      <label className="message-composer__field">
        Сообщение
        <textarea
          disabled={isSending}
          placeholder="Введите сообщение"
          rows={3}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
        />
      </label>

      <div className="message-composer__footer">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <span />
        )}
        <button className="primary-button" disabled={!trimmedText || isSending} type="submit">
          {isSending ? 'Отправляем...' : 'Отправить'}
        </button>
      </div>
    </form>
  )
}
