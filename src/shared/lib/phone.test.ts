import { normalizePhoneDigits, validateCheckAccountPhone } from './phone'

it('strips formatting', () => {
  expect(normalizePhoneDigits(' +7 (999) 123-45-67 ')).toBe('79991234567')
})

it('accepts RF 11 digits starting with 7', () => {
  expect(validateCheckAccountPhone('79991234567')).toEqual({
    ok: true,
    phoneNumber: 79991234567,
  })
})

it('accepts RB 12 digits starting with 375', () => {
  expect(validateCheckAccountPhone('375291234567')).toEqual({
    ok: true,
    phoneNumber: 375291234567,
  })
})

it('rejects wrong length/prefix without inventing digits', () => {
  expect(validateCheckAccountPhone('9991234567').ok).toBe(false)
  expect(validateCheckAccountPhone('18005551234').ok).toBe(false)
})

it('rejects 11-digit 375 and 12-digit 7 prefix mismatches', () => {
  expect(validateCheckAccountPhone('37529123456').ok).toBe(false)
  expect(validateCheckAccountPhone('799912345678').ok).toBe(false)
})
