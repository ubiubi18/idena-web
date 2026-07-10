const PUBLIC_VALIDATION_ERRORS = new Map([
  ['answer is invalid', 'answer is invalid'],
  ['answers are invalid', 'answers are invalid'],
  ['signature is invalid', 'signature is invalid'],
  ['validation missing', 'validation missing'],
  ['validation type is invalid', 'validation type is invalid'],
])

export function publicValidationError(error) {
  return PUBLIC_VALIDATION_ERRORS.get(error?.message) || 'Request failed'
}
