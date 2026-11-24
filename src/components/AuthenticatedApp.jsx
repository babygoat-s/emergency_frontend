import { useCallback, useRef, useState } from 'react'
import App from '../App.jsx'
import { verifySession } from '../api/analysis.js'
import { setAuthToken } from '../api/session.js'
import GoogleSignIn from './GoogleSignIn.jsx'

const clientId = import.meta.env?.GOOGLE_CLIENT_ID

export default function AuthenticatedApp() {
  const [signedIn, setSignedIn] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef(null)
  const signIn = useCallback(async (credential) => {
    if (!credential) return
    attempt.current?.abort()
    const pending = new AbortController()
    attempt.current = pending
    setError('')
    setChecking(true)
    try {
      await verifySession(credential, pending.signal)
      if (pending.signal.aborted) return
      setAuthToken(credential)
      setSignedIn(true)
    } catch (error) {
      if (!pending.signal.aborted) setError(error.message)
    } finally {
      if (!pending.signal.aborted) setChecking(false)
    }
  }, [])

  if (!clientId) return <App />
  if (signedIn) {
    return <App onSignOut={() => {
      setAuthToken('')
      window.google?.accounts?.id?.disableAutoSelect()
      setSignedIn(false)
    }} />
  }
  return (
    <main className="signin-page">
      <section className="signin-panel" aria-labelledby="signin-title">
        <h1 id="signin-title">119 신고 분석</h1>
        <p>Google 계정으로 로그인하세요.</p>
        <GoogleSignIn clientId={clientId} onCredential={signIn} />
        {checking && <p role="status">백엔드에서 접근 권한을 확인하고 있어요.</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  )
}
