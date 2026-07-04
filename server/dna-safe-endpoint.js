import dns from 'dns'
import https from 'https'
import net from 'net'

const MAX_ENDPOINT_LENGTH = 2048
const HOSTNAME_BLOCKLIST = new Set(['localhost'])
const PRIVATE_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal']

function isPrivateIpv4(address) {
  const parts = address.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true
  }

  const [a, b, c] = parts

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b >= 18 && b <= 19) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) {
    return isPrivateAddress(normalized.slice(7))
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  )
}

export function isPrivateAddress(address) {
  const ipType = net.isIP(address)
  if (ipType === 4) return isPrivateIpv4(address)
  if (ipType === 6) return isPrivateIpv6(address)
  return true
}

function isBlockedHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')

  return (
    HOSTNAME_BLOCKLIST.has(normalized) ||
    PRIVATE_HOSTNAME_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  )
}

function assertPublicAddresses(addresses) {
  if (
    !addresses.length ||
    addresses.some(({address}) => isPrivateAddress(address))
  ) {
    throw new Error('Endpoint host is not public')
  }
}

export function safeDnaEndpointLookup(hostname, options, callback) {
  dns.lookup(hostname, options, (error, address, family) => {
    if (error) {
      callback(error)
      return
    }

    const addresses = Array.isArray(address) ? address : [{address, family}]

    try {
      assertPublicAddresses(addresses)
    } catch (err) {
      callback(err)
      return
    }

    if (Array.isArray(address)) {
      callback(null, address)
      return
    }

    callback(null, address, family)
  })
}

export async function assertSafeDnaEndpoint(
  value,
  dnsLookup = dns.promises.lookup
) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Endpoint URL is required')
  }

  const rawValue = value.trim()
  if (rawValue.length > MAX_ENDPOINT_LENGTH) {
    throw new Error('Endpoint URL is too long')
  }

  let parsedUrl
  try {
    parsedUrl = new URL(rawValue)
  } catch {
    throw new Error('Endpoint URL is invalid')
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Endpoint URL must use HTTPS')
  }
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error('Endpoint URL must not include credentials')
  }
  if (!parsedUrl.hostname || isBlockedHostname(parsedUrl.hostname)) {
    throw new Error('Endpoint host is not allowed')
  }

  const directIpType = net.isIP(parsedUrl.hostname)
  if (directIpType && isPrivateAddress(parsedUrl.hostname)) {
    throw new Error('Endpoint host is not public')
  }

  const addresses = directIpType
    ? [{address: parsedUrl.hostname}]
    : await dnsLookup(parsedUrl.hostname, {all: true, verbatim: true})

  assertPublicAddresses(addresses)

  return parsedUrl.href
}

export const DNA_ENDPOINT_HTTPS_AGENT = new https.Agent({
  lookup: safeDnaEndpointLookup,
})

export const DNA_ENDPOINT_REQUEST_OPTIONS = {
  httpsAgent: DNA_ENDPOINT_HTTPS_AGENT,
  maxRedirects: 0,
  timeout: 10000,
}
