const https = require('https')
const {searchImages} = require('../server/image-search')

const REQUEST_TIMEOUT_MS = 8000
const SAMPLE_LIMIT = 12
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36'

function checkImageResponse(url, origin) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        headers: {origin, 'user-agent': USER_AGENT},
      },
      (response) => {
        const contentType = String(response.headers['content-type'] || '')
        const allowOrigin = String(
          response.headers['access-control-allow-origin'] || ''
        )
        const validStatus = response.statusCode === 200
        const validType = contentType.toLowerCase().startsWith('image/')
        const validCors = allowOrigin === '*' || allowOrigin === origin
        response.destroy()

        if (!validStatus || !validType || !validCors) {
          reject(
            new Error(
              `Image response rejected: status=${response.statusCode || 0} ` +
                `type=${contentType || 'missing'} cors=${
                  allowOrigin || 'missing'
                }`
            )
          )
          return
        }
        resolve()
      }
    )

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Image response timed out'))
    })
    request.on('error', reject)
    request.end()
  })
}

function selectHostSamples(rows) {
  const selected = []
  const hosts = new Set()
  for (const row of rows) {
    const {thumbnail} = row
    const {hostname} = new URL(thumbnail)
    if (!hosts.has(hostname)) {
      hosts.add(hostname)
      selected.push(thumbnail)
      if (selected.length >= SAMPLE_LIMIT) break
    }
  }
  return selected
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim() || 'red fox'
  const origin = process.env.IMAGE_SEARCH_TEST_ORIGIN || 'https://app.idena.io'
  const rows = await searchImages(query)
  if (!rows.length) throw new Error('Image search returned no results')
  if (
    rows.some(
      (row) =>
        !row.image.startsWith('https://') ||
        !row.thumbnail.startsWith('https://') ||
        row.image !== row.thumbnail
    )
  ) {
    throw new Error('Image search returned an unsafe result shape')
  }

  const samples = selectHostSamples(rows)
  await Promise.all(samples.map((url) => checkImageResponse(url, origin)))
  process.stdout.write(
    `Image search live check passed: ${rows.length} results, ` +
      `${samples.length} provider hosts validated\n`
  )
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
