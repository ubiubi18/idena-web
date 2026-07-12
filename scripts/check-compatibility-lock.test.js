const fs = require('fs')
const os = require('os')
const path = require('path')
const {verifyCompatibilityLock} = require('./check-compatibility-lock')

const canonicalLock = path.resolve(
  __dirname,
  '..',
  'compatibility',
  'stack-lock.json'
)

function withLock(mutator, assertion) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idena-web-lock-'))
  try {
    const payload = JSON.parse(fs.readFileSync(canonicalLock, 'utf8'))
    mutator(payload)
    const lockPath = path.join(dir, 'stack-lock.json')
    fs.writeFileSync(lockPath, `${JSON.stringify(payload)}\n`, {mode: 0o600})
    assertion(lockPath)
  } finally {
    fs.rmSync(dir, {recursive: true, force: true})
  }
}

describe('legacy compatibility lock', () => {
  it('accepts the reviewed candidate', () => {
    expect(() => verifyCompatibilityLock(canonicalLock)).not.toThrow()
  })

  it('rejects a changed network', () => {
    withLock(
      (lock) => {
        lock.chainInvariants.mainnetNetworkId = 2
      },
      (lockPath) => {
        expect(() => verifyCompatibilityLock(lockPath)).toThrow(
          'mainnet network ID changed'
        )
      }
    )
  })

  it('rejects a changed consumer pin', () => {
    withLock(
      (lock) => {
        lock.consumerPins['idena-web']['idena-go'] = '0'.repeat(40)
      },
      (lockPath) => {
        expect(() => verifyCompatibilityLock(lockPath)).toThrow(
          'idena-web node pin changed'
        )
      }
    )
  })

  it('rejects consensus changes', () => {
    withLock(
      (lock) => {
        lock.chainInvariants.consensusChangesAllowed = true
      },
      (lockPath) => {
        expect(() => verifyCompatibilityLock(lockPath)).toThrow(
          'consensus changes were enabled'
        )
      }
    )
  })
})
