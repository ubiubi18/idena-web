import {normalizeExternalUrl, openExternalUrl} from './utils'

describe('openExternalUrl', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('opens external URLs without giving the new page an opener', () => {
    const openedWindow = {opener: {location: 'about:blank'}}
    jest.spyOn(window, 'open').mockReturnValue(openedWindow)

    expect(openExternalUrl('https://example.com')).toBe(openedWindow)

    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/',
      '_blank',
      'noopener,noreferrer'
    )
    expect(openedWindow.opener).toBeNull()
  })

  it('normalizes supported URL values', () => {
    expect(normalizeExternalUrl(' https://example.com/path ')).toBe(
      'https://example.com/path'
    )
    expect(normalizeExternalUrl(new URL('dna://signin/v1?token=abc'))).toBe(
      'dna://signin/v1?token=abc'
    )
  })

  it('blocks unsafe external URL schemes', () => {
    jest.spyOn(window, 'open').mockReturnValue({})

    expect(openExternalUrl(`java${'script'}:alert(1)`)).toBeNull()
    expect(openExternalUrl('https://user:pass@example.com')).toBeNull()
    expect(openExternalUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    expect(openExternalUrl('file:///tmp/private')).toBeNull()
    expect(openExternalUrl('/relative/path')).toBeNull()

    expect(window.open).not.toHaveBeenCalled()
  })

  it('handles blocked popups', () => {
    jest.spyOn(window, 'open').mockReturnValue(null)

    expect(openExternalUrl('https://example.com')).toBeNull()
  })
})
