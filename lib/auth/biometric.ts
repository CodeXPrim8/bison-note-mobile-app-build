/**
 * Face ID / fingerprint convenience unlock for the Capacitor app.
 * Never replaces server PIN checks. Soft-fails to PIN on any error.
 */

export const BIOMETRIC_PREF_KEY = 'bu_face_unlock_enabled'
export const BIOMETRIC_SERVER = 'getbucks.com.ng.auth'
const BIOMETRIC_UNLOCKED_KEY = 'bu_face_session_unlocked'

export type BiometricKind = 'face' | 'fingerprint' | 'multiple' | 'none'

export type BiometricAvailability = {
  available: boolean
  kind: BiometricKind
  label: string
  native: boolean
  reason?: string
}

function isBrowser() {
  return typeof window !== 'undefined'
}

export function isFaceUnlockPreferred() {
  if (!isBrowser()) return false
  try {
    return window.localStorage.getItem(BIOMETRIC_PREF_KEY) === '1'
  } catch {
    return false
  }
}

export function setFaceUnlockPreferred(enabled: boolean) {
  if (!isBrowser()) return
  try {
    if (enabled) window.localStorage.setItem(BIOMETRIC_PREF_KEY, '1')
    else window.localStorage.removeItem(BIOMETRIC_PREF_KEY)
  } catch {
    // ignore quota / private mode
  }
}

export function markAppUnlocked() {
  if (!isBrowser()) return
  try {
    window.sessionStorage.setItem(BIOMETRIC_UNLOCKED_KEY, '1')
  } catch {
    // ignore
  }
}

export function clearAppUnlocked() {
  if (!isBrowser()) return
  try {
    window.sessionStorage.removeItem(BIOMETRIC_UNLOCKED_KEY)
  } catch {
    // ignore
  }
}

export function isAppUnlocked() {
  if (!isBrowser()) return true
  try {
    return window.sessionStorage.getItem(BIOMETRIC_UNLOCKED_KEY) === '1'
  } catch {
    return true
  }
}

async function loadPlugin() {
  try {
    const core = await import('@capacitor/core')
    if (!core.Capacitor.isNativePlatform()) return null
    const mod = await import('@capgo/capacitor-native-biometric')
    return mod
  } catch {
    return null
  }
}

function kindFromType(biometryType: number | undefined): BiometricKind {
  switch (biometryType) {
    case 2: // FACE_ID
    case 4: // FACE_AUTHENTICATION
      return 'face'
    case 1: // TOUCH_ID
    case 3: // FINGERPRINT
      return 'fingerprint'
    case 6: // MULTIPLE
      return 'multiple'
    default:
      return 'none'
  }
}

function labelFor(kind: BiometricKind) {
  if (kind === 'face') return 'Face unlock'
  if (kind === 'fingerprint') return 'Fingerprint'
  if (kind === 'multiple') return 'Biometrics'
  return 'Biometrics'
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const plugin = await loadPlugin()
  if (!plugin) {
    return {
      available: false,
      kind: 'none',
      label: 'Face unlock',
      native: false,
      reason: 'Face unlock works in the Bucks phone app.',
    }
  }

  try {
    const result = await plugin.NativeBiometric.isAvailable({
      useFallback: true,
      // Prefer reporting face+finger when both exist so Android face unlock is not hidden.
      preferMultipleBiometryType: true,
    })
    const kind = kindFromType(result.biometryType)
    if (!result.isAvailable) {
      return {
        available: false,
        kind,
        label: labelFor(kind === 'none' ? 'face' : kind),
        native: true,
        reason: 'Turn on Face ID / face unlock or fingerprint in your phone settings first.',
      }
    }
    return {
      available: true,
      kind: kind === 'none' ? 'face' : kind,
      label: labelFor(kind === 'none' ? 'face' : kind),
      native: true,
    }
  } catch {
    return {
      available: false,
      kind: 'none',
      label: 'Face unlock',
      native: true,
      reason: 'Biometrics are unavailable on this device right now.',
    }
  }
}

