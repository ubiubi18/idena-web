import axios from 'axios'
import dns from 'dns'
import authenticateHandler from '../pages/api/dna/authenticate'
import sessionHandler from '../pages/api/dna/session'
import {
  assertSafeDnaEndpoint,
  DNA_ENDPOINT_REQUEST_OPTIONS,
  isPrivateAddress,
  safeDnaEndpointLookup,
} from './dna-safe-endpoint'

jest.mock('axios')

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

describe('safe DNA endpoints', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it('allows public HTTPS endpoints after DNS validation', async () => {
    await expect(
      assertSafeDnaEndpoint('https://example.com/dna/session', async () => [
        {address: '93.184.216.34'},
      ])
    ).resolves.toBe('https://example.com/dna/session')
  })

  it('rejects private, local, and reserved addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true)
    expect(isPrivateAddress('10.1.2.3')).toBe(true)
    expect(isPrivateAddress('172.16.0.1')).toBe(true)
    expect(isPrivateAddress('192.168.1.1')).toBe(true)
    expect(isPrivateAddress('169.254.1.1')).toBe(true)
    expect(isPrivateAddress('::1')).toBe(true)
    expect(isPrivateAddress('fd00::1')).toBe(true)
    expect(isPrivateAddress('fe80::1')).toBe(true)
    expect(isPrivateAddress('93.184.216.34')).toBe(false)
  })

  it('rejects alternative loopback and metadata address forms', async () => {
    await expect(
      assertSafeDnaEndpoint('https://2130706433/session')
    ).rejects.toThrow('not public')
    await expect(
      assertSafeDnaEndpoint('https://0x7f000001/session')
    ).rejects.toThrow('not public')
    await expect(
      assertSafeDnaEndpoint('https://169.254.169.254/session')
    ).rejects.toThrow('not public')
  })

  it('rejects non-HTTPS and credentialed URLs', async () => {
    await expect(
      assertSafeDnaEndpoint('http://example.com/dna/session', async () => [])
    ).rejects.toThrow('HTTPS')
    await expect(
      assertSafeDnaEndpoint(
        'https://user:pass@example.com/dna/session',
        async () => []
      )
    ).rejects.toThrow('credentials')
  })

  it('rejects DNS results that resolve to private addresses', async () => {
    await expect(
      assertSafeDnaEndpoint('https://example.com/dna/session', async () => [
        {address: '93.184.216.34'},
        {address: '127.0.0.1'},
      ])
    ).rejects.toThrow('not public')
  })

  it('allows public addresses during HTTPS agent lookup', async () => {
    jest
      .spyOn(dns, 'lookup')
      .mockImplementation((hostname, options, callback) => {
        callback(null, '93.184.216.34', 4)
      })

    await expect(
      new Promise((resolve, reject) => {
        safeDnaEndpointLookup('example.com', {}, (error, address, family) => {
          if (error) {
            reject(error)
            return
          }

          resolve({address, family})
        })
      })
    ).resolves.toEqual({address: '93.184.216.34', family: 4})
  })

  it('rejects private addresses during HTTPS agent lookup', async () => {
    jest
      .spyOn(dns, 'lookup')
      .mockImplementation((hostname, options, callback) => {
        callback(null, '127.0.0.1', 4)
      })

    await expect(
      new Promise((resolve, reject) => {
        safeDnaEndpointLookup('example.com', {}, (error, address, family) => {
          if (error) {
            reject(error)
            return
          }

          resolve({address, family})
        })
      })
    ).rejects.toThrow('not public')
  })

  it('does not proxy blocked session endpoints', async () => {
    const req = {
      body: {
        nonceEndpoint: 'https://localhost/session',
        token: 'token',
        address: '0xabc',
      },
    }
    const res = createResponse()

    await sessionHandler(req, res)

    expect(res.statusCode).toBe(400)
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('does not proxy blocked authentication endpoints', async () => {
    const req = {
      body: {
        authenticationEndpoint: 'https://127.0.0.1/authenticate',
        token: 'token',
        signature: 'signature',
      },
    }
    const res = createResponse()

    await authenticateHandler(req, res)

    expect(res.statusCode).toBe(400)
    expect(axios.post).not.toHaveBeenCalled()
  })

  it('uses bounded request options for allowed session endpoints', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: {nonce: 'signin-123'},
      },
    })

    const req = {
      body: {
        nonceEndpoint: 'https://93.184.216.34/session',
        token: 'token',
        address: '0xabc',
      },
    }
    const res = createResponse()

    await sessionHandler(req, res)

    expect(res.statusCode).toBe(200)
    expect(axios.post).toHaveBeenCalledWith(
      'https://93.184.216.34/session',
      {
        token: 'token',
        address: '0xabc',
      },
      DNA_ENDPOINT_REQUEST_OPTIONS
    )
  })
})
