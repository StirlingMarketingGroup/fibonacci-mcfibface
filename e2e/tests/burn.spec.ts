import { test, expect } from '../fixtures/multi-user'

test.describe('Burn Room', () => {
  test('host can burn room and all users see deleted page', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Verify both are in the room
    await alice.expectParticipantCount(2)
    await bob.expectParticipantCount(2)

    // Alice (host) burns the room - need to handle confirm dialog
    alice.page.on('dialog', dialog => dialog.accept())
    await alice.page.click('#burn-btn')

    // Both should see the burned room page
    await expect(alice.page.locator('text=This room has been deleted')).toBeVisible({ timeout: 5000 })
    await expect(bob.page.locator('text=This room has been deleted')).toBeVisible({ timeout: 5000 })

    // Both should see the fire emoji
    await expect(alice.page.locator('text=🔥')).toBeVisible()
    await expect(bob.page.locator('text=🔥')).toBeVisible()

    // Both should have Create New Room button
    await expect(alice.page.locator('text=Create New Room')).toBeVisible()
    await expect(bob.page.locator('text=Create New Room')).toBeVisible()
  })

  test('non-host cannot see burn button', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice (host) should see burn button
    await expect(alice.page.locator('#burn-btn')).toBeVisible()

    // Bob (non-host) should not see burn button
    await expect(bob.page.locator('#burn-btn')).toHaveCount(0)
  })

  test('burned room state is cleared', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Send some chat messages
    await alice.sendChat('Hello before burn')
    await bob.sendChat('Goodbye')

    // Burn the room
    alice.page.on('dialog', dialog => dialog.accept())
    await alice.page.click('#burn-btn')

    await expect(alice.page.locator('text=This room has been deleted')).toBeVisible({ timeout: 5000 })

    // If someone tries to join the same room again, it should be empty/fresh
    const [charlie] = await createUsers(1)
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Charlie should be in a fresh room with no chat history
    const chatMessages = charlie.page.locator('#chat-messages .text-sm')
    await expect(chatMessages).toHaveCount(0)

    // Charlie should be alone (and the host of this new room)
    await charlie.expectParticipantCount(1)
  })
})
