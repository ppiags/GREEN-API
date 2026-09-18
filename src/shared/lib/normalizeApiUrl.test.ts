import { normalizeApiUrl } from './normalizeApiUrl'

it('trims trailing slash and requires http(s)', () => {
  expect(normalizeApiUrl(' https://example.green-api.com/ ')).toEqual({
    ok: true,
    apiUrl: 'https://example.green-api.com',
  })
  expect(normalizeApiUrl('ftp://x').ok).toBe(false)
  expect(normalizeApiUrl('').ok).toBe(false)
})
