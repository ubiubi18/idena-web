import {webcrypto} from 'crypto'
import {privateKeyToPublicKey} from './crypto'
import {Evaluate, ProofHoHash} from './vrf'
import {hexToUint8Array, toHexString} from './buffers'

describe('VRF utilities', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: webcrypto,
    })
  })

  it('creates a verifiable VRF proof', () => {
    const testVectorKey =
      '0x7d50c14c5fd9d3265c9c8efce36751d18d658f819f876064af9f0c2c9f7d0f38'
    const seed = hexToUint8Array('0xaabbccddeeff00112233445566778899')

    const [index, proof] = Evaluate(testVectorKey, seed)
    const publicKey = hexToUint8Array(privateKeyToPublicKey(testVectorKey))
    const verifiedIndex = ProofHoHash(publicKey, seed, proof)

    expect(toHexString(index, true)).toBe(
      '0x27b4ac0c5652dc4b33984829d5f887462a5b035208889489329041f87f69ca16'
    )
    expect(toHexString(index, true)).toBe(toHexString(verifiedIndex, true))
    expect(index).toHaveLength(32)
    expect(proof).toHaveLength(129)
  })
})
