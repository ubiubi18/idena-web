import sha3 from 'js-sha3'
import messages from './proto/models_pb'
import {signHash} from '../utils/secp256k1'

export default class PublicFlipKey {
  constructor(epoch, key) {
    this.key = new Uint8Array(key)
    this.epoch = epoch
  }

  sign(key) {
    const data = new messages.ProtoFlipKey.Data()
    data.setKey(this.key)
    data.setEpoch(this.epoch)

    const hash = sha3.keccak_256.array(data.serializeBinary())

    const {signature, recid} = signHash(hash, key)

    this.signature = Buffer.from([...signature, recid])

    return this
  }

  getKey() {
    return this.key
  }

  getSignature() {
    return this.signature
  }

  getEpoch() {
    return this.epoch
  }
}
