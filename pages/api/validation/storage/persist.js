import {checkSignature} from '../../../../shared/utils/crypto'
import {createPool} from '../../../../shared/utils/pg'
import {publicValidationError} from '../../../../server/public-api-error'

export default async (req, res) => {
  try {
    const {data, coinbase, signature} = req.body

    const recoveredCoinbase = checkSignature(coinbase, signature)?.toLowerCase()

    if (!recoveredCoinbase || coinbase !== recoveredCoinbase)
      throw new Error('signature is invalid')

    const pool = createPool()

    await pool.query(
      `
      INSERT INTO "validation-storage" (coinbase, data, updated_at)
VALUES ($1, $2, $3::timestamp)
ON CONFLICT (coinbase)
DO UPDATE SET 
    data = EXCLUDED.data,
    updated_at = EXCLUDED.updated_at
WHERE "validation-storage".updated_at < EXCLUDED.updated_at;
`,
      [coinbase, data, new Date(data.timestamp)]
    )

    return res.status(200).end()
  } catch (e) {
    return res.status(400).json({error: publicValidationError(e)})
  }
}
