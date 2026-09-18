import { useState, type FormEvent } from 'react'

import { useSession } from '@/shared/session/SessionProvider'

export function ConnectForm() {
  const { connect } = useSession()
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setStatus('Проверяем инстанс...')
    setIsConnecting(true)

    try {
      await connect({
        idInstance: idInstance.trim(),
        apiTokenInstance: apiTokenInstance.trim(),
        apiUrl: apiUrl.trim(),
      })
      setStatus('Инстанс подключен.')
    } catch (connectError) {
      console.error('Failed to connect GREEN-API instance', connectError)
      setStatus(null)
      setError(connectError instanceof Error ? connectError.message : 'Не удалось подключиться.')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="connect-title">
        <div className="auth-card__header">
          <p className="eyebrow">GREEN-API MAX Messenger</p>
          <h1 id="connect-title">Подключите инстанс</h1>
          <p className="muted">
            Введите данные из личного кабинета GREEN-API, чтобы открыть мессенджер.
          </p>
        </div>

        <form className="connect-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>idInstance</span>
            <input
              autoComplete="off"
              name="idInstance"
              required
              value={idInstance}
              onChange={(event) => setIdInstance(event.target.value)}
            />
          </label>

          <label className="field">
            <span>apiTokenInstance</span>
            <input
              autoComplete="current-password"
              name="apiTokenInstance"
              required
              type="password"
              value={apiTokenInstance}
              onChange={(event) => setApiTokenInstance(event.target.value)}
            />
          </label>

          <div className="advanced-settings">
            <button
              aria-controls="advanced-settings-panel"
              aria-expanded={isAdvancedOpen}
              className="advanced-settings__toggle"
              type="button"
              onClick={() => setIsAdvancedOpen((current) => !current)}
            >
              Расширенные настройки
            </button>
            {isAdvancedOpen ? (
              <div id="advanced-settings-panel">
                <label className="field">
                  <span>apiUrl</span>
                  <input
                    autoComplete="url"
                    name="apiUrl"
                    required
                    type="url"
                    value={apiUrl}
                    onChange={(event) => setApiUrl(event.target.value)}
                  />
                </label>
                <p className="help-text">
                  apiUrl — отдельный access parameter из консоли GREEN-API. Не вычисляется из
                  idInstance.
                </p>
              </div>
            ) : null}
          </div>

          {status ? <p className="form-status">{status}</p> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="primary-button" disabled={isConnecting} type="submit">
            {isConnecting ? 'Подключаем...' : 'Подключить'}
          </button>
        </form>
      </section>
    </main>
  )
}
