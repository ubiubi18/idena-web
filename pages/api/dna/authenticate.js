import axios from 'axios'
import {
  assertSafeDnaEndpoint,
  DNA_ENDPOINT_REQUEST_OPTIONS,
} from '../../../server/dna-safe-endpoint'

export default async (req, res) => {
  try {
    const {authenticationEndpoint, token, signature} = req.body
    const safeAuthenticationEndpoint = await assertSafeDnaEndpoint(
      authenticationEndpoint
    )

    const {data} = await axios.post(
      safeAuthenticationEndpoint,
      {
        token,
        signature,
      },
      DNA_ENDPOINT_REQUEST_OPTIONS
    )

    const {data: jsonResponse, error, success} = data

    if (success) return res.status(200).json({data: jsonResponse})
    return res.status(400).json({error})
  } catch (error) {
    return res
      .status(error?.response?.status ?? 400)
      .json({error: error?.response?.data || error?.message})
  }
}
