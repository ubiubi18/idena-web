module.exports = {
  env: {
    es2020: true,
  },
  plugins: ['testcafe'],
  extends: ['wesbos', 'plugin:testcafe/recommended'],
  rules: {
    'no-use-before-define': ['error', 'nofunc'],
    'react/no-unknown-property': ['error', {ignore: ['jsx', 'global']}],
    'react/prop-types': 0,
    'prettier/prettier': [
      'error',
      {
        printWidth: 80,
      },
    ],
  },
}
