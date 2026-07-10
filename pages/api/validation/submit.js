import {SessionType} from '../../../shared/types'
import {checkSignature} from '../../../shared/utils/crypto'
import {createPool} from '../../../shared/utils/pg'
import {publicValidationError} from '../../../server/public-api-error'

function validationSessionField(type) {
  if (type === SessionType.Short) return 'shortFlips'
  if (type === SessionType.Long) return 'longFlips'
  throw new Error('validation type is invalid')
}

function sanitizeAnswer(answer) {
  if (!answer || typeof answer !== 'object') {
    throw new Error('answer is invalid')
  }

  const sanitized = {hash: answer.hash}

  if (Object.prototype.hasOwnProperty.call(answer, 'answer')) {
    if (
      !Number.isInteger(answer.answer) ||
      answer.answer < 0 ||
      answer.answer > 3
    ) {
      throw new Error('answer is invalid')
    }
    sanitized.answer = answer.answer
  }

  if (Object.prototype.hasOwnProperty.call(answer, 'wrongWords')) {
    sanitized.wrongWords = Boolean(answer.wrongWords)
  }

  return sanitized
}

export function mergeSubmittedAnswers(flips, answers) {
  if (!Array.isArray(flips) || !Array.isArray(answers)) {
    throw new Error('answers are invalid')
  }

  const answersByHash = new Map(
    answers.map(sanitizeAnswer).map((answer) => [answer.hash, answer])
  )

  return flips.map((flip) => ({
    ...flip,
    ...(answersByHash.get(flip.hash) || {}),
  }))
}

export default async (req, res) => {
  try {
    const {type, id, answers, signature} = req.body

    if (!id) {
      return res.status(400).send('id is missing')
    }

    const coinbase = checkSignature(id, signature)?.toLowerCase()

    if (!coinbase) throw new Error('signature is invalid')

    const field = validationSessionField(type)

    const pool = createPool()

    const data = await pool.query(
      `select coinbase, flips->'${field}' as flips from validations where id = $1`,
      [id]
    )

    if (!data.rowCount) throw new Error('validation missing')

    const validation = data.rows[0]
    if (validation.coinbase?.toLowerCase() !== coinbase) {
      throw new Error('signature is invalid')
    }

    const result = mergeSubmittedAnswers(validation.flips, answers)

    await pool.query(
      `update validations set flips = jsonb_set(flips, '{${field}}', $2::jsonb) where id = $1`,
      [id, JSON.stringify(result)]
    )

    return res.status(200).end()
  } catch (e) {
    return res.status(400).json({error: publicValidationError(e)})
  }
}
