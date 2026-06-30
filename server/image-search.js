const https = require('https')
const axios = require('axios')

const SOURCE_TIMEOUT_MS = 8000
const HTTP_TIMEOUT_MS = 6500
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_QUERY_LENGTH = 160

function normalizeImageSearchUrl(value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized.length > 4096) return null

  try {
    const parsedUrl = new URL(normalized)
    if (parsedUrl.protocol !== 'https:') return null
    if (parsedUrl.username || parsedUrl.password) return null
    return parsedUrl.href
  } catch {
    return null
  }
}

function normalizeImageSearchResult(item) {
  if (!item || typeof item !== 'object') {
    return null
  }

  const image = normalizeImageSearchUrl(
    item.image ||
      item.url ||
      item.imageUrl ||
      item.image_url ||
      item.full ||
      item.raw ||
      null
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

  if (!image || !thumbnail) {
    return null
  }

  return {image, thumbnail}
}

function requestHttpsText(
  url,
  {timeoutMs = HTTP_TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES, headers = {}} = {}
) {
  const parsedUrl = url instanceof URL ? url : new URL(url)
  if (parsedUrl.protocol !== 'https:') {
    return Promise.reject(new Error('Image search request must use HTTPS'))
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      parsedUrl,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: {
          accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': 'Mozilla/5.0 (Idena image search)',
          ...headers,
        },
      },
      res => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume()
          reject(new Error(`Image search HTTP ${res.statusCode || 0}`))
          return
        }

        let bytes = 0
        const chunks = []
        res.setEncoding('utf8')
        res.on('data', chunk => {
          bytes += Buffer.byteLength(chunk)
          if (bytes > maxBytes) {
            req.destroy(new Error('Image search response too large'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          resolve(chunks.join(''))
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new Error('Image search timed out'))
    })
    req.on('error', reject)
    req.end()
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

function withSearchSourceTimeout(promise, label, timeoutMs = SOURCE_TIMEOUT_MS) {
  let timeout = null

  return Promise.race([
    promise,
    new Promise(resolve => {
      timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn(`${label} timed out after ${timeoutMs}ms`)
        resolve([])
      }, timeoutMs)
    }),
  ])
    .catch(error => {
      // eslint-disable-next-line no-console
      console.warn(`${label} failed`, error.toString())
      return []
    })
    .finally(() => {
      if (timeout) {
        clearTimeout(timeout)
      }
    })
}

async function searchDuckDuckGoImages(query) {
  try {
    const landingUrl = new URL('https://duckduckgo.com/')
    landingUrl.searchParams.set('q', query)
    landingUrl.searchParams.set('iax', 'images')
    landingUrl.searchParams.set('ia', 'images')

    const html = await requestHttpsText(landingUrl, {
      timeoutMs: 5000,
      maxBytes: 512 * 1024,
    })
    const vqd = extractDuckDuckGoVqd(html)
    if (!vqd) return []

    const apiUrl = new URL('https://duckduckgo.com/i.js')
    apiUrl.searchParams.set('l', 'us-en')
    apiUrl.searchParams.set('o', 'json')
    apiUrl.searchParams.set('q', query)
    apiUrl.searchParams.set('vqd', vqd)
    apiUrl.searchParams.set('f', ',,,')
    apiUrl.searchParams.set('p', '1')

    const json = await requestHttpsText(apiUrl, {
      headers: {
        accept: 'application/json,text/plain,*/*',
        referer: landingUrl.href,
      },
    })
    const data = JSON.parse(json)
    const results = Array.isArray(data && data.results) ? data.results : []

    return results
      .slice(0, 30)
      .map(item =>
        normalizeImageSearchResult({
          image: item && item.image,
          thumbnail: (item && (item.thumbnail || item.image)) || null,
        })
      )
      .filter(Boolean)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('duckduckgo image search failed', error.toString())
    return []
  }
}

async function searchOpenverseImages(query) {
  try {
    const {data} = await axios.get('https://api.openverse.org/v1/images/', {
      params: {
        q: query,
        page_size: 30,
      },
      timeout: 12000,
    })

    const results = Array.isArray(data && data.results) ? data.results : []

    return results
      .map(item =>
        normalizeImageSearchResult({
          image: item && item.url,
          thumbnail:
            (item && (item.thumbnail || item.thumbnail_url)) ||
            (item && item.url),
        })
      )
      .filter(Boolean)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('openverse image search failed', error.toString())
    return []
  }
}

async function searchWikimediaImages(query) {
  try {
    const {data} = await axios.get('https://commons.wikimedia.org/w/api.php', {
      params: {
        action: 'query',
        format: 'json',
        generator: 'search',
        gsrsearch: query,
        gsrnamespace: 6,
        gsrlimit: 30,
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: 320,
        origin: '*',
      },
      timeout: 12000,
    })

    const pages = data && data.query && data.query.pages
    const list = pages && typeof pages === 'object' ? Object.values(pages) : []

    return list
      .map(item => {
        const imageInfo = Array.isArray(item && item.imageinfo)
          ? item.imageinfo[0]
          : null
        return normalizeImageSearchResult({
          image: imageInfo && imageInfo.url,
          thumbnail:
            (imageInfo && (imageInfo.thumburl || imageInfo.url)) || null,
        })
      })
      .filter(Boolean)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('wikimedia image search failed', error.toString())
    return []
  }
}

function dedupeSearchResults(items) {
  const seen = new Set()
  const result = []

  items.forEach(item => {
    if (!item || typeof item !== 'object') return
    const image = String(item.image || '').trim()
    const thumbnail = String(item.thumbnail || '').trim()
    if (!image || !thumbnail) return
    if (seen.has(image)) return
    seen.add(image)
    result.push({image, thumbnail})
  })

  return result
}

function normalizeImageSearchQuery(query) {
  return Array.from(String(query || ''))
    .map(char => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 ? ' ' : char
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
}

async function searchImages(query) {
  const normalizedQuery = normalizeImageSearchQuery(query)
  if (!normalizedQuery) return []

  const [duckResults, openverseResults, wikimediaResults] = await Promise.all([
    withSearchSourceTimeout(
      searchDuckDuckGoImages(normalizedQuery),
      'duckduckgo image search'
    ),
    withSearchSourceTimeout(
      searchOpenverseImages(normalizedQuery),
      'openverse image search'
    ),
    withSearchSourceTimeout(
      searchWikimediaImages(normalizedQuery),
      'wikimedia image search'
    ),
  ])

  return dedupeSearchResults(
    duckResults.concat(openverseResults).concat(wikimediaResults)
  ).slice(0, 64)
}

module.exports = {
  searchImages,
  _internals: {
    dedupeSearchResults,
    extractDuckDuckGoVqd,
    normalizeImageSearchQuery,
    normalizeImageSearchResult,
    normalizeImageSearchUrl,
  },
}
