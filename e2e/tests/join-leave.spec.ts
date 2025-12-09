import { test, expect } from '../fixtures/multi-user'

test.describe('Join and Leave Room', () => {
  test('user creates room and sees themselves as only participant', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    await alice.expectParticipantCount(1)
    await alice.expectParticipants(['Alice'])
    await alice.expectIsHost()
    await alice.expectRoundNumber(1)
  })

  test('second user joins via URL and both see each other', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Both should see both participants
    await alice.expectParticipantCount(2)
    await alice.expectParticipants(['Alice', 'Bob'])

    await bob.expectParticipantCount(2)
    await bob.expectParticipants(['Alice', 'Bob'])

    // Alice should still be host
    await alice.expectIsHost()
    await bob.expectIsNotHost()
  })

  test('three users join room', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // All three should see all three participants
    for (const user of [alice, bob, charlie]) {
      await user.expectParticipantCount(3)
      await user.expectParticipants(['Alice', 'Bob', 'Charlie'])
    }
  })

  test('user leaves via button and others see them removed', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.expectParticipantCount(2)

    // Bob explicitly leaves via the leave button
    await bob.leaveRoom()

    // Give time for leave message to propagate
    await alice.page.waitForTimeout(500)

    // Alice should now see only herself
    await alice.expectParticipantCount(1)
    await alice.expectParticipants(['Alice'])
  })

  test('user stays in room after disconnect (browser close)', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.expectParticipantCount(2)

    // Bob disconnects (browser close, network drop, etc.) without explicitly leaving
    await bob.disconnect()

    // Give time for WebSocket close
    await alice.page.waitForTimeout(500)

    // Alice should still see Bob - they didn't explicitly leave
    await alice.expectParticipantCount(2)
    await alice.expectParticipants(['Alice', 'Bob'])
  })

  test('user reconnects with same identity', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Get Bob's initial emoji (shown next to name)
    const bobCard = alice.page.locator('.flex.flex-col.items-center', { hasText: 'Bob' })
    const initialEmoji = await bobCard.locator('.text-lg').textContent()

    await alice.expectParticipantCount(2)

    // Bob disconnects and reconnects
    await bob.disconnect()
    await alice.page.waitForTimeout(300)

    await bob.reconnect()
    await bob.joinRoom()

    await alice.expectParticipantCount(2)

    // Bob should have same emoji
    const reconnectedEmoji = await bobCard.locator('.text-lg').textContent()
    expect(reconnectedEmoji).toBe(initialEmoji)
  })

  test('user can join with custom name', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom('CustomName')

    await alice.expectParticipants(['Alice', 'CustomName'])
  })

  test('user rejoins after explicit leave with same identity', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Get Bob's initial emoji
    const bobCard = alice.page.locator('.flex.flex-col.items-center', { hasText: 'Bob' })
    const initialEmoji = await bobCard.locator('.text-lg').textContent()

    await alice.expectParticipantCount(2)

    // Bob explicitly leaves via button
    await bob.leaveRoom()
    await alice.page.waitForTimeout(300)

    // Alice should see Bob gone
    await alice.expectParticipantCount(1)

    // Bob rejoins the same room
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Both should see both participants again
    await alice.expectParticipantCount(2)
    await bob.expectParticipantCount(2)

    // Bob should have the same emoji (identity preserved)
    const rejoinedEmoji = await bobCard.locator('.text-lg').textContent()
    expect(rejoinedEmoji).toBe(initialEmoji)
  })

  test('system message appears when user joins', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice should see a system message about Bob joining
    const chatArea = alice.page.locator('#chat-messages')
    await expect(chatArea.locator('text=Bob')).toBeVisible()
    // The message should contain Bob's name in bold (from the markdown)
    await expect(chatArea.locator('strong', { hasText: 'Bob' })).toBeVisible()
  })

  test('system message appears when user leaves', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.expectParticipantCount(2)

    // Bob leaves
    await bob.leaveRoom()
    await alice.page.waitForTimeout(300)

    // Alice should see a system message about Bob leaving
    const chatArea = alice.page.locator('#chat-messages')
    // The message should contain Bob's name in bold
    // There will be both join and leave messages, we check for the presence of the name
    const strongBobs = chatArea.locator('strong', { hasText: 'Bob' })
    // Should have at least 2 (one for join, one for leave)
    await expect(strongBobs).toHaveCount(2)
  })
})
