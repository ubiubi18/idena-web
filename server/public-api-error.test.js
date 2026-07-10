import {publicValidationError} from './public-api-error'

describe('public validation API errors', () => {
  it('preserves known validation failures', () => {
    expect(publicValidationError(new Error('signature is invalid'))).toBe(
      'signature is invalid'
    )
  })

  it('does not expose unexpected exception text as a response', () => {
    const exceptionText = '<img src=x onerror=alert(1)>'
    expect(publicValidationError(new Error(exceptionText))).toBe(
      'Request failed'
    )
    expect(publicValidationError(new Error(exceptionText))).not.toContain(
      exceptionText
    )
  })
})
