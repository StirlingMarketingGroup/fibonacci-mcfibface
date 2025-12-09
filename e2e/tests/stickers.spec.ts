import { test, expect } from '../fixtures/multi-user'

test.describe('GIF Stickers', () => {
  test('sticker picker button is visible', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    const stickerBtn = alice.page.locator('#sticker-btn')
    await expect(stickerBtn).toBeVisible()
  })

  test('sticker picker opens and closes', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    const stickerBtn = alice.page.locator('#sticker-btn')
    const stickerPicker = alice.page.locator('#sticker-picker')

    // Initially hidden
    await expect(stickerPicker).toHaveClass(/hidden/)

    // Click to open
    await stickerBtn.click()
    await expect(stickerPicker).not.toHaveClass(/hidden/)

    // Click button again to close
    await stickerBtn.click()
    await expect(stickerPicker).toHaveClass(/hidden/)
  })

  test('sticker picker shows sticker options', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    await alice.page.click('#sticker-btn')

    const stickerOptions = alice.page.locator('.sticker-option')
    // We have 12 stickers defined
    await expect(stickerOptions).toHaveCount(12)
  })

  test('clicking sticker sends it to chat', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Open sticker picker and click first sticker
    await alice.page.click('#sticker-btn')
    await alice.page.click('.sticker-option:first-child')

    // Picker should close
    await expect(alice.page.locator('#sticker-picker')).toHaveClass(/hidden/)

    // Both users should see the sticker image in chat
    const chatArea = bob.page.locator('#chat-messages')
    await expect(chatArea.locator('img.chat-sticker')).toBeVisible({ timeout: 5000 })
  })

  test('sticker picker closes when clicking outside', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    await alice.page.click('#sticker-btn')
    await expect(alice.page.locator('#sticker-picker')).not.toHaveClass(/hidden/)

    // Click outside the picker
    await alice.page.click('main')

    await expect(alice.page.locator('#sticker-picker')).toHaveClass(/hidden/)
  })

  test('manual gif URL renders as sticker', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    // Send a raw GIF URL
    await alice.sendChat('https://media.giphy.com/media/wYyTHMm50f4Dm/giphy.gif')

    const chatArea = alice.page.locator('#chat-messages')
    await expect(chatArea.locator('img.chat-sticker')).toBeVisible()
  })
})
