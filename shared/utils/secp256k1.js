import * as secp256k1 from '@noble/secp256k1'
import {hmac} from '@noble/hashes/hmac'
import {sha256} from '@noble/hashes/sha256'
import {hexToUint8Array} from './buffers'

secp256k1.utils.hmacSha256Sync = (key, ...messages) =>
  hmac(sha256, key, secp256k1.utils.concatBytes(...messages))

export const curveOrder = secp256k1.CURVE.n
export const basePoint = secp256k1.Point.BASE

export function privateKeyBytes(key) {
  return typeof key === 'string' ? hexToUint8Array(key) : new Uint8Array(key)
}

export function publicKeyCreate(key, compressed = true) {
  return secp256k1.getPublicKey(privateKeyBytes(key), compressed)
}

export function signHash(hash, key) {
  const [signature, recid] = secp256k1.signSync(
    new Uint8Array(hash),
    privateKeyBytes(key),
    {
      der: false,
      recovered: true,
    }
  )
  return {
    signature,
    recid,
  }
}

export function recoverPublicKey(hash, signature, compressed = false) {
  const sig = typeof signature === 'string' ? hexToUint8Array(signature) : signature
  const sigBytes = new Uint8Array(sig)

  return secp256k1.recoverPublicKey(
    new Uint8Array(hash),
    sigBytes.slice(0, -1),
    Number(sigBytes[sigBytes.length - 1]),
    compressed
  )
}

export function pointFromBytes(bytes) {
  return secp256k1.Point.fromHex(new Uint8Array(bytes))
}
