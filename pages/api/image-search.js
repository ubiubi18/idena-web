const https = require('https')

const DUCKDUCKGO_URL = 'https://duckduckgo.com/'
const DUCKDUCKGO_TIMEOUT = 8000
const DUCKDUCKGO_RESULT_LIMIT = 64
const DUCKDUCKGO_HEADERS = {
  accept: 'application/json, text/javascript, */*; q=0.01',
  'accept-language': 'en-US,en;q=0.9',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'x-requested-with': 'XMLHttpRequest',
}

function getDuckDuckGo(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {headers: DUCKDUCKGO_HEADERS}, res => {
      let body = ''

      res.setEncoding('utf8')
      res.on('data', chunk => {
        body += chunk
      })
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`DuckDuckGo responded with ${res.statusCode}`))
          return
        }
        resolve(body)
      })
    })

    req.setTimeout(DUCKDUCKGO_TIMEOUT, () => {
      req.destroy(new Error('DuckDuckGo request timed out'))
    })
    req.on('error', reject)
  })
}

async function getDuckDuckGoToken(query) {
  const params = new URLSearchParams({q: query})
  const html = await getDuckDuckGo(`${DUCKDUCKGO_URL}?${params.toString()}`)
  const match = html.match(/vqd=([\d-]+)&/)

  if (!match) {
    throw new Error('DuckDuckGo token not found')
  }

  return match[1]
}

function normalizeDuckDuckGoImage(item) {
  if (!item || typeof item !== 'object') return null

  const image = typeof item.image === 'string' ? item.image : null
  const thumbnail = typeof item.thumbnail === 'string' ? item.thumbnail : image

  if (!image || !thumbnail) return null

  return {
    height: item.height,
    image,
    source: item.source,
    thumbnail,
    title: item.title,
    url: item.url,
    width: item.width,
  }
}

async function searchDuckDuckGoImages(query) {
  const normalizedQuery = String(query || '')
    .trim()
    .slice(0, 200)
  if (!normalizedQuery) return []

  const token = await getDuckDuckGoToken(normalizedQuery)
  const params = new URLSearchParams({
    o: 'json',
    q: normalizedQuery,
    l: 'us-en',
    vqd: token,
    p: '1',
  })
  const body = await getDuckDuckGo(`${DUCKDUCKGO_URL}i.js?${params.toString()}`)
  const data = JSON.parse(body)
  const results = Array.isArray(data && data.results) ? data.results : []

  return results
    .map(normalizeDuckDuckGoImage)
    .filter(Boolean)
    .slice(0, DUCKDUCKGO_RESULT_LIMIT)
}

export default async (req, res) => {
  try {
    const result = await searchDuckDuckGoImages(req.query.q)
    return res.status(200).json(result)
  } catch (e) {
    return res.status(400).send(e.toString())
  }
}
