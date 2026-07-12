const {createSecurityHeaders} = require('./server/security-headers')

const isDevelopment = process.env.NODE_ENV !== 'production'

module.exports = {
  outputFileTracingRoot: __dirname,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: createSecurityHeaders({isDevelopment}),
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/dna/signin/v(\\d{1,})',
        destination: '/dna/signin',
        permanent: false,
      },
    ]
  },
}
