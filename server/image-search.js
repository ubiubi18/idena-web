const https = require('https')
const net = require('net')

const SOURCE_TIMEOUT_MS = 8000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_QUERY_LENGTH = 160
const RESULT_LIMIT = 64
const CACHE_TTL_MS = 5 * 60 * 1000
const EMPTY_CACHE_TTL_MS = 30 * 1000
const CACHE_MAX_ENTRIES = 256
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 30
const RATE_LIMIT_MAX_CLIENTS = 2048
const USER_AGENT = 'Mozilla/5.0 (Idena web image search)'

function stripControlCharacters(value) {
  return Array.from(String(value || ''))
    .map((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 ? ' ' : char
    })
    .join('')
}

function normalizeImageSearchQuery(query) {
  if (typeof query !== 'string') return ''

  return stripControlCharacters(query)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
}

function isPublicHostname(hostname) {
  const normalized = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '')
  const unwrapped =
    normalized.startsWith('[') && normalized.endsWith(']')
      ? normalized.slice(1, -1)
      : normalized

  if (!unwrapped || net.isIP(unwrapped)) return false
  if (!unwrapped.includes('.')) return false
  if (
    unwrapped === 'localhost' ||
    unwrapped.endsWith('.localhost') ||
    unwrapped.endsWith('.local') ||
    unwrapped.endsWith('.internal') ||
    unwrapped.endsWith('.home') ||
    unwrapped.endsWith('.lan')
  ) {
    return false
  }
  return true
}

function normalizeImageSearchUrl(value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > 4096) return null

  try {
    const parsedUrl = new URL(normalized)
    if (parsedUrl.protocol !== 'https:') return null
    if (parsedUrl.username || parsedUrl.password) return null
    if (!isPublicHostname(parsedUrl.hostname)) return null
    return parsedUrl.href
  } catch {
    return null
  }
}

function normalizeImageSearchResult(item) {
  if (!item || typeof item !== 'object') return null

  const image = normalizeImageSearchUrl(
    item.image ||
      item.url ||
      item.imageUrl ||
      item.image_url ||
      item.full ||
      item.raw
  )
  const thumbnail = normalizeImageSearchUrl(
    item.thumbnail ||
      item.thumb ||
      item.thumbnailUrl ||
      item.thumbnail_url ||
      item.preview ||
      item.small ||
      image
  )

  return image && thumbnail ? {image, thumbnail} : null
}

function requestHttpsText(
  url,
  {
    timeoutMs = SOURCE_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
    headers = {},
  } = {}
) {
  const parsedUrl = url instanceof URL ? url : new URL(url)
  if (parsedUrl.protocol !== 'https:') {
    return Promise.reject(new Error('Image search request must use HTTPS'))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const timer = {id: null}
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer.id)
      if (error) reject(error)
      else resolve(value)
    }
    const request = https.request(
      parsedUrl,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': USER_AGENT,
          ...headers,
        },
      },
      (response) => {
        if (
          !response.statusCode ||
          response.statusCode < 200 ||
          response.statusCode >= 300
        ) {
          response.resume()
          finish(new Error(`Image search HTTP ${response.statusCode || 0}`))
          return
        }

        let bytes = 0
        const chunks = []
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          bytes += Buffer.byteLength(chunk)
          if (bytes > maxBytes) {
            const error = new Error('Image search response too large')
            finish(error)
            request.destroy(error)
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => finish(null, chunks.join('')))
        response.on('error', finish)
      }
    )

    timer.id = setTimeout(() => {
      const error = new Error('Image search timed out')
      finish(error)
      request.destroy(error)
    }, timeoutMs)
    request.on('error', finish)
    request.end()
  })
}

function extractDuckDuckGoVqd(html) {
  const source = String(html || '')
  const patterns = [
    /vqd=["']([^"']+)["']/,
    /vqd=([^&"'\\]+)&/,
    /"vqd":"([^"]+)"/,
    /vqd='([^']+)'/,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(source)
    const token = match && String(match[1] || '').trim()
    if (token && token.length <= 128 && /^[A-Za-z0-9-_.]+$/.test(token)) {
      return token
    }
  }
  return null
}

