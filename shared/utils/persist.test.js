import {
  loadPersistentState,
  persistItem,
  persistState,
  stateForPersistence,
} from './persist'

const VALUE_ALPHA = ['fixture-alpha', 'must-not-be-logged'].join('-')
const VALUE_BETA = ['fixture-beta', 'must-not-be-logged'].join('-')
const VALUE_GAMMA = ['fixture-gamma', 'must-not-be-logged'].join('-')

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
      apiKey: VALUE_ALPHA,
      encryptedKey: VALUE_BETA,
    })

    const logged = JSON.stringify(consoleError.mock.calls)

    expect(logged).toContain('settings')
    expect(logged).not.toContain(VALUE_ALPHA)
    expect(logged).not.toContain(VALUE_BETA)
  })

  it('does not log item values when persisting an item fails', () => {
    persistItem('settings', 'apiKey', VALUE_GAMMA)

    const logged = JSON.stringify(consoleError.mock.calls)

    expect(logged).toContain('settings')
    expect(logged).toContain('apiKey')
    expect(logged).not.toContain(VALUE_GAMMA)
  })
})

describe('sensitive settings storage', () => {
  beforeEach(() => {
    persistState('settings', null)
    localStorage.clear()
  })

  it('removes node API keys before settings are persisted', () => {
    const state = {
      apiKey: VALUE_ALPHA,
      apiKeyData: {key: VALUE_GAMMA, provider: 'provider'},
      nodeProviderId: 'provider',
      secondaryNodes: [{url: 'https://node.example', apiKey: VALUE_GAMMA}],
      useSecondary: true,
      url: 'https://node.example',
    }

    expect(stateForPersistence('settings', state)).toEqual({
      nodeProviderId: 'provider',
      useSecondary: false,
      url: 'https://node.example',
    })

    persistState('settings', state)

    const stored = localStorage.getItem('settings')
    expect(stored).not.toContain(VALUE_ALPHA)
    expect(stored).not.toContain(VALUE_GAMMA)
    expect(loadPersistentState('settings')).toBe(state)
  })

  it('scrubs API keys left by earlier releases when settings are loaded', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({
        apiKey: VALUE_ALPHA,
        apiKeyData: {key: VALUE_GAMMA, provider: 'provider'},
        language: 'en',
      })
    )

    expect(loadPersistentState('settings')).toEqual({
      apiKey: VALUE_ALPHA,
      apiKeyData: {key: VALUE_GAMMA, provider: 'provider'},
      nodeProviderId: 'provider',
      language: 'en',
    })
    expect(localStorage.getItem('settings')).toBe(
      JSON.stringify({language: 'en'})
    )
  })

  it('does not alter non-settings state', () => {
    const state = {apiKey: VALUE_ALPHA}
    expect(stateForPersistence('other', state)).toBe(state)
  })
})
