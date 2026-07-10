module.exports = {
  env: {
    es2020: true,
  },
  extends: ['wesbos'],
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