async function searchDuckDuckGoImages(query) {
  const landingUrl = new URL('https://duckduckgo.com/')
  landingUrl.searchParams.set('q', query)
  landingUrl.searchParams.set('iax', 'images')
  landingUrl.searchParams.set('ia', 'images')

  const html = await requestHttpsText(landingUrl, {
    timeoutMs: 3500,
    maxBytes: 512 * 1024,
  })
  const vqd = extractDuckDuckGoVqd(html)
  if (!vqd) throw new Error('DuckDuckGo image token unavailable')

  const apiUrl = new URL('https://duckduckgo.com/i.js')
  apiUrl.searchParams.set('l', 'us-en')
  apiUrl.searchParams.set('o', 'json')
  apiUrl.searchParams.set('q', query)
  apiUrl.searchParams.set('vqd', vqd)
  apiUrl.searchParams.set('f', ',,,')
  apiUrl.searchParams.set('p', '1')

  const body = await requestHttpsText(apiUrl, {
    timeoutMs: 4500,
    headers: {
      accept: 'application/json,text/plain,*/*',
      referer: landingUrl.href,
      'x-requested-with': 'XMLHttpRequest',
    },
  })
  const data = JSON.parse(body)
  const results = Array.isArray(data && data.results) ? data.results : []
  return results
    .slice(0, 30)
    .map((item) =>
      normalizeImageSearchResult({
        image: item && item.image,
        thumbnail: item && (item.thumbnail || item.image),
      })
    )
    .filter(Boolean)
}

async function searchOpenverseImages(query) {
  const apiUrl = new URL('https://api.openverse.org/v1/images/')
  apiUrl.searchParams.set('q', query)
  apiUrl.searchParams.set('page_size', '20')
  apiUrl.searchParams.set('mature', 'false')

  const data = JSON.parse(await requestHttpsText(apiUrl))
  const results = Array.isArray(data && data.results) ? data.results : []
  return results
    .map((item) =>
      normalizeImageSearchResult({
        image: item && item.url,
        thumbnail: item && (item.thumbnail || item.thumbnail_url || item.url),
      })
    )
    .filter(Boolean)
}

async function searchWikimediaImages(query) {
  const apiUrl = new URL('https://commons.wikimedia.org/w/api.php')
  const params = {
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '320',
    origin: '*',
  }
  Object.entries(params).forEach(([key, value]) => {
    apiUrl.searchParams.set(key, value)
  })

  const data = JSON.parse(await requestHttpsText(apiUrl))
  const pages = data && data.query && data.query.pages
  const list = pages && typeof pages === 'object' ? Object.values(pages) : []
  return list
    .map((item) => {
      const imageInfo = Array.isArray(item && item.imageinfo)
        ? item.imageinfo[0]
        : null
      return normalizeImageSearchResult({
        image: imageInfo && imageInfo.url,
        thumbnail: imageInfo && (imageInfo.thumburl || imageInfo.url),
      })
    })
    .filter(Boolean)
}

function dedupeSearchResults(items) {
  const seen = new Set()
  const results = []
  items.forEach((item) => {
    if (!item || seen.has(item.image)) return
    seen.add(item.image)
    results.push(item)
  })
  return results.slice(0, RESULT_LIMIT)
}

async function runSearchSource(name, search, query) {
  try {
    const rows = await search(query)
    return {ok: true, rows: Array.isArray(rows) ? rows.filter(Boolean) : []}
  } catch (error) {
    // Provider failures contain no query, credentials, or response body.
    // eslint-disable-next-line no-console
    console.warn(`Image search source failed: ${name}`, error.message)
    return {ok: false, rows: []}
  }
}

