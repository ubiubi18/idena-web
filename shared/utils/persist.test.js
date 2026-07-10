import {
  loadPersistentState,
  persistItem,
  persistState,
  stateForPersistence,
} from './persist'

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

describe('sensitive settings storage', () => {
  beforeEach(() => {
    persistState('settings', null)
    localStorage.clear()
  })

  it('removes node API keys before settings are persisted', () => {
    const state = {
      apiKey: SECRET_API_KEY,
      apiKeyData: {key: SECRET_VALUE, provider: 'provider'},
      secondaryNodes: [{url: 'https://node.example', apiKey: SECRET_VALUE}],
      useSecondary: true,
      url: 'https://node.example',
    }

    expect(stateForPersistence('settings', state)).toEqual({
      apiKeyData: {provider: 'provider'},
      useSecondary: false,
      url: 'https://node.example',
    })

    persistState('settings', state)

    const stored = localStorage.getItem('settings')
    expect(stored).not.toContain(SECRET_API_KEY)
    expect(stored).not.toContain(SECRET_VALUE)
    expect(loadPersistentState('settings')).toBe(state)
  })

  it('scrubs API keys left by earlier releases when settings are loaded', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        apiKey: SECRET_API_KEY,
        apiKeyData: {key: SECRET_VALUE, provider: 'provider'},
        language: 'en',
      })
    )

    expect(loadPersistentState('settings')).toEqual({
      apiKey: SECRET_API_KEY,
      apiKeyData: {key: SECRET_VALUE, provider: 'provider'},
      language: 'en',
    })
    expect(localStorage.getItem('settings')).toBe(
      JSON.stringify({apiKeyData: {provider: 'provider'}, language: 'en'})
    )
  })

  it('does not alter non-settings state', () => {
    const state = {apiKey: SECRET_API_KEY}
    expect(stateForPersistence('other', state)).toBe(state)
  })
})
