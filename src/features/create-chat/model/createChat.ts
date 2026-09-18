import type { GreenApiClient } from '@/shared/api/types'
import { normalizePhoneDigits, validateCheckAccountPhone } from '@/shared/lib/phone'

export async function createChatFromPhone(
  client: GreenApiClient,
  rawPhone: string,
): Promise<{ phoneNumber: string; chatId: string }> {
  const phoneNumber = normalizePhoneDigits(rawPhone)
  const validation = validateCheckAccountPhone(phoneNumber)

  if (!validation.ok) {
    throw new Error(validation.reason)
  }

  const account = await client.checkAccount(validation.phoneNumber)

  if (!account.exist || !account.chatId) {
    throw new Error('Аккаунт MAX не найден')
  }

  return {
    phoneNumber,
    chatId: account.chatId,
  }
}
