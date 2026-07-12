/* eslint-disable no-bitwise */
import {ctr} from '@noble/ciphers/aes.js'
import {hmac} from '@noble/hashes/hmac.js'
import {sha256} from '@noble/hashes/sha2.js'
import {concatBytes, hexToBytes} from '@noble/hashes/utils.js'
import {
  getPublicKey,
  getSharedSecret,
  utils as secp256k1Utils,
} from '@noble/secp256k1'

const EPHEMERAL_KEY_LENGTH = 65
const IV_LENGTH = 16
const MAC_LENGTH = 32

function removeHexPrefix(value) {
  return value.startsWith('0x') || value.startsWith('0X')
    ? value.slice(2)
    : value
}

function toBytes(value) {
  if (typeof value === 'string') return hexToBytes(removeHexPrefix(value))
  return new Uint8Array(value)
}

function randomBytes(length) {
  const value = new Uint8Array(length)
  globalThis.crypto.getRandomValues(value)
  return value
}

function randomPrivateKey() {
  let key
  do {
    key = randomBytes(32)
  } while (!secp256k1Utils.isValidSecretKey(key))
  return key
}

function deriveSecret(privateKey, publicKey) {
  return getSharedSecret(privateKey, publicKey, false).slice(1, 33)
}

function kdf(secret, outputLength) {
  const blocks = []
  let written = 0
  let counter = 1
  while (written < outputLength) {
    const counterBytes = Uint8Array.of(
      counter >>> 24,
      counter >>> 16,
      counter >>> 8,
      counter
    )
    const block = sha256(concatBytes(counterBytes, secret))
    blocks.push(block)
    written += block.length
    counter += 1
  }
  return concatBytes(...blocks).slice(0, outputLength)
}

function equalConstTime(first, second) {
  if (first.length !== second.length) return false
  let difference = 0
  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index]
  }
  return difference === 0
}

export function encryptEcies(publicKeyValue, messageValue) {
  const publicKey = toBytes(publicKeyValue)
  const message = toBytes(messageValue)
  const ephemeralPrivateKey = randomPrivateKey()
  const ephemeralPublicKey = getPublicKey(ephemeralPrivateKey, false)
  const secret = deriveSecret(ephemeralPrivateKey, publicKey)
  const hash = kdf(secret, 32)
  const iv = randomBytes(IV_LENGTH)
  const encryptionKey = hash.slice(0, 16)
  const macKey = sha256(hash.slice(16))
  const ciphertext = ctr(encryptionKey, iv).encrypt(message)
  const cipherAndIv = concatBytes(iv, ciphertext)
  const messageMac = hmac(sha256, macKey, cipherAndIv)
  return Buffer.from(concatBytes(ephemeralPublicKey, cipherAndIv, messageMac))
}

export function decryptEcies(privateKeyValue, encryptedValue) {
  const privateKey = toBytes(privateKeyValue)
  const encrypted = toBytes(encryptedValue)
  const metadataLength = EPHEMERAL_KEY_LENGTH + IV_LENGTH + MAC_LENGTH
  if (encrypted.length <= metadataLength) {
    throw new Error('Invalid ciphertext: data is too small')
  }
  if (encrypted[0] < 2 || encrypted[0] > 4) {
    throw new Error('Invalid ciphertext prefix')
  }

  const ciphertextLength = encrypted.length - metadataLength
  const ephemeralPublicKey = encrypted.slice(0, EPHEMERAL_KEY_LENGTH)
  const iv = encrypted.slice(
    EPHEMERAL_KEY_LENGTH,
    EPHEMERAL_KEY_LENGTH + IV_LENGTH
  )
  const cipherAndIv = encrypted.slice(
    EPHEMERAL_KEY_LENGTH,
    EPHEMERAL_KEY_LENGTH + IV_LENGTH + ciphertextLength
  )
  const ciphertext = cipherAndIv.slice(IV_LENGTH)
  const messageMac = encrypted.slice(
    EPHEMERAL_KEY_LENGTH + IV_LENGTH + ciphertextLength
  )

  const secret = deriveSecret(privateKey, ephemeralPublicKey)
  const hash = kdf(secret, 32)
  const encryptionKey = hash.slice(0, 16)
  const macKey = sha256(hash.slice(16))
  const currentMac = hmac(sha256, macKey, cipherAndIv)
  if (!equalConstTime(currentMac, messageMac)) {
    throw new Error('Incorrect MAC')
  }
  return Buffer.from(ctr(encryptionKey, iv).decrypt(ciphertext))
}
