import {urlLogContext} from './utils'

const SECRET_TOKEN = ['secret-token', 'that-should-not-be-logged'].join('-')
const SECRET_SIGNATURE = ['signature', 'that-should-not-be-logged'].join('-')

describe('DNA URL logging', () => {
  it('logs URL structure without query values', () => {
    const context = urlLogContext(
      `https://example.com/dna/send?token=${SECRET_TOKEN}&signature=${SECRET_SIGNATURE}`
    )
    const logged = JSON.stringify(context)

    expect(context).toEqual({
      protocol: 'https:',
      host: 'example.com',
      pathname: '/dna/send',
      searchParamKeys: ['signature', 'token'],
    })
    expect(logged).not.toContain(SECRET_TOKEN)
    expect(logged).not.toContain(SECRET_SIGNATURE)
  })

  it('supports URL objects', () => {
    expect(urlLogContext(new URL('dna://send/v1?token=secret'))).toEqual({
      protocol: 'dna:',
      host: 'send',
      pathname: '/v1',
      searchParamKeys: ['token'],
    })
  })

  it('summarizes invalid URLs without logging the raw value', () => {
    expect(urlLogContext(`not a url ${SECRET_TOKEN}`)).toEqual({
      type: 'invalid',
      length: 48,
    })
  })
})
