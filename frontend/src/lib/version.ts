// Version checking for update notifications
const CURRENT_VERSION = __APP_VERSION__
const CHECK_INTERVAL = 5 * 60 * 1000 // Check every 5 minutes

let updateAvailable = false
let checkInterval: ReturnType<typeof setInterval> | null = null

export function isUpdateAvailable(): boolean {
  return updateAvailable
}

export async function checkForUpdate(): Promise<boolean> {
  try {
    // Fetch version.json with cache busting
    const response = await fetch(`/version.json?_=${Date.now()}`)
    if (!response.ok) return false

    const data = await response.json()
    if (data.version && data.version !== CURRENT_VERSION) {
      updateAvailable = true
      showUpdateNotification()
      return true
    }
  } catch {
    // Silently fail - network issues shouldn't break the app
  }
  return false
}

export function startVersionCheck(): void {
  // Check immediately
  checkForUpdate()

  // Then check periodically
  if (!checkInterval) {
    checkInterval = setInterval(checkForUpdate, CHECK_INTERVAL)
  }
}

export function stopVersionCheck(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
}

function showUpdateNotification(): void {
  // Don't show if already showing
  if (document.querySelector('#update-notification')) return

  const notification = document.createElement('div')
  notification.id = 'update-notification'
  notification.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-slide-up'
  notification.innerHTML = `
    <span class="text-lg">🆕</span>
    <span>A new version is available!</span>
    <button id="refresh-btn" class="bg-white text-indigo-600 px-3 py-1 rounded font-bold text-sm hover:bg-indigo-100 transition-colors">
      Refresh
    </button>
    <button id="dismiss-update-btn" class="text-indigo-200 hover:text-white ml-1" title="Dismiss">
      ✕
    </button>
  `

  document.body.appendChild(notification)

  document.querySelector('#refresh-btn')?.addEventListener('click', () => {
    window.location.reload()
  })

  document.querySelector('#dismiss-update-btn')?.addEventListener('click', () => {
    notification.remove()
  })
}
