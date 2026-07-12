const {
  createImageSearchHandler,
  searchImages,
  _internals: {
    createRateLimiter,
    createSearchCache,
    dedupeSearchResults,
    extractDuckDuckGoVqd,
    normalizeImageSearchQuery,
    normalizeImageSearchResult,
    normalizeImageSearchUrl,
  },
} = require('./image-search')

function createResponse() {
  const headers = {}
  return {
    headers,
    statusCode: null,
    body: null,
    setHeader(name, value) {
      headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(value) {
      this.body = value
      return this
    },
  }
}

describe('image search helpers', () => {
  test('extracts current DuckDuckGo vqd token shapes', () => {
    expect(extractDuckDuckGoVqd('vqd="abc-123_ABC.0"')).toBe('abc-123_ABC.0')
    expect(
      extractDuckDuckGoVqd('https://duckduckgo.com/i.js?vqd=xyz&x=1')
    ).toBe('xyz')
    expect(extractDuckDuckGoVqd('{"vqd":"token_42"}')).toBe('token_42')
  })

  test('accepts only public HTTPS result URLs', () => {
    expect(normalizeImageSearchUrl('https://example.com/image.png')).toBe(
      'https://example.com/image.png'
    )
    expect(normalizeImageSearchUrl('http://example.com/image.png')).toBeNull()
    expect(
      normalizeImageSearchUrl('https://user:pass@example.com/image.png')
    ).toBeNull()
    expect(normalizeImageSearchUrl('https://127.0.0.1/image.png')).toBeNull()
    expect(normalizeImageSearchUrl('https://[::1]/image.png')).toBeNull()
    expect(
      normalizeImageSearchUrl('https://host.internal/image.png')
    ).toBeNull()
    expect(normalizeImageSearchUrl('https://localhost/image.png')).toBeNull()
    expect(normalizeImageSearchUrl('not a url')).toBeNull()
  })

  test('normalizes provider result shapes', () => {
    expect(
      normalizeImageSearchResult({
        url: 'https://example.com/full.jpg',
        thumbnail_url: 'https://example.com/thumb.jpg',
      })
    ).toEqual({
      image: 'https://example.com/full.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
    })
  })

  test('normalizes queries and dedupes by image URL', () => {
    expect(normalizeImageSearchQuery('  cat\n\u0000 sitting\toutside  ')).toBe(
      'cat sitting outside'
    )
    expect(normalizeImageSearchQuery(['cat', 'dog'])).toBe('')
    expect(
      dedupeSearchResults([
        {
          image: 'https://example.com/a.jpg',
          thumbnail: 'https://example.com/a-thumb.jpg',
        },
        {
          image: 'https://example.com/a.jpg',
          thumbnail: 'https://example.com/other-thumb.jpg',
        },
        {
          image: 'https://example.com/b.jpg',
          thumbnail: 'https://example.com/b-thumb.jpg',
        },
      ])
    ).toEqual([
      {
        image: 'https://example.com/a.jpg',
        thumbnail: 'https://example.com/a-thumb.jpg',
      },
      {
        image: 'https://example.com/b.jpg',
        thumbnail: 'https://example.com/b-thumb.jpg',
      },
    ])
  })

  test('uses successful providers when another provider fails', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const duplicate = {
      image: 'https://example.com/image.jpg',
      thumbnail: 'https://example.com/thumb.jpg',
    }
    await expect(
      searchImages('fox', [
        ['failed', async () => Promise.reject(new Error('blocked'))],
        ['first', async () => [duplicate]],
        ['second', async () => [duplicate]],
      ])
    ).resolves.toEqual([duplicate])
    expect(warning).toHaveBeenCalledTimes(1)
    warning.mockRestore()
  })

  test('fails only when every provider fails', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      searchImages('fox', [
        ['first', async () => Promise.reject(new Error('blocked'))],
        ['second', async () => Promise.reject(new Error('blocked'))],
      ])
    ).rejects.toThrow('All image search sources failed')
    warning.mockRestore()
  })

  test('coalesces and caches equivalent concurrent searches', async () => {
    let resolveSearch
    const search = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve
        })
    )
    const cachedSearch = createSearchCache({search})
    const first = cachedSearch(' Red fox ')
    const second = cachedSearch('red FOX')
    await Promise.resolve()
    expect(search).toHaveBeenCalledTimes(1)

    const rows = [
      {
        image: 'https://example.com/image.jpg',
        thumbnail: 'https://example.com/thumb.jpg',
      },
    ]
    resolveSearch(rows)
    await expect(Promise.all([first, second])).resolves.toEqual([rows, rows])
    await expect(cachedSearch('red fox')).resolves.toEqual(rows)
    expect(search).toHaveBeenCalledTimes(1)
  })

  test('bounds requests per client and resets the window', () => {
    let time = 1000
    const checkRateLimit = createRateLimiter({
      now: () => time,
      maxRequests: 2,
    })
    expect(checkRateLimit('client').allowed).toBe(true)
    expect(checkRateLimit('client').allowed).toBe(true)
    expect(checkRateLimit('client').allowed).toBe(false)
    time += 60 * 1000
    expect(checkRateLimit('client').allowed).toBe(true)
  })
})

