// E2E Encryption utilities using Web Crypto API
// Key is stored in URL fragment (never sent to server)

const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256

// Generate a random encryption key and return as base64url
export async function generateRoomKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable
    ['encrypt', 'decrypt']
  )
  const exported = await crypto.subtle.exportKey('raw', key)
  return arrayBufferToBase64Url(exported)
}

// Import a base64url key string into a CryptoKey
async function importKey(keyString: string): Promise<CryptoKey> {
  const keyData = base64UrlToArrayBuffer(keyString)
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

// Encrypt a string, returns base64url encoded ciphertext with IV prepended
export async function encrypt(plaintext: string, keyString: string): Promise<string> {
  const key = await importKey(keyString)
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  )

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return arrayBufferToBase64Url(combined.buffer)
}

// Decrypt a base64url encoded ciphertext (with IV prepended)
export async function decrypt(ciphertext: string, keyString: string): Promise<string> {
  try {
    const key = await importKey(keyString)
    const combined = base64UrlToArrayBuffer(ciphertext)
    const combinedArray = new Uint8Array(combined)

    // Extract IV (first 12 bytes) and ciphertext
    const iv = combinedArray.slice(0, 12)
    const encryptedData = combinedArray.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      encryptedData
    )

    return new TextDecoder().decode(decrypted)
  } catch {
    // Decryption failed - return placeholder
    return '[encrypted]'
  }
}

// Check if a string looks like encrypted data (base64url, reasonable length)
export function isEncrypted(text: string): boolean {
  // Encrypted data will be base64url and at least IV (12 bytes) + some ciphertext
  // Base64 of 12+ bytes = 16+ chars minimum
  if (text.length < 20) return false
  // Check if it's valid base64url (alphanumeric, -, _)
  return /^[A-Za-z0-9_-]+$/.test(text)
}

// Base64url encoding/decoding (URL-safe, no padding)
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  // Add padding if needed
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// Get encryption key from URL fragment, or null if not present
export function getKeyFromUrl(): string | null {
  const hash = window.location.hash
  if (!hash || hash.length < 2) return null
  return hash.slice(1) // Remove the '#'
}

// Set encryption key in URL fragment (doesn't trigger navigation)
export function setKeyInUrl(key: string): void {
  const newUrl = `${window.location.pathname}${window.location.search}#${key}`
  window.history.replaceState(null, '', newUrl)
}
