export function loadPersistentState(dbName) {
  try {
    const item = localStorage.getItem(dbName)
    if (item) {
      return JSON.parse(item)
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
    localStorage.setItem(name, JSON.stringify(state))
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