describe('image search API handler', () => {
  test('rejects non-GET methods without searching', async () => {
    const search = jest.fn()
    const handler = createImageSearchHandler({search})
    const response = createResponse()
    await handler({method: 'POST', headers: {}, query: {q: 'fox'}}, response)
    expect(response.statusCode).toBe(405)
    expect(response.headers.Allow).toBe('GET')
    expect(search).not.toHaveBeenCalled()
  })

  test('rejects empty and repeated query parameters', async () => {
    const search = jest.fn()
    const handler = createImageSearchHandler({search})

    const emptyResponse = createResponse()
    await handler({method: 'GET', headers: {}, query: {q: '  '}}, emptyResponse)
    expect(emptyResponse.statusCode).toBe(400)

    const repeatedResponse = createResponse()
    await handler(
      {method: 'GET', headers: {}, query: {q: ['fox', 'cat']}},
      repeatedResponse
    )
    expect(repeatedResponse.statusCode).toBe(400)
    expect(search).not.toHaveBeenCalled()
  })

  test('returns results with cache and content-type protection headers', async () => {
    const rows = [
      {
        image: 'https://example.com/image.jpg',
        thumbnail: 'https://example.com/thumb.jpg',
      },
    ]
    const handler = createImageSearchHandler({
      search: jest.fn().mockResolvedValue(rows),
      rateLimiter: () => ({allowed: true, retryAfterSeconds: 1}),
    })
    const response = createResponse()
    await handler({method: 'GET', headers: {}, query: {q: 'fox'}}, response)
    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual(rows)
    expect(response.headers['Cache-Control']).toContain('s-maxage=300')
    expect(response.headers['X-Content-Type-Options']).toBe('nosniff')
  })

  test('returns a bounded error when providers are unavailable', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const handler = createImageSearchHandler({
      search: jest.fn().mockRejectedValue(new Error('provider details')),
      rateLimiter: () => ({allowed: true, retryAfterSeconds: 1}),
    })
    const response = createResponse()
    await handler({method: 'GET', headers: {}, query: {q: 'fox'}}, response)
    expect(response.statusCode).toBe(502)
    expect(response.body).toEqual({error: 'Image search is unavailable'})
    expect(response.headers['Cache-Control']).toBe('private, no-store')
    expect(JSON.stringify(response.body)).not.toContain('provider details')
    warning.mockRestore()
  })

  test('returns retry guidance when rate limited', async () => {
    const search = jest.fn()
    const handler = createImageSearchHandler({
      search,
      rateLimiter: () => ({allowed: false, retryAfterSeconds: 42}),
    })
    const response = createResponse()
    await handler({method: 'GET', headers: {}, query: {q: 'fox'}}, response)
    expect(response.statusCode).toBe(429)
    expect(response.headers['Retry-After']).toBe('42')
    expect(response.headers['Cache-Control']).toBe('private, no-store')
    expect(search).not.toHaveBeenCalled()
  })
})
