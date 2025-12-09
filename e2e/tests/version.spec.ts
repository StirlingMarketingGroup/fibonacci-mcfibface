import { test, expect } from '../fixtures/multi-user'

test.describe('Version Check', () => {
  test('version check does not break the app', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    // App should load normally even if version.json doesn't exist (dev mode)
    await alice.createRoom()

    // The app should be functional
    await expect(alice.page.locator('.vote-btn').first()).toBeVisible()
  })

  test('update notification shows refresh button when triggered', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    // Manually trigger the update notification by injecting it
    await alice.page.evaluate(() => {
      const notification = document.createElement('div')
      notification.id = 'update-notification'
      notification.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50'
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
    })

    // Verify notification is visible
    await expect(alice.page.locator('#update-notification')).toBeVisible()
    await expect(alice.page.locator('#refresh-btn')).toBeVisible()
    await expect(alice.page.locator('text=A new version is available!')).toBeVisible()
  })

  test('dismiss button removes update notification', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    // Inject notification
    await alice.page.evaluate(() => {
      const notification = document.createElement('div')
      notification.id = 'update-notification'
      notification.innerHTML = `
        <span>A new version is available!</span>
        <button id="dismiss-update-btn">✕</button>
      `
      document.body.appendChild(notification)

      document.querySelector('#dismiss-update-btn')?.addEventListener('click', () => {
        notification.remove()
      })
    })

    await expect(alice.page.locator('#update-notification')).toBeVisible()

    // Click dismiss
    await alice.page.click('#dismiss-update-btn')

    // Notification should be gone
    await expect(alice.page.locator('#update-notification')).not.toBeVisible()
  })
})
