import { test, expect } from '../fixtures/multi-user'

test.describe('Kick', () => {
  test('host can kick a participant', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Verify both are in the room
    await alice.expectParticipantCount(2)
    await bob.expectParticipantCount(2)

    // Alice (host) kicks Bob
    await alice.kickParticipant('Bob')

    // Bob should see kicked message
    await bob.expectKicked()

    // Alice should only see herself
    await alice.expectParticipantCount(1)
  })

  test('non-host cannot see kick button', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Bob should not see any kick buttons
    const bobKickButtons = bob.page.locator('.kick-btn')
    await expect(bobKickButtons).toHaveCount(0)

    // Alice should see kick button for Bob (on hover)
    const aliceCard = alice.page.locator('.flex.flex-col.items-center.relative.group', { hasText: 'Bob' })
    await aliceCard.hover()
    await expect(aliceCard.locator('.kick-btn')).toBeVisible()
  })

  test('host cannot kick themselves', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice's own card should not have a kick button
    const aliceOwnCard = alice.page.locator('.flex.flex-col.items-center.relative.group', { hasText: 'Alice (you)' })
    await aliceOwnCard.hover()
    await expect(aliceOwnCard.locator('.kick-btn')).toHaveCount(0)
  })

  test('kicked user is removed from all participants views', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // All see 3 participants
    await alice.expectParticipantCount(3)
    await charlie.expectParticipantCount(3)

    // Alice kicks Bob
    await alice.kickParticipant('Bob')

    // Alice and Charlie should now see only 2 participants
    await alice.expectParticipantCount(2)
    await charlie.expectParticipantCount(2)

    // Bob should see kicked message
    await bob.expectKicked()
  })

  test('kicked user vote is removed before reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Bob votes
    await bob.vote('5')
    await alice.expectVoteHidden('Bob')

    // Alice kicks Bob before voting herself
    await alice.kickParticipant('Bob')

    // Now Alice votes alone - should auto-reveal with just her vote
    await alice.vote('8')
    await alice.expectRevealed()
    await alice.expectVoteValue('Alice', '8')
  })
})
