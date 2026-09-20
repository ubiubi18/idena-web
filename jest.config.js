module.exports = {
  moduleNameMapper: {
    '^@jimp/plugin-print/load-font$':
      '<rootDir>/node_modules/@jimp/plugin-print/dist/commonjs/load-font.js',
  },
  testPathIgnorePatterns: [
    '<rootDir>/renderer/.next/',
    '<rootDir>/renderer/out/',
    '<rootDir>/dist/',
    '<rootDir>/node_modules/',
    '<rootDir>/.vercel/',
  ],
}
