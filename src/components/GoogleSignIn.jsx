import { useEffect, useRef, useState } from 'react'

let googleIdentity
let renderedClientId
let handleCredential

function loadGoogleIdentity() {
  if (!googleIdentity) {
    googleIdentity = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client?hl=ko'
      script.async = true
      script.onload = () => {
        const identity = window.google?.accounts?.id
        if (identity) resolve(identity)
        else reject(new Error('Google Identity unavailable'))
      }
      script.onerror = reject
      document.head.appendChild(script)
    })
  }
  return googleIdentity
}

export default function GoogleSignIn({ clientId, onCredential }) {
  const button = useRef(null)
  const [availability, setAvailability] = useState('loading')

  useEffect(() => {
    let active = true
    const container = button.current
    handleCredential = onCredential
    loadGoogleIdentity().then((identity) => {
      if (!active) return
      if (renderedClientId !== clientId) {
        identity.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: ({ credential }) => handleCredential?.(credential),
        })
        renderedClientId = clientId
      }
      identity.renderButton(container, { theme: 'filled_black', size: 'large', locale: 'ko' })
      setAvailability('ready')
    }).catch(() => {
      if (active) setAvailability('unavailable')
    })
    return () => {
      active = false
      handleCredential = undefined
      container.replaceChildren()
    }
  }, [clientId, onCredential])

  return (
    <>
      <div ref={button} />
      {availability === 'loading' && <p role="status">Google 로그인 연결 중</p>}
      {availability === 'unavailable' && <p role="alert">Google 로그인을 불러오지 못했어요. 새로고침해 주세요.</p>}
    </>
  )
}