export async function verifyBiometric(reason = 'Unlock Ƀucks'): Promise<{ ok: boolean; cancelled?: boolean; message?: string }> {
  const plugin = await loadPlugin()
  if (!plugin) return { ok: false, message: 'Face unlock is only available in the Bucks app.' }

  try {
    await plugin.NativeBiometric.verifyIdentity({
      reason,
      title: 'Ƀucks',
      subtitle: reason,
      description: 'Confirm it is you',
      negativeButtonText: 'Use PIN',
      // iOS: allow device passcode if Face ID fails / is temporarily unavailable
      useFallback: true,
      fallbackTitle: 'Use Passcode',
      // Android: more attempts so a single miss does not hard-fail
      maxAttempts: 5,
      // Do NOT filter biometry types — Android face unlock is often "weak"
    })
    return { ok: true }
  } catch (error) {
    const code = String((error as { code?: string })?.code || '')
    const message = String((error as { message?: string })?.message || '')
    const cancelled =
      /cancel|user.?cancel|negative|dismiss/i.test(code) ||
      /cancel|user.?cancel|negative|dismiss/i.test(message)
    return {
      ok: false,
      cancelled,
      message: cancelled ? undefined : 'Face unlock did not complete. Use your PIN.',
    }
  }
}

export async function saveBiometricCredentials(phone: string, pin: string): Promise<{ ok: boolean; message?: string }> {
  const plugin = await loadPlugin()
  if (!plugin) return { ok: false, message: 'Face unlock is only available in the Bucks app.' }

  const username = phone.trim()
  const password = pin.trim()
  if (!username || !/^\d{4,6}$/.test(password)) {
    return { ok: false, message: 'Enter a valid phone and PIN first.' }
  }

  try {
    // Prove biometrics work before storing.
    const verified = await verifyBiometric('Enable face unlock for Ƀucks')
    if (!verified.ok) {
      return {
        ok: false,
        message: verified.cancelled ? 'Face unlock was cancelled.' : verified.message || 'Could not verify your face.',
      }
    }

    await plugin.NativeBiometric.setCredentials({
      username,
      password,
      server: BIOMETRIC_SERVER,
      // Survive new fingerprint / face enrollments so unlock does not suddenly break
      accessControl: plugin.AccessControl.BIOMETRY_ANY,
      title: 'Protect Ƀucks unlock',
      negativeButtonText: 'Cancel',
      maxAttempts: 5,
    })
    setFaceUnlockPreferred(true)
    markAppUnlocked()
    return { ok: true }
  } catch {
    return { ok: false, message: 'Could not save face unlock. Your PIN still works.' }
  }
}

export async function clearBiometricCredentials(): Promise<void> {
  setFaceUnlockPreferred(false)
  clearAppUnlocked()
  const plugin = await loadPlugin()
  if (!plugin) return
  try {
    await plugin.NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER })
  } catch {
    // ignore — preference already cleared
  }
}

export async function loadBiometricCredentials(reason = 'Unlock Ƀucks'): Promise<
  | { ok: true; phone: string; pin: string }
  | { ok: false; cancelled?: boolean; message?: string }
> {
  if (!isFaceUnlockPreferred()) {
    return { ok: false, message: 'Face unlock is turned off.' }
  }

  const plugin = await loadPlugin()
  if (!plugin) return { ok: false, message: 'Face unlock is only available in the Bucks app.' }

  try {
    // getCredentials with BIOMETRY_ANY already prompts; verify first for clearer copy,
    // then read. If verify fails, soft-fail to PIN.
    const verified = await verifyBiometric(reason)
    if (!verified.ok) {
      return {
        ok: false,
        cancelled: verified.cancelled,
        message: verified.message,
      }
    }

    const creds = await plugin.NativeBiometric.getCredentials({ server: BIOMETRIC_SERVER })
    const phone = String(creds.username || '').trim()
    const pin = String(creds.password || '').trim()
    if (!phone || !/^\d{4,6}$/.test(pin)) {
      setFaceUnlockPreferred(false)
      return { ok: false, message: 'Saved unlock expired. Sign in with PIN once to turn face unlock back on.' }
    }
    markAppUnlocked()
    return { ok: true, phone, pin }
  } catch (error) {
    const message = String((error as { message?: string })?.message || '')
    const cancelled = /cancel|user.?cancel|negative|dismiss/i.test(message)
    return {
      ok: false,
      cancelled,
      message: cancelled ? undefined : 'Face unlock did not complete. Use your PIN.',
    }
  }
}
