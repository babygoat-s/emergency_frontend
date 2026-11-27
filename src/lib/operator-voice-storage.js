import { isOperatorVoiceSample } from '../audio/operator-voice.js'

const STORE = 'samples'

function withSampleStore(mode, action) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('emergency-operator-voice', 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      try {
        const transaction = db.transaction(STORE, mode)
        const request = action(transaction.objectStore(STORE))
        transaction.oncomplete = () => {
          db.close()
          resolve(request.result)
        }
        transaction.onabort = () => {
          db.close()
          reject(transaction.error)
        }
      } catch (error) {
        db.close()
        reject(error)
      }
    }
  })
}

export async function loadOperatorVoice(scope) {
  const sample = await withSampleStore('readonly', (store) => store.get(scope))
  return isOperatorVoiceSample(sample) ? sample : null
}

export function saveOperatorVoice(scope, sample) {
  return withSampleStore('readwrite', (store) => store.put(sample, scope))
}

export function removeOperatorVoice(scope) {
  return withSampleStore('readwrite', (store) => store.delete(scope))
}
