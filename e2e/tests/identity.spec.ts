import { test, expect } from '../fixtures/multi-user'

test.describe('User Identity', () => {
  test('multiple users get unique emoji+color combinations', async ({ createUsers }) => {
    const [alice, bob, charlie, diana] = await createUsers(4)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    await diana.goto(roomUrl)
    await diana.joinRoom()

    // Wait for all participants to be visible
    await alice.expectParticipantCount(4)

    // Get all identities
    const identities = await Promise.all([
      alice.getIdentity(),
      bob.getIdentity(),
      charlie.getIdentity(),
      diana.getIdentity(),
    ])

    // Create identity keys (emoji|color)
    const identityKeys = identities.map(i => `${i.emoji}|${i.color}`)

    // Check all are unique
    const uniqueKeys = new Set(identityKeys)
    expect(uniqueKeys.size).toBe(4)
  })

  test('five users all have distinct identities', async ({ createUsers }) => {
    const users = await createUsers(5)
    const [alice, bob, charlie, diana, eve] = users

    const roomUrl = await alice.createRoom()

    for (const user of [bob, charlie, diana, eve]) {
      await user.goto(roomUrl)
      await user.joinRoom()
    }

    // Wait for all participants
    await alice.expectParticipantCount(5)

    // Get all identities
    const identities = await Promise.all(users.map(u => u.getIdentity()))
    const identityKeys = identities.map(i => `${i.emoji}|${i.color}`)

    // All should be unique
    const uniqueKeys = new Set(identityKeys)
    expect(uniqueKeys.size).toBe(5)
  })

  test('user who leaves and rejoins keeps same identity', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    const initialIdentity = await bob.getIdentity()

    // Bob leaves
    await bob.leaveRoom()
    await alice.page.waitForTimeout(300)

    // Bob rejoins
    await bob.goto(roomUrl)
    await bob.joinRoom()

    const rejoinedIdentity = await bob.getIdentity()

    // Identity should be preserved
    expect(rejoinedIdentity.emoji).toBe(initialIdentity.emoji)
    expect(rejoinedIdentity.color).toBe(initialIdentity.color)
  })

  test('new user joining gets different identity than existing users', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    const aliceIdentity = await alice.getIdentity()

    await bob.goto(roomUrl)
    await bob.joinRoom()

    const bobIdentity = await bob.getIdentity()

    // Bob should have different emoji+color combo than Alice
    const aliceKey = `${aliceIdentity.emoji}|${aliceIdentity.color}`
    const bobKey = `${bobIdentity.emoji}|${bobIdentity.color}`
    expect(bobKey).not.toBe(aliceKey)
  })
})
