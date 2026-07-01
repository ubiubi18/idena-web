// Adapted from @idena/vrf-js; see THIRD_PARTY_NOTICES.md.
import {sha256} from 'js-sha256'
import {sha512} from 'js-sha512'
import {basePoint, curveOrder, pointFromBytes, privateKeyBytes} from './secp256k1'

function toBytesInt32(num) {
  return new Uint8Array([
    Math.floor(num / 0x1000000) % 0x100,
    Math.floor(num / 0x10000) % 0x100,
    Math.floor(num / 0x100) % 0x100,
    num % 0x100,
  ])
}

function byteLength() {
  return 32
}

function bytesToBigInt(bytes) {
  return BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`)
}

function bigIntToBytes(value) {
  const hex = value.toString(16)
  const padded = hex.length % 2 ? `0${hex}` : hex
  return Array.from(Buffer.from(padded, 'hex'))
}

function modOrder(value) {
  const result = value % curveOrder
  return result >= 0n ? result : result + curveOrder
}

function randomScalar() {
  const crypto = globalThis.crypto || globalThis.window?.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('Secure random source unavailable')
  }

  const bytes = new Uint8Array(byteLength())
  let scalar = 0n

  while (scalar === 0n || scalar >= curveOrder) {
    crypto.getRandomValues(bytes)
    scalar = bytesToBigInt(bytes)
  }

  return scalar
}

function pointFromCompressedBytes(data) {
  const compressedPointPrefix = data[0]
  if (compressedPointPrefix !== 2 && compressedPointPrefix !== 3) {
    return null
  }
  if (data.length !== 1 + byteLength()) return null

  try {
    return pointFromBytes(data)
  } catch (_) {
    return null
  }
}

function h1(message) {
  let point = null
  let i = 0

  while (point === null && i < 100) {
    const hash = sha512.array(new Uint8Array([...toBytesInt32(i), ...message]))
    point = pointFromCompressedBytes([2, ...hash].slice(0, byteLength() + 1))
    i += 1
  }

  if (!point) throw new Error('invalid vrf hash point')

  return point
}

function h2(message) {
  let i = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hash = sha512.array(new Uint8Array([...toBytesInt32(i), ...message]))
    const k = bytesToBigInt(hash.slice(0, byteLength()))

    if (k < curveOrder - 1n) return k + 1n

    i += 1
  }
}

function leftPad32(value) {
  const bytes = bigIntToBytes(value)
  return [...new Array(32 - bytes.length).fill(0), ...bytes]
}

function decodePoint(data) {
  try {
    return pointFromBytes(data)
  } catch (_) {
    return null
  }
}

export function Evaluate(privateKey, message) {
  const currentSecret = bytesToBigInt(privateKeyBytes(privateKey))
  const randomSecret = randomScalar()
  const pointH = h1(message)
  const currentPublicKey = basePoint.multiply(currentSecret)
  const vrf = pointH.multiply(currentSecret).toRawBytes(false)
  const randomG = basePoint.multiply(randomSecret)
  const randomH = pointH.multiply(randomSecret)
  const challenge = h2([
    ...basePoint.toRawBytes(false),
    ...pointH.toRawBytes(false),
    ...currentPublicKey.toRawBytes(false),
    ...vrf,
    ...randomG.toRawBytes(false),
    ...randomH.toRawBytes(false),
  ])
  const response = modOrder(randomSecret - challenge * currentSecret)
  const proof = [...leftPad32(challenge), ...leftPad32(response), ...vrf]

  return [sha256.array(new Uint8Array(vrf)), proof]
}

export function ProofHoHash(publicKey, data, proof) {
  const currentPublicKey = pointFromBytes(publicKey)
  if (proof.length !== 129) throw new Error('invalid vrf')

  const challenge = bytesToBigInt(proof.slice(0, 32))
  const response = bytesToBigInt(proof.slice(32, 64))
  const vrf = proof.slice(64, 129)
  const pointVrf = decodePoint(vrf)

  if (!pointVrf) throw new Error('invalid vrf')

  const responseG = basePoint.multiply(response)
  const challengePublicKey = currentPublicKey.multiply(challenge)
  const pointH = h1(data)
  const responseH = pointH.multiply(response)
  const challengeVrf = pointVrf.multiply(challenge)
  const verificationChallenge = h2([
    ...basePoint.toRawBytes(false),
    ...pointH.toRawBytes(false),
    ...currentPublicKey.toRawBytes(false),
    ...vrf,
    ...responseG.add(challengePublicKey).toRawBytes(false),
    ...responseH.add(challengeVrf).toRawBytes(false),
  ])
  const expectedChallenge = leftPad32(verificationChallenge)

  if (
    !expectedChallenge.every((byte, index) => byte === proof.slice(0, 32)[index])
  ) {
    throw new Error('invalid vrf')
  }

  return sha256.array(new Uint8Array(vrf))
}
