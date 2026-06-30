// Adapted from @idena/vrf-js; see THIRD_PARTY_NOTICES.md.
import BN from 'bn.js'
import {ec as EC} from 'elliptic'
import {sha256} from 'js-sha256'
import {sha512} from 'js-sha512'

const ec = new EC('secp256k1')
const one = new BN(1)

function toBytesInt32(num) {
  return new Uint8Array([
    Math.floor(num / 0x1000000) % 0x100,
    Math.floor(num / 0x10000) % 0x100,
    Math.floor(num / 0x100) % 0x100,
    num % 0x100,
  ])
}

function byteLength() {
  return Math.ceil(ec.n.bitLength() / 8)
}

function randomScalar() {
  const crypto = globalThis.crypto || globalThis.window?.crypto
  if (!crypto?.getRandomValues) {
    throw new Error('Secure random source unavailable')
  }

  const bytes = new Uint8Array(byteLength())
  let scalar = new BN(0)

  while (scalar.isZero() || scalar.cmp(ec.curve.n) >= 0) {
    crypto.getRandomValues(bytes)
    scalar = new BN(bytes)
  }

  return scalar
}

function unmarshal(data) {
  const compressedPointPrefix = data[0]
  if (compressedPointPrefix !== 2 && compressedPointPrefix !== 3) {
    return [null, null]
  }
  if (data.length !== 1 + byteLength()) return [null, null]

  try {
    const point = ec.curve.pointFromX(new BN(data.slice(1)))
    return [point.x, point.y]
  } catch (_) {
    return [null, null]
  }
}

function h1(message) {
  let x = null
  let y = null
  let i = 0

  while (x === null && i < 100) {
    const hash = sha512.array(new Uint8Array([...toBytesInt32(i), ...message]))
    const point = unmarshal([2, ...hash].slice(0, byteLength() + 1))
    x = point[0]
    y = point[1]
    i += 1
  }

  return ec.curve.point(x, y)
}

function h2(message) {
  let i = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const hash = sha512.array(new Uint8Array([...toBytesInt32(i), ...message]))
    const k = new BN(hash.slice(0, byteLength()))

    if (k.cmp(ec.curve.n.sub(one)) === -1) return k.add(one)

    i += 1
  }
}

function leftPad32(value) {
  return [...new Array(32 - value.byteLength()).fill(0), ...value.toArray()]
}

function decodePoint(data) {
  try {
    return ec.curve.decodePoint(data)
  } catch (_) {
    return null
  }
}

export function Evaluate(privateKey, message) {
  const currentKey = ec.keyFromPrivate(privateKey)
  const currentSecret = currentKey.getPrivate()
  const randomSecret = randomScalar()
  const pointH = h1(message)
  const vrf = pointH.mul(currentSecret).encode()
  const randomG = ec.curve.g.mul(randomSecret)
  const randomH = pointH.mul(randomSecret)
  const challenge = h2([
    ...ec.curve.g.encode(),
    ...pointH.encode(),
    ...currentKey.getPublic().encode(),
    ...vrf,
    ...randomG.encode(),
    ...randomH.encode(),
  ])
  const response = randomSecret.sub(challenge.mul(currentSecret)).umod(ec.curve.n)
  const proof = [...leftPad32(challenge), ...leftPad32(response), ...vrf]

  return [sha256.array(new Uint8Array(vrf)), proof]
}

export function ProofHoHash(publicKey, data, proof) {
  const currentKey = ec.keyFromPublic(publicKey)
  if (proof.length !== 129) throw new Error('invalid vrf')

  const challenge = proof.slice(0, 32)
  const response = proof.slice(32, 64)
  const vrf = proof.slice(64, 129)
  const pointVrf = decodePoint(vrf)

  if (!pointVrf) throw new Error('invalid vrf')

  const responseG = ec.curve.g.mul(response)
  const challengePublicKey = currentKey.getPublic().mul(challenge)
  const pointH = h1(data)
  const responseH = pointH.mul(response)
  const challengeVrf = pointVrf.mul(challenge)
  const verificationChallenge = h2([
    ...ec.curve.g.encode(),
    ...pointH.encode(),
    ...currentKey.getPublic().encode(),
    ...vrf,
    ...responseG.add(challengePublicKey).encode(),
    ...responseH.add(challengeVrf).encode(),
  ])
  const expectedChallenge = leftPad32(verificationChallenge)

  if (!expectedChallenge.every((byte, index) => byte === challenge[index])) {
    throw new Error('invalid vrf')
  }

  return sha256.array(new Uint8Array(vrf))
}
