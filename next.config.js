module.exports = {
  outputFileTracingRoot: __dirname,
  eslint: {
    ignoreDuringBuilds: true,
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
