import submitHandler, {
  mergeSubmittedAnswers,
} from '../pages/api/validation/submit'
import {checkSignature} from '../shared/utils/crypto'
import {createPool} from '../shared/utils/pg'
import {SessionType} from '../shared/types'

jest.mock('../shared/utils/crypto', () => ({
  checkSignature: jest.fn(),
}))

jest.mock('../shared/utils/pg', () => ({
  createPool: jest.fn(),
}))

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    status(code) {
      this.statusCode = code
      return this
    },
    send(body) {
      this.body = body
      return this
    },
    json(body) {
      this.body = body
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

describe('validation answer submission', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('does not merge server-owned scoring fields from submitted answers', () => {
    const result = mergeSubmittedAnswers(
      [{hash: 'h1', rightAnswer: 1, reason: 0, answer: 0}],
      [
        {
          hash: 'h1',
          answer: 2,
          rightAnswer: 2,
          reason: 999,
          wrongWords: true,
        },
      ]
    )

    expect(result).toEqual([
      {
        hash: 'h1',
        rightAnswer: 1,
        reason: 0,
        answer: 2,
        wrongWords: true,
      },
    ])
  })

  it('rejects invalid answer values', () => {
    expect(() =>
      mergeSubmittedAnswers([{hash: 'h1'}], [{hash: 'h1', answer: 99}])
    ).toThrow('answer is invalid')
  })

  it('rejects signatures that do not match validation owner', async () => {
    checkSignature.mockReturnValue('0xattacker')
    const query = jest.fn().mockResolvedValueOnce({
      rowCount: 1,
      rows: [
        {
          coinbase: '0xowner',
          flips: [{hash: 'h1', rightAnswer: 1, reason: 0}],
        },
      ],
    })
    createPool.mockReturnValue({query})

    const res = createResponse()

    await submitHandler(
      {
        body: {
          id: 'validation-id',
          type: SessionType.Short,
          answers: [{hash: 'h1', answer: 1}],
          signature: 'signature',
        },
      },
      res
    )

    expect(res.statusCode).toBe(400)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('updates only whitelisted answer fields for the validation owner', async () => {
    checkSignature.mockReturnValue('0xowner')
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            coinbase: '0xOwner',
            flips: [{hash: 'h1', rightAnswer: 1, reason: 0}],
          },
        ],
      })
      .mockResolvedValueOnce({})
    createPool.mockReturnValue({query})

    const res = createResponse()

    await submitHandler(
      {
        body: {
          id: 'validation-id',
          type: SessionType.Long,
          answers: [
            {
              hash: 'h1',
              answer: 2,
              rightAnswer: 2,
              reason: 999,
              wrongWords: true,
            },
          ],
          signature: 'signature',
        },
      },
      res
    )

    expect(res.statusCode).toBe(200)
    expect(res.ended).toBe(true)

    const [, updateParams] = query.mock.calls[1]
    expect(JSON.parse(updateParams[1])).toEqual([
      {
        hash: 'h1',
        rightAnswer: 1,
        reason: 0,
        answer: 2,
        wrongWords: true,
      },
    ])
  })
})
