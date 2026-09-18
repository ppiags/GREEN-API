export function normalizePhoneDigits(input: string): string {
  return input.trim().replace(/[\s+\-()]/g, '').replace(/\D/g, '')
}

export function validateCheckAccountPhone(digits: string) {
  if (!/^\d+$/.test(digits)) {
    return { ok: false as const, reason: 'Номер должен содержать только цифры' }
  }
  const isRf = digits.length === 11 && digits.startsWith('7')
  const isRb = digits.length === 12 && digits.startsWith('375')
  if (!isRf && !isRb) {
    if (digits.length !== 11 && digits.length !== 12) {
      return { ok: false as const, reason: 'Номер должен содержать 11 или 12 цифр' }
    }
    return {
      ok: false as const,
      reason: 'CheckAccount поддерживает только номера РФ (7) и РБ (375)',
    }
  }
  return { ok: true as const, phoneNumber: Number(digits) }
}
