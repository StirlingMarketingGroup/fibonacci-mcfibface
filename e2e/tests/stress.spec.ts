import { test, expect } from '../fixtures/multi-user'

test.describe('Stress Tests', () => {
  test('five users join room rapidly', async ({ createUsers }) => {
    const users = await createUsers(5)
    const [alice, bob, charlie, diana, eve] = users

    const roomUrl = await alice.createRoom()

    // All others join in parallel
    await Promise.all([
      (async () => {
        await bob.goto(roomUrl)
        await bob.joinRoom()
      })(),
      (async () => {
        await charlie.goto(roomUrl)
        await charlie.joinRoom()
      })(),
      (async () => {
        await diana.goto(roomUrl)
        await diana.joinRoom()
      })(),
      (async () => {
        await eve.goto(roomUrl)
        await eve.joinRoom()
      })(),
    ])

    // Give time for all WebSocket messages to settle
    await alice.page.waitForTimeout(500)

    // All users should see all 5 participants
    for (const user of users) {
      await user.expectParticipantCount(5)
    }
  })

  test('multiple users vote simultaneously', async ({ createUsers }) => {
    const users = await createUsers(5)
    const [alice, bob, charlie, diana, eve] = users

    const roomUrl = await alice.createRoom()

    // All join
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()
    await diana.goto(roomUrl)
    await diana.joinRoom()
    await eve.goto(roomUrl)
    await eve.joinRoom()

    // All vote at the same time
    await Promise.all([
      alice.vote('1'),
      bob.vote('2'),
      charlie.vote('3'),
      diana.vote('5'),
      eve.vote('8'),
    ])

    // All should see reveal
    await alice.page.waitForTimeout(500)

    for (const user of users) {
      await user.expectRevealed()
    }

    // Verify all votes are correct
    await alice.expectVoteValue('Alice', '1')
    await alice.expectVoteValue('Bob', '2')
    await alice.expectVoteValue('Charlie', '3')
    await alice.expectVoteValue('Diana', '5')
    await alice.expectVoteValue('Eve', '8')
  })

  test('rapid vote changes before reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice rapidly changes votes
    await alice.vote('1')
    await alice.vote('2')
    await alice.vote('3')
    await alice.vote('5')
    await alice.vote('8')

    // Bob votes to trigger reveal
    await bob.vote('13')

    await alice.expectRevealed()

    // Alice's final vote should be 8
    await alice.expectVoteValue('Alice', '8')
    await bob.expectVoteValue('Alice', '8')
  })

  test('user disconnects during voting round', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Alice and Bob vote
    await alice.vote('5')
    await bob.vote('8')

    // Charlie disconnects without voting
    await charlie.disconnect()
    await alice.page.waitForTimeout(500)

    // Room should now have 2 participants
    await alice.expectParticipantCount(2)

    // Note: Auto-reveal after disconnect is not implemented
    // The remaining participants still have their votes but reveal doesn't trigger
    // This is a known limitation - host would need to reset or wait for reconnect
    await alice.expectNotRevealed()
    await alice.expectVoteHidden('Alice')
    await alice.expectVoteHidden('Bob')
  })

  test('user reconnects and continues voting', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Bob disconnects
    await bob.disconnect()
    await alice.page.waitForTimeout(300)

    // Bob reconnects
    await bob.reconnect()
    await bob.joinRoom()

    // Both should be back
    await alice.expectParticipantCount(2)
    await bob.expectParticipantCount(2)

    // Can still vote
    await alice.vote('5')
    await bob.vote('8')

    await alice.expectRevealed()
  })

  test('rapid chat messages from multiple users', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // All send messages rapidly
    await Promise.all([
      alice.sendChat('Message 1 from Alice'),
      bob.sendChat('Message 1 from Bob'),
      charlie.sendChat('Message 1 from Charlie'),
    ])

    await Promise.all([
      alice.sendChat('Message 2 from Alice'),
      bob.sendChat('Message 2 from Bob'),
      charlie.sendChat('Message 2 from Charlie'),
    ])

    // Give time for messages to propagate
    await alice.page.waitForTimeout(500)

    // All messages should be visible
    for (const user of [alice, bob, charlie]) {
      await user.expectChatMessage('Alice', 'Message 1 from Alice')
      await user.expectChatMessage('Bob', 'Message 1 from Bob')
      await user.expectChatMessage('Charlie', 'Message 1 from Charlie')
      await user.expectChatMessage('Alice', 'Message 2 from Alice')
      await user.expectChatMessage('Bob', 'Message 2 from Bob')
      await user.expectChatMessage('Charlie', 'Message 2 from Charlie')
    }
  })

  test('multiple rounds with same participants', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Run 5 rounds
    for (let round = 1; round <= 5; round++) {
      await alice.expectRoundNumber(round)

      // All vote
      await alice.vote('5')
      await bob.vote('8')
      await charlie.vote('13')

      await alice.expectRevealed()

      // Verify votes
      await alice.expectVoteValue('Alice', '5')
      await alice.expectVoteValue('Bob', '8')
      await alice.expectVoteValue('Charlie', '13')

      // Reset for next round (except last)
      if (round < 5) {
        await alice.resetRound()
      }
    }

    await alice.expectRoundNumber(5)
  })

  test('user joins mid-round and can vote', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice and Bob start voting
    await alice.vote('5')

    // Charlie joins mid-round
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Charlie should see Alice has voted
    await charlie.expectVoteHidden('Alice')
    await charlie.expectNoVote('Bob')
    await charlie.expectNoVote('Charlie')

    // Charlie and Bob vote
    await bob.vote('8')
    await charlie.vote('13')

    // All should see reveal
    await alice.expectRevealed()
    await bob.expectRevealed()
    await charlie.expectRevealed()
  })

  test('all users disconnect except one', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    await alice.expectParticipantCount(3)

    // Bob and Charlie leave
    await bob.disconnect()
    await charlie.disconnect()
    await alice.page.waitForTimeout(500)

    // Alice should be alone and still host
    await alice.expectParticipantCount(1)
    await alice.expectIsHost()

    // Alice can still vote (single user reveal)
    await alice.vote('5')
    await alice.expectRevealed()
  })

  test('six users full workflow', async ({ createUsers }) => {
    const users = await createUsers(6)
    const [alice, bob, charlie, diana, eve, frank] = users

    // Alice creates room
    const roomUrl = await alice.createRoom()

    // Everyone joins
    for (const user of [bob, charlie, diana, eve, frank]) {
      await user.goto(roomUrl)
      await user.joinRoom()
    }

    // Verify all present
    for (const user of users) {
      await user.expectParticipantCount(6)
    }

    // All vote different values
    const votes = ['1', '2', '3', '5', '8', '13']
    await Promise.all(users.map((user, i) => user.vote(votes[i])))

    // All see reveal
    await alice.page.waitForTimeout(500)
    for (const user of users) {
      await user.expectRevealed()
    }

    // Verify stats make sense
    // Votes: 1, 2, 3, 5, 8, 13
    // Average: 32/6 = 5.33...
    // We just check that stats section appears
    await expect(alice.page.locator('text=Average')).toBeVisible()
    await expect(alice.page.locator('text=Median')).toBeVisible()
    await expect(alice.page.locator('text=Spread')).toBeVisible()

    // Chat works
    await alice.sendChat('Great estimation session!')
    for (const user of users) {
      await user.expectChatMessage('Alice', 'Great estimation session!')
    }

    // Reset and go again
    await alice.resetRound()
    for (const user of users) {
      await user.expectRoundNumber(2)
      await user.expectNotRevealed()
    }
  })
})
