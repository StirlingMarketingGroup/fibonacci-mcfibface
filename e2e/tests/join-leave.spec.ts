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

  test('user leaves and others see them removed', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.expectParticipantCount(2)

    // Bob leaves
    await bob.disconnect()

    // Give time for WebSocket close to propagate
    await alice.page.waitForTimeout(500)

    // Alice should now see only herself
    await alice.expectParticipantCount(1)
    await alice.expectParticipants(['Alice'])
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

  test('host leaves and next user becomes host', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice is host
    await alice.expectIsHost()
    await bob.expectIsNotHost()

    // Alice leaves
    await alice.disconnect()

    // Give time for host transfer
    await bob.page.waitForTimeout(500)

    // Bob should now be host
    await bob.expectIsHost()
  })

  test('last user leaves and rejoins as host', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    const roomUrl = await alice.createRoom()

    await alice.expectIsHost()

    // Alice disconnects and reconnects
    await alice.disconnect()
    await alice.reconnect()
    await alice.joinRoom()

    // Alice should still be host (or become host again as only participant)
    await alice.expectIsHost()
  })

  test('user can join with custom name', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom('CustomName')

    await alice.expectParticipants(['Alice', 'CustomName'])
  })
})
