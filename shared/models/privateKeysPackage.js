import sha3 from 'js-sha3'
import messages from './proto/models_pb'
import {publicKeyCreate, signHash} from '../utils/secp256k1'
import {encryptEcies} from '../utils/ecies'

export default class PrivateKeysPackage {
  constructor(epoch, keysArray, publicFlipKey, privateFlipKey) {
    const protoKeys = new messages.ProtoFlipPrivateKeys()
    protoKeys.setKeysList(
      keysArray.map((candidate) => encryptEcies(candidate, privateFlipKey))
    )
    const binary = protoKeys.serializeBinary()

    this.data = encryptEcies(publicKeyCreate(publicFlipKey), binary)
    this.epoch = epoch
  }

  sign(key) {
    const data = new messages.ProtoPrivateFlipKeysPackage.Data()
    data.setPackage(this.data)
    data.setEpoch(this.epoch)

    const hash = sha3.keccak_256.array(data.serializeBinary())

    const {signature, recid} = signHash(hash, key)

    this.signature = Buffer.from([...signature, recid])

    return this
  }

  getData() {
    return this.data
  }

  getSignature() {
    return this.signature
  }

  getEpoch() {
    return this.epoch
  }
}
