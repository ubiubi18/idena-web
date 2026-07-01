module.exports = {
  testEnvironment: 'jsdom',
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
