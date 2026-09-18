import { normalizeApiUrl } from '@/shared/lib/normalizeApiUrl'
import { GreenApiValidationError } from './errors'
import type { InstanceCredentials } from './types'

export function buildInstanceUrl(
  creds: InstanceCredentials,
  method: string,
  suffix = '',
): string {
  const normalized = normalizeApiUrl(creds.apiUrl)

  if (!normalized.ok) {
    throw new GreenApiValidationError(normalized.reason)
  }

  return `${normalized.apiUrl}/waInstance${creds.idInstance}/${method}/${creds.apiTokenInstance}${suffix}`
}
