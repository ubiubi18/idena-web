#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const EXPECTED = Object.freeze({
  releaseId: 'idena-mainnet-legacy-compat-2026.07.12-rc3',
  legacyCommit: '938be81dbdeff85f888f4337060a8ebabb12e5b5',
  nodeCommit: 'aafb254786ac3c82308550a7a82642019f077d6b',
  gossipProtocol: '/idena/gossip/1.1.0',
  intermediateGenesisHeaderSha256:
    '27e696414b955714ba7ed4defe063794c8dcadef28a7e61dd9249b8623571b3c',
  stateSnapshotSha256:
    '7cf6f8c334d76a3617cbd5ac3aa5a104a8d337cb6ceb8d6906c62bf7fab8d131',
  identitySnapshotSha256:
    'f136ec8939e3f78587a38de517128c7071501e283bac7d12c24ce4be830ff8aa',
})

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function loadLock(lockPath) {
  const stat = fs.lstatSync(lockPath)
  assert(stat.isFile() && !stat.isSymbolicLink(), 'lock must be a regular file')
  assert(stat.size <= 1024 * 1024, 'lock is unexpectedly large')
  return JSON.parse(fs.readFileSync(lockPath, 'utf8'))
}

function verifyCompatibilityLock(lockPath) {
  const lock = loadLock(lockPath)
  assert(lock.schema === 1, 'unsupported lock schema')
  assert(lock.releaseId === EXPECTED.releaseId, 'unexpected release candidate')
  assert(lock.status === 'candidate', 'unattested release status')
  assert(lock.legacyBaseline?.nodeVersion === '1.1.2', 'legacy version changed')
  assert(
    lock.legacyBaseline?.commit === EXPECTED.legacyCommit,
    'legacy baseline changed'
  )

  const invariants = lock.chainInvariants || {}
  assert(invariants.mainnetNetworkId === 1, 'mainnet network ID changed')
  assert(
    invariants.gossipProtocol === EXPECTED.gossipProtocol,
    'gossip protocol changed'
  )
  assert(
    invariants.consensusChangesAllowed === false,
    'consensus changes were enabled'
  )
  for (const field of [
    'intermediateGenesisHeaderSha256',
    'stateSnapshotSha256',
    'identitySnapshotSha256',
  ]) {
    assert(invariants[field] === EXPECTED[field], `${field} changed`)
  }

  const nodeComponents = (lock.components || []).filter(
    (component) => component.name === 'idena-go'
  )
  assert(nodeComponents.length === 1, 'expected exactly one idena-go component')
  assert(
    nodeComponents[0].repository === 'https://github.com/ubiubi18/idena-go.git',
    'unexpected idena-go repository'
  )
  assert(
    nodeComponents[0].commit === EXPECTED.nodeCommit,
    'node commit changed'
  )
  assert(
    lock.consumerPins?.['idena-web']?.['idena-go'] === EXPECTED.nodeCommit,
    'idena-web node pin changed'
  )

  const gates = new Set(lock.requiredGates || [])
  for (const gate of [
    'legacy-block-rpc-differential',
    'legacy-state-replay-differential',
    'legacy-modern-p2p-interoperability',
    'secret-scan',
  ]) {
    assert(gates.has(gate), `required gate missing: ${gate}`)
  }
  return lock
}

if (require.main === module) {
  const lockPath = path.resolve(
    __dirname,
    '..',
    'compatibility',
    'stack-lock.json'
  )
  try {
    verifyCompatibilityLock(lockPath)
    console.log('Legacy compatibility lock verified.')
  } catch (error) {
    console.error(`Legacy compatibility lock check failed: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = {EXPECTED, verifyCompatibilityLock}
