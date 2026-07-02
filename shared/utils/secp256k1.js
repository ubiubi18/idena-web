import * as secp256k1 from '@noble/secp256k1'
import {hmac} from '@noble/hashes/hmac.js'
import {sha256} from '@noble/hashes/sha2.js'
import {hexToUint8Array} from './buffers'

secp256k1.hashes.hmacSha256 = (key, message) => hmac(sha256, key, message)
secp256k1.hashes.sha256 = sha256

export const curveOrder =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
export const basePoint = secp256k1.Point.BASE

export function privateKeyBytes(key) {
  return typeof key === 'string' ? hexToUint8Array(key) : new Uint8Array(key)
}

export function publicKeyCreate(key, compressed = true) {
  return secp256k1.getPublicKey(privateKeyBytes(key), compressed)
}

export function signHash(hash, key) {
  const signature = secp256k1.sign(new Uint8Array(hash), privateKeyBytes(key), {
    format: 'recovered',
    prehash: false,
  })
  const recid = signature[0]
  if (recid === undefined) {
    throw new Error('Failed to generate recoverable signature')
  }
  return {
    signature: signature.slice(1),
    recid,
  }
}

export function recoverPublicKey(hash, signature, compressed = false) {
  const sig =
    typeof signature === 'string' ? hexToUint8Array(signature) : signature
  const sigBytes = new Uint8Array(sig)
  const compactSignature = sigBytes.slice(0, -1)
  const recovery = Number(sigBytes[sigBytes.length - 1])
  const pubKey = secp256k1.recoverPublicKey(
    new Uint8Array([recovery, ...compactSignature]),
    new Uint8Array(hash),
    {prehash: false}
  )

  return secp256k1.Point.fromBytes(pubKey).toBytes(compressed)
}

export function pointFromBytes(bytes) {
  return secp256k1.Point.fromBytes(new Uint8Array(bytes))
}