async function searchImages(query, sources = null) {
  const normalizedQuery = normalizeImageSearchQuery(query)
  if (!normalizedQuery) return []

  const configuredSources = sources || [
    ['duckduckgo', searchDuckDuckGoImages],
    ['openverse', searchOpenverseImages],
    ['wikimedia', searchWikimediaImages],
  ]
  const outcomes = await Promise.all(
    configuredSources.map(([name, search]) =>
      runSearchSource(name, search, normalizedQuery)
    )
  )
  if (outcomes.every((outcome) => !outcome.ok)) {
    throw new Error('All image search sources failed')
  }
  return dedupeSearchResults(outcomes.flatMap((outcome) => outcome.rows))
}

function createSearchCache({search = searchImages, now = Date.now} = {}) {
  const entries = new Map()

  return async function cachedSearch(query) {
    const normalizedQuery = normalizeImageSearchQuery(query)
    if (!normalizedQuery) return []

    const key = normalizedQuery.toLowerCase()
    const currentTime = now()
    const existing = entries.get(key)
    if (existing && existing.expiresAt > currentTime) return existing.promise
    if (existing) entries.delete(key)

    while (entries.size >= CACHE_MAX_ENTRIES) {
      entries.delete(entries.keys().next().value)
    }

    const promise = Promise.resolve().then(() => search(normalizedQuery))
    entries.set(key, {expiresAt: currentTime + CACHE_TTL_MS, promise})
    try {
      const rows = await promise
      entries.set(key, {
        expiresAt:
          currentTime + (rows.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
        promise: Promise.resolve(rows),
      })
      return rows
    } catch (error) {
      entries.delete(key)
      throw error
    }
  }
}

function boundedClientId(value) {
  return stripControlCharacters(value).replace(/\s+/g, ' ').trim().slice(0, 128)
}

function createRateLimiter({
  now = Date.now,
  maxRequests = RATE_LIMIT_MAX_REQUESTS,
} = {}) {
  const clients = new Map()

  return function checkRateLimit(clientId) {
    const currentTime = now()
    const key = boundedClientId(clientId) || 'unknown'
    const existing = clients.get(key)
    const bucket =
      existing && existing.resetAt > currentTime
        ? existing
        : {count: 0, resetAt: currentTime + RATE_LIMIT_WINDOW_MS}
    bucket.count += 1
    clients.set(key, bucket)

    while (clients.size > RATE_LIMIT_MAX_CLIENTS) {
      clients.delete(clients.keys().next().value)
    }

    return {
      allowed: bucket.count <= maxRequests,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.resetAt - currentTime) / 1000)
      ),
    }
  }
}

function getClientId(request) {
  const forwarded = request.headers && request.headers['x-forwarded-for']
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded
  if (forwardedValue) {
    return String(forwardedValue).split(',')[0].trim()
  }
  const realIp = request.headers && request.headers['x-real-ip']
  if (realIp) return Array.isArray(realIp) ? realIp[0] : realIp
  return request.socket && request.socket.remoteAddress
}

function createImageSearchHandler({search, rateLimiter} = {}) {
  const executeSearch = search || createSearchCache()
  const checkRateLimit = rateLimiter || createRateLimiter()

  return async function imageSearchHandler(request, response) {
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Cache-Control', 'private, no-store')
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET')
      return response.status(405).json({error: 'Method not allowed'})
    }

    const query = normalizeImageSearchQuery(request.query && request.query.q)
    if (!query) {
      return response.status(400).json({error: 'Search query is required'})
    }

    const limit = checkRateLimit(getClientId(request))
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfterSeconds))
      return response.status(429).json({error: 'Too many image searches'})
    }

    try {
      const rows = await executeSearch(query)
      response.setHeader(
        'Cache-Control',
        'public, s-maxage=300, stale-while-revalidate=86400'
      )
      return response.status(200).json(rows)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Image search request failed', error.message)
      return response.status(502).json({error: 'Image search is unavailable'})
    }
  }
}

module.exports = {
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
}
