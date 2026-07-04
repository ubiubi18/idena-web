import React from 'react'

const EXPLICIT_REDACTIONS = ['SET_EXTERNAL_KEY', 'SET_INTERNAL_KEY']
const REDACTED_VALUE = '[redacted]'
const SENSITIVE_KEY_PARTS = [
  'apikey',
  'privatekey',
  'encodedprivatekey',
  'encryptedprivatekey',
  'password',
  'secret',
  'signature',
  'token',
]

function isSensitiveLogKey(key) {
  const normalizedKey = String(key)
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
  return (
    normalizedKey === 'key' ||
    SENSITIVE_KEY_PARTS.some((part) => normalizedKey.includes(part))
  )
}

function isSensitiveActionType(type) {
  const normalizedType = String(type || '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()

  return SENSITIVE_KEY_PARTS.some((part) => normalizedType.includes(part))
}

export function redactLogValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[circular]'
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, seen))
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    acc[key] = isSensitiveLogKey(key)
      ? REDACTED_VALUE
      : redactLogValue(item, seen)
    return acc
  }, {})
}

export function redactLogAction(action) {
  if (!action || typeof action !== 'object') {
    return action
  }

  const redactedAction = redactLogValue(action)
  if (
    EXPLICIT_REDACTIONS.includes(action.type) ||
    isSensitiveActionType(action.type)
  ) {
    for (const key of ['data', 'value', 'payload']) {
      if (Object.prototype.hasOwnProperty.call(redactedAction, key)) {
        redactedAction[key] = REDACTED_VALUE
      }
    }
  }

  return redactedAction
}

// TODO: pass log fn default to console.log
export default function useLogger([state, dispatch]) {
  const actionRef = React.useRef()

  const newDispatchRef = React.useRef((action) => {
    actionRef.current = action
    dispatch(action)
  })

  React.useEffect(() => {
    const action = actionRef.current

    if (action) {
      const plainAction =
        typeof action === 'string' ? action : redactLogAction(action)
      const plainState = redactLogValue(state)

      console.group('DISPATCH')
      console.log('Action:', plainAction)
      console.log('State:', plainState)
      console.groupEnd()
    }
  }, [state])

  return [state, newDispatchRef.current]
}
