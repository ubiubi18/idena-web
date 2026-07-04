import {redactLogAction, redactLogValue} from './use-logger'

const SECRET_API_KEY = ['secret-api-key', 'that-should-not-be-logged'].join('-')
const SECRET_PRIVATE_KEY = ['private-key', 'that-should-not-be-logged'].join(
  '-'
)
const SECRET_SIGNATURE = ['signature', 'that-should-not-be-logged'].join('-')

describe('useLogger redaction', () => {
  it('redacts nested sensitive state values', () => {
    const redacted = redactLogValue({
      profile: {
        apiKey: SECRET_API_KEY,
        publicName: 'alice',
      },
      keys: [{privateKey: SECRET_PRIVATE_KEY}],
    })

    const logged = JSON.stringify(redacted)

    expect(logged).toContain('[redacted]')
    expect(logged).toContain('alice')
    expect(logged).not.toContain(SECRET_API_KEY)
    expect(logged).not.toContain(SECRET_PRIVATE_KEY)
  })

  it('redacts sensitive action payloads', () => {
    const redacted = redactLogAction({
      type: 'SET_EXTERNAL_KEY',
      data: SECRET_PRIVATE_KEY,
    })

    expect(redacted).toEqual({
      type: 'SET_EXTERNAL_KEY',
      data: '[redacted]',
    })
  })

  it('redacts signatures by key and handles circular objects', () => {
    const value = {signature: SECRET_SIGNATURE}
    value.self = value

    const redacted = redactLogValue(value)

    expect(redacted.signature).toBe('[redacted]')
    expect(redacted.self).toBe('[circular]')
    expect(JSON.stringify(redacted)).not.toContain(SECRET_SIGNATURE)
  })
})
