import db from './db'
import {writeValidationLog} from './logs'

jest.mock('./db', () => ({
  __esModule: true,
  default: {
    table: jest.fn(),
  },
}))

const SECRET_PRIVATE_KEY = ['private-key', 'that-should-not-be-logged'].join(
  '-'
)

describe('validation logs', () => {
  let consoleError

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    db.table.mockReturnValue({
      add: jest.fn(() => Promise.reject(new Error('quota exceeded'))),
    })
  })

  afterEach(() => {
    consoleError.mockRestore()
    jest.clearAllMocks()
  })

  it('does not log validation payloads when IndexedDB writes fail', async () => {
    await writeValidationLog(12, {privateKey: SECRET_PRIVATE_KEY})

    const logged = JSON.stringify(consoleError.mock.calls)

    expect(logged).toContain('12')
    expect(logged).not.toContain(SECRET_PRIVATE_KEY)
  })
})
