import {getPublicKey} from '@noble/secp256k1'
import {hexToBytes} from '@noble/hashes/utils.js'
import {decryptEcies, encryptEcies} from './ecies'
import {toHexString} from './buffers'

describe('Idena ECIES compatibility', () => {
  const KEY_FIXTURE = [
    'ceed7ca1d3a03e990a95501207736910',
    '18d602944c16029de0e83254c33abb34',
  ].join('')
  const ephemeralPrivateKey =
    '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20'
  const encryptedFixture =
    '0484bf7562262bbd6940085748f3be6afa52ae317155181ece31b66351ccffa4b08cc43d63b2859d469fee15f31c9edb5324266e6fd0407e87382d60fc4511acd8000102030405060708090a0b0c0d0e0f91acb0b896eb5a0206fcedb10f4a1ee59eb16ae3535a15cf6b2bcfeb0c3a974d647723'

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('matches the legacy Node crypto wire format', () => {
    const randomValues = [
      Uint8Array.from(Buffer.from(ephemeralPrivateKey, 'hex')),
      Uint8Array.from([...Array(16).keys()]),
    ]
    jest
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((target) => {
        target.set(randomValues.shift())
        return target
      })

    const publicKey = getPublicKey(hexToBytes(KEY_FIXTURE), false)
    const encrypted = encryptEcies(publicKey, '010203')
    expect(Buffer.isBuffer(encrypted)).toBe(true)
    expect(toHexString(encrypted)).toBe(encryptedFixture)
  })

  test('decrypts legacy ciphertext and rejects tampering', () => {
    const decrypted = decryptEcies(KEY_FIXTURE, encryptedFixture)
    expect(Buffer.isBuffer(decrypted)).toBe(true)
    expect(toHexString(decrypted)).toBe('010203')
    expect(() =>
      decryptEcies(KEY_FIXTURE, `${encryptedFixture.slice(0, -2)}00`)
    ).toThrow('Incorrect MAC')
  })
})
