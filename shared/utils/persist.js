let volatileSettingsState

function sanitizeSettingsState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {changed: false, state}
  }

  const {apiKey, apiKeyData, secondaryNodes, ...sanitized} = state
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(state, key)
  const changed =
    apiKey !== undefined ||
    apiKeyData !== undefined ||
    secondaryNodes !== undefined ||
    hasOwn('apiKey') ||
    hasOwn('apiKeyData') ||
    hasOwn('secondaryNodes')

  if (secondaryNodes !== undefined || hasOwn('secondaryNodes')) {
    sanitized.useSecondary = false
  }

  return {changed, state: sanitized}
}

export function stateForPersistence(name, state) {
  if (name !== 'settings') return state
  return sanitizeSettingsState(state).state
}

export function loadPersistentState(dbName) {
  try {
    if (
      dbName === 'settings' &&
      volatileSettingsState !== undefined &&
      volatileSettingsState !== null
    ) {
      return volatileSettingsState
    }

    const item = localStorage.getItem(dbName)
    if (item) {
      const parsed = JSON.parse(item)
      if (dbName === 'settings') {
        const sanitized = sanitizeSettingsState(parsed)
        if (sanitized.changed) {
          const legacyProvider = parsed.apiKeyData?.provider
          volatileSettingsState = {
            ...parsed,
            ...(typeof legacyProvider === 'string' && !parsed.nodeProviderId
              ? {nodeProviderId: legacyProvider}
              : {}),
          }
          // Remove the legacy value first so a failed rewrite cannot retain keys.
          localStorage.removeItem(dbName)
          localStorage.setItem(dbName, JSON.stringify(sanitized.state))
          return volatileSettingsState
        }
        volatileSettingsState = sanitized.state
        return volatileSettingsState
      }
      return parsed
    }
    return null
  } catch (error) {
    return null
  }
}

export function loadPersistentStateValue(dbName, key) {
  if (typeof key === 'undefined') {
    throw new Error('loadItem requires key to be passed')
  }
  const state = loadPersistentState(dbName)
  if (state === null) {
    return null
  }
  return state[key]
}

export function persistItem(dbName, key, value) {
  try {
    let s = loadPersistentState(dbName)
    if (s === null) {
      s = {}
    }
    s[key] = value
    persistState(dbName, s, key)
  } catch {
    console.error(
      'error writing persistent item:',
      storageLogContext(dbName, key)
    )
  }
}

export function persistState(name, state, key) {
  try {
    if (name === 'settings') {
      volatileSettingsState = state
    }
    localStorage.setItem(name, JSON.stringify(stateForPersistence(name, state)))
  } catch {
    console.error(
      'error writing persistent state:',
      storageLogContext(name, key)
    )
  }
}

function storageLogContext(name, key) {
  return {
    name,
    ...(typeof key === 'undefined' ? {} : {key}),
  }
}

/**
 * Checks if action or action list has the name passed
 * @param {(string|string[])} actionList
 * @param {string} action
 */
export function shouldPersist(actionList, action) {
  if (!actionList || actionList.length === 0) {
    return true
  }
  const actionName = Array.isArray(action) ? action[0] : action.type
  return Array.isArray(actionList)
    ? actionList.includes(actionName)
    : actionList === actionName
}
