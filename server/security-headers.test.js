const {
  buildContentSecurityPolicy,
  createSecurityHeaders,
} = require('./security-headers')

describe('security headers', () => {
  test('production policy blocks external scripts, framing, and objects', () => {
    const policy = buildContentSecurityPolicy({isDevelopment: false})
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).toContain('upgrade-insecure-requests')
    expect(policy).not.toContain("'unsafe-eval'")
    expect(policy).not.toMatch(/script-src[^;]*https:/)
  })

  test('development policy permits the eval tooling required by Next.js', () => {
    const policy = buildContentSecurityPolicy({isDevelopment: true})
    expect(policy).toContain("'unsafe-eval'")
    expect(policy).not.toContain('upgrade-insecure-requests')
  })

  test('sets browser security headers while retaining camera QR scanning', () => {
    const headers = Object.fromEntries(
      createSecurityHeaders().map(({key, value}) => [key, value])
    )
    expect(headers['Permissions-Policy']).toContain('camera=(self)')
    expect(headers['Permissions-Policy']).toContain('microphone=()')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
  })
})
