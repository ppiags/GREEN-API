import { SessionProvider, useSession } from '@/shared/session/SessionProvider'
import { ConnectForm } from '@/features/auth/ui/ConnectForm'
import { MessengerPage } from '@/pages/messenger/MessengerPage'

function AppContent() {
  const { credentials } = useSession()

  return credentials ? <MessengerPage /> : <ConnectForm />
}

export default function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  )
}
