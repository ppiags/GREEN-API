export function normalizeApiUrl(input: string) {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false as const, reason: 'apiUrl должен начинаться с http:// или https://' }
  }
  try {
    new URL(trimmed)
  } catch {
    return { ok: false as const, reason: 'Некорректный apiUrl' }
  }
  return { ok: true as const, apiUrl: trimmed }
}
