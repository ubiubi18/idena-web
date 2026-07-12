const https = require('https')
const {EventEmitter} = require('events')
const {
  createImageSearchHandler,
  searchImages,
  _internals: {
    createRateLimiter,
    createSearchCache,
    createSourceRunner,
    dedupeSearchResults,
    extractDuckDuckGoVqd,
    getDefaultSources,
    normalizeImageSearchQuery,
    normalizeImageSearchResult,
    normalizeImageSearchUrl,
    normalizeProviderThumbnail,
    parseDisabledSources,
    requestHttpsText,
    shouldTrustProxy,
  },
} = require('./image-search')

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

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

  test('keeps only provider-controlled thumbnail hosts', () => {
    expect(
      normalizeProviderThumbnail('https://tse1.mm.bing.net/image.jpg', [
        'mm.bing.net',
      ])
    ).toEqual({
      image: 'https://tse1.mm.bing.net/image.jpg',
      thumbnail: 'https://tse1.mm.bing.net/image.jpg',
    })
    expect(
      normalizeProviderThumbnail('https://attacker.example/image.jpg', [
        'mm.bing.net',
      ])
    ).toBeNull()
    expect(
      normalizeProviderThumbnail('https://mm.bing.net.attacker.example/x', [
        'mm.bing.net',
      ])
    ).toBeNull()
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

  test('opens a provider cooldown after repeated failures', async () => {
    let time = 1000
    const failed = jest.fn().mockRejectedValue(new Error('blocked'))
    const healthy = jest.fn().mockResolvedValue([])
    const runSources = createSourceRunner({
      sources: [
        ['failed', failed],
        ['healthy', healthy],
      ],
      now: () => time,
      failureThreshold: 2,
      cooldownMs: 100,
    })
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    await runSources('first')
    await runSources('second')
    const duringCooldown = await runSources('third')
    expect(failed).toHaveBeenCalledTimes(2)
    expect(duringCooldown[0]).toMatchObject({ok: false, skipped: true})
    expect(healthy).toHaveBeenCalledTimes(3)

    time += 101
    await runSources('fourth')
    expect(failed).toHaveBeenCalledTimes(3)
  })

  test('supports explicitly disabling a blocked provider', () => {
    expect(Array.from(parseDisabledSources(' openverse, WIKIMEDIA '))).toEqual([
      'openverse',
      'wikimedia',
    ])
    expect(
      getDefaultSources({IMAGE_SEARCH_DISABLED_SOURCES: 'openverse'}).map(
        ([name]) => name
      )
    ).toEqual(['duckduckgo', 'wikimedia'])
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

  test('evicts rejected and expired cache entries', async () => {
    let time = 1000
    const rows = [
      {
        image: 'https://example.com/image.jpg',
        thumbnail: 'https://example.com/thumb.jpg',
      },
    ]
    const search = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue(rows)
    const cachedSearch = createSearchCache({search, now: () => time})

    await expect(cachedSearch('fox')).rejects.toThrow('temporary')
    await expect(cachedSearch('fox')).resolves.toEqual(rows)
    expect(search).toHaveBeenCalledTimes(2)

    time += 5 * 60 * 1000 + 1
    await expect(cachedSearch('fox')).resolves.toEqual(rows)
    expect(search).toHaveBeenCalledTimes(3)
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

  test('enforces response size and wall-clock timeout bounds', async () => {
    const oversizedRequest = new EventEmitter()
    oversizedRequest.destroy = (error) => oversizedRequest.emit('error', error)
    oversizedRequest.end = () => {
      const response = new EventEmitter()
      response.statusCode = 200
      response.setEncoding = jest.fn()
      response.resume = jest.fn()
      oversizedRequest.callback(response)
      response.emit('data', '1234')
      response.emit('data', '5')
      response.emit('end')
    }
    jest
      .spyOn(https, 'request')
      .mockImplementation((url, options, callback) => {
        oversizedRequest.callback = callback
        return oversizedRequest
      })
    await expect(
      requestHttpsText('https://example.com', {maxBytes: 4})
    ).rejects.toThrow('response too large')

    jest.restoreAllMocks()
    jest.useFakeTimers()
    const stalledRequest = new EventEmitter()
    stalledRequest.destroy = (error) => stalledRequest.emit('error', error)
    stalledRequest.end = jest.fn()
    jest.spyOn(https, 'request').mockReturnValue(stalledRequest)
    const stalled = requestHttpsText('https://example.com', {timeoutMs: 25})
    jest.advanceTimersByTime(26)
    await expect(stalled).rejects.toThrow('timed out')
  })

  test('trusts forwarding headers only in an explicit proxy environment', () => {
    expect(shouldTrustProxy({})).toBe(false)
    expect(shouldTrustProxy({VERCEL: '1'})).toBe(true)
    expect(shouldTrustProxy({IMAGE_SEARCH_TRUST_PROXY: '1'})).toBe(true)
    expect(shouldTrustProxy({IMAGE_SEARCH_TRUST_PROXY: 'true'})).toBe(false)
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

  test('ignores spoofed forwarding headers unless proxy trust is enabled', async () => {
    const handler = createImageSearchHandler({search: async () => []})
    let response
    for (let index = 0; index < 31; index += 1) {
      response = createResponse()
      await handler(
        {
          method: 'GET',
          headers: {'x-forwarded-for': `spoofed-${index}`},
          query: {q: `query-${index}`},
          socket: {remoteAddress: 'same-client'},
        },
        response
      )
    }
    expect(response.statusCode).toBe(429)
  })

  test('uses sanitized forwarding headers behind a trusted proxy', async () => {
    const handler = createImageSearchHandler({
      search: async () => [],
      trustProxy: true,
    })
    let allowed = 0
    for (let index = 0; index < 31; index += 1) {
      const response = createResponse()
      await handler(
        {
          method: 'GET',
          headers: {'x-forwarded-for': `proxy-client-${index}`},
          query: {q: `query-${index}`},
          socket: {remoteAddress: 'proxy'},
        },
        response
      )
      if (response.statusCode === 200) allowed += 1
    }
    expect(allowed).toBe(31)
  })
})
