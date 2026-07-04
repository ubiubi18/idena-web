import axios from 'axios'
import {
  assertSafeDnaEndpoint,
  DNA_ENDPOINT_REQUEST_OPTIONS,
} from '../../../server/dna-safe-endpoint'

export default async (req, res) => {
  try {
    const {nonceEndpoint, token, address} = req.body
    const safeNonceEndpoint = await assertSafeDnaEndpoint(nonceEndpoint)

    const {data} = await axios.post(
      safeNonceEndpoint,
      {
        token,
        address,
      },
      DNA_ENDPOINT_REQUEST_OPTIONS
    )

    const {data: jsonData, error, success} = data

    if (success) return res.status(200).json({data: jsonData})
    return res.status(400).json({error})
  } catch (error) {
    return res
      .status(error?.response?.status ?? 400)
      .json({error: error?.response?.data || error?.message})
  }
}
