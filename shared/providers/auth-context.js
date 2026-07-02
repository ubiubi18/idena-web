/* eslint-disable react/display-name */
import {createContext, useCallback, useContext, useMemo, useState} from 'react'
import {
  decryptPrivateKey,
  encryptPrivateKey,
  privateKeyToAddress,
} from '../utils/crypto'
import {useSettingsDispatch, useSettingsState} from './settings-context'

const AuthStateContext = createContext()
const AuthDispatchContext = createContext()

const initialState = {
  auth: false,
  privateKey: null,
  coinbase: null,
}
// eslint-disable-next-line react/prop-types
function AuthProvider({children}) {
  const [state, setState] = useState(initialState)

  const {encryptedKey} = useSettingsState()
  const {saveEncryptedKey, removeEncryptedKey} = useSettingsDispatch()

  const setNewKey = useCallback(
    (key, pass, persist) => {
      const privateKey = decryptPrivateKey(key, pass)
      const coinbase = privateKeyToAddress(privateKey)
      if (persist) {
        saveEncryptedKey(coinbase, key)
      }
      setState({
        auth: true,
        privateKey,
        coinbase,
      })
    },
    [saveEncryptedKey]
  )

  const decryptKey = useCallback((key, pass) => {
    try {
      return decryptPrivateKey(key, pass)
    } catch (e) {
      return null
    }
  }, [])

  const removeKey = useCallback(() => {
    removeEncryptedKey()
    setState(initialState)
  }, [removeEncryptedKey])

  const logout = useCallback(() => {
    setState(initialState)
  }, [])

  const login = useCallback(
    (pass) => {
      const privateKey = decryptPrivateKey(encryptedKey, pass)
      const coinbase = privateKeyToAddress(privateKey)
      setState({
        auth: true,
        privateKey,
        coinbase,
      })
    },
    [encryptedKey]
  )

  const exportKey = useCallback(
    (pass) => encryptPrivateKey(state.privateKey, pass),
    [state.privateKey]
  )

  const dispatch = useMemo(
    () => ({
      setNewKey,
      decryptKey,
      logout,
      login,
      exportKey,
      removeKey,
    }),
    [decryptKey, exportKey, login, logout, removeKey, setNewKey]
  )

  return (
    <AuthStateContext.Provider value={state}>
      <AuthDispatchContext.Provider value={dispatch}>
        {children}
      </AuthDispatchContext.Provider>
    </AuthStateContext.Provider>
  )
}

function useAuthState() {
  const context = useContext(AuthStateContext)
  if (context === undefined) {
    throw new Error('useAuthState must be used within a AuthStateProvider')
  }
  return context
}

function useAuthDispatch() {
  const context = useContext(AuthDispatchContext)
  if (context === undefined) {
    throw new Error('useAuthDispatch must be used within a AuthDispatchContext')
  }
  return context
}

export {AuthProvider, useAuthState, useAuthDispatch}
