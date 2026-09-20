const path = require('path')

const jimpEsmEntry = path.join(
  path.dirname(require.resolve('jimp/package.json')),
  'dist/esm/index.js'
)

module.exports = {
  webpack(config, {isServer}) {
    if (!isServer) {
      // Jimp 1.6.1 publishes an empty browser entry instead of its ESM build.
      config.resolve.alias = {...config.resolve.alias, jimp$: jimpEsmEntry}
      config.resolve.fallback = {...config.resolve.fallback, fs: false}
    }
    return config
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
