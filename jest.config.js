module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', {presets: ['next/babel']}],
  },
  transformIgnorePatterns: ['/node_modules/(?!@noble/)'],
  moduleNameMapper: {
    '^dexie$': '<rootDir>/node_modules/dexie/dist/dexie.js',
  },
  testPathIgnorePatterns: [
    '<rootDir>/renderer/.next/',
    '<rootDir>/renderer/out/',
    '<rootDir>/dist/',
    '<rootDir>/node_modules/',
    '<rootDir>/.vercel/',
  ],
}
