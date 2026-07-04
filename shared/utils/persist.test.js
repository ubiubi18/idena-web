import {persistItem, persistState} from './persist'

const SECRET_API_KEY = ['secret-api-key', 'that-should-not-be-logged'].join('-')
const SECRET_ENCRYPTED_KEY = [
  'encrypted-key',
  'that-should-not-be-logged',
].join('-')
const SECRET_VALUE = ['secret-value', 'that-should-not-be-logged'].join('-')

describe('persistent storage logging', () => {
  let consoleError
  let setItem

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })
  })

  afterEach(() => {
    consoleError.mockRestore()
    setItem.mockRestore()
  })

  it('does not log state values when persisting state fails', () => {
    persistState('settings', {
      apiKey: SECRET_API_KEY,
      encryptedKey: SECRET_ENCRYPTED_KEY,
    })

    const logged = JSON.stringify(consoleError.mock.calls)

    expect(logged).toContain('settings')
    expect(logged).not.toContain(SECRET_API_KEY)
    expect(logged).not.toContain(SECRET_ENCRYPTED_KEY)
  })

  it('does not log item values when persisting an item fails', () => {
    persistItem('settings', 'apiKey', SECRET_VALUE)

    const logged = JSON.stringify(consoleError.mock.calls)

    expect(logged).toContain('settings')
    expect(logged).toContain('apiKey')
    expect(logged).not.toContain(SECRET_VALUE)
  })
})
