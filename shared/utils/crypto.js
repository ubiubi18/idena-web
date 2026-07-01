/* eslint-disable no-bitwise */
import sha3 from 'js-sha3'
import BN from 'bn.js'
import eciesjs from 'idena-eciesjs'
import crypto from 'crypto'
import {hexToUint8Array, toHexString} from './buffers'
import {
  curveOrder,
  publicKeyCreate,
  recoverPublicKey,
  signHash,
} from './secp256k1'
import PrivateKeysPackage from '../models/privateKeysPackage'
import PublicFlipKey from '../models/publicFlipKey'
import {FlipGrade} from '../types'

export function privateKeyToPublicKey(key) {
  return toHexString(publicKeyCreate(key, false), true)
}

function pubKeyToAddr(pubKey) {
  return toHexString(sha3.keccak_256.array(pubKey.slice(1)).slice(12), true)
}

export function privateKeyToAddress(key) {
  if (!key) {
    return '0x0000000000000000000000000000000000000000'
  }
  return pubKeyToAddr(publicKeyCreate(key, false))
}

export function generatePrivateKey() {
  const buf = new Uint8Array(32)
  window.crypto.getRandomValues(buf)
  return buf
}

export function encryptPrivateKey(data, passphrase) {
  const key = sha3.sha3_256.array(passphrase)
  const dataArray = Buffer.from(
    typeof data === 'string' ? hexToUint8Array(data) : new Uint8Array(data)
  )
  const nonce = new Uint8Array(12)
  window.crypto.getRandomValues(nonce)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(nonce))

  const encrypted = [
    ...nonce,
    ...cipher.update(dataArray),
    ...cipher.final(),
    ...cipher.getAuthTag(),
  ]
  return toHexString(encrypted, false)
}

export function decryptPrivateKey(data, passphrase) {
  const key = sha3.sha3_256.array(passphrase)
  const dataArray = Buffer.from(
    typeof data === 'string' ? hexToUint8Array(data) : new Uint8Array(data)
  )
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    dataArray.slice(0, 12)
  )
  decipher.setAuthTag(dataArray.slice(dataArray.length - 16))
  const decrypted = [
    ...decipher.update(dataArray.slice(12, dataArray.length - 16)),
    ...decipher.final(),
  ]
  return toHexString(decrypted)
}

export function preparePublicFlipKey(privateKey, epoch) {
  const publicFlipKey = generateFlipKey(true, epoch, privateKey)

  const p = new PublicFlipKey(epoch, publicFlipKey)
  p.sign(privateKey)
  return p
}

export function prepareFlipKeysPackage(candidates, privateKey, epoch) {
  const publicFlipKey = generateFlipKey(true, epoch, privateKey)
  const privateFlipKey = generateFlipKey(false, epoch, privateKey)

  const p = new PrivateKeysPackage(
    epoch,
    candidates,
    publicFlipKey,
    privateFlipKey
  )

  p.sign(privateKey)

  return p
}

export function createShortAnswersHash(key, epoch, hashesInOrder, answers) {
  const data = serializeAnswers(hashesInOrder, answers)
  const salt = generateShortAnswersSalt(epoch, key)
  return sha3.keccak_256.array([...data, ...salt])
}

export function generateShortAnswersSalt(epoch, key) {
  const hash = sha3.keccak_256.array(`short-answers-salt-${epoch}`)
  const {signature, recid} = signHash(hash, key)

  return sha3.sha3_256.array([...signature, recid])
}

export function serializeAnswers(hashesInOrder, answers) {
  const orderedAnswers = hashesInOrder.map(h => {
    const item = answers.find(x => x.hash === h)
    if (!item) {
      return {answer: 0, grade: FlipGrade.None}
    }
    return {answer: item.answer, grade: item.grade}
  })

  const res = orderedAnswers.reduce((cum, current, idx) => {
    // left
    if (current.answer === 1) {
      cum.setn(idx, true)
    }
    // right
    if (current.answer === 2) {
      cum.setn(idx + orderedAnswers.length, true)
    }
    // wrong words
    if (current.grade) {
      const g = new BN(current.grade)
      return cum.or(g.shln(idx * 3 + orderedAnswers.length * 2))
    }
    return cum
  }, new BN(0))

  return res.toArray('be')
}

export function decryptMessage(key, message) {
  return eciesjs.decrypt(key, message)
}

export function generateFlipKey(isPublic, epoch, key) {
  const seedStart = isPublic
    ? 'flip-key-for-epoch-'
    : 'flip-private-key-for-epoch-'

  const hash = sha3.keccak_256.array(seedStart + epoch.toString())

  const {signature, recid} = signHash(hash, key)
  const result = generateKeyFromSeed([...signature, recid])

  return [...Array(32 - result.length).fill(0), ...result]
}

function generateKeyFromSeed(seed) {
  const size = 40
  const b = seed.slice(0, size)

  let k = new BN(b)
  const n = new BN((curveOrder - 1n).toString())
  k = k.mod(n)
  k = k.add(new BN(1))
  return k.toArray()
}

export function encryptFlipData(publicHex, privateHex, privateKey, epoch) {
  const publicFlipKey = generateFlipKey(true, epoch, privateKey)
  const privateFlipKey = generateFlipKey(false, epoch, privateKey)

  let encryptedPublicData
  let encryptedPrivateData
  try {
    encryptedPublicData = eciesjs.encrypt(
      publicKeyCreate(publicFlipKey),
      publicHex
    )
  } catch (e) {
    throw new Error(
      `Cannot encrypt public flip hex, keySize: [${publicFlipKey.length}], err: ${e.message}`
    )
  }

  try {
    encryptedPrivateData = eciesjs.encrypt(
      publicKeyCreate(privateFlipKey),
      privateHex
    )
  } catch (e) {
    throw new Error(
      `Cannot encrypt private flip hex, keySize: [${privateFlipKey.length}], err: ${e.message}`
    )
  }

  return {
    encryptedPublicData,
    encryptedPrivateData,
  }
}

export function signMessage(data, key) {
  const hash = sha3.keccak_256.array(data)

  const {signature, recid} = signHash(hash, key)

  return Buffer.from([...signature, recid])
}

const SignedDataFormat = {
  DoubleHash: 'doubleHash',
  Prefix: 'prefix',
}

export function dnaSign(data, key, format = SignedDataFormat.DoubleHash) {
  switch (format) {
    case SignedDataFormat.Prefix: {
      const message = `\x00Idena Signed Message:\n${
        data ? data.length + data : '0'
      }`
      const hash = sha3.keccak_256.array(message)

      const {signature, recid} = signHash(hash, key)
      return Buffer.from([...signature, recid])
    }
    case SignedDataFormat.DoubleHash: {
      const hash = sha3.keccak_256.array(data)
      const hash2 = sha3.keccak_256.array(hash)

      const {signature, recid} = signHash(hash2, key)

      return Buffer.from([...signature, recid])
    }
    default:
      throw new Error(`Unknown format: ${format}`)
  }
}

export function checkSignature(data, signature) {
  try {
    const hash = sha3.keccak_256.array(data)

    const pubKey = recoverPublicKey(hash, signature, false)

    return pubKeyToAddr(pubKey)
  } catch (e) {
    console.log(e)
    return null
  }
}

export function keccakHash(data) {
  return sha3.keccak_256.array(data)
}
