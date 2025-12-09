import { test, expect } from '../fixtures/multi-user'

test.describe('Voting', () => {
  test('user casts vote and others see hidden indicator', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Initially no votes
    await alice.expectNoVote('Alice')
    await alice.expectNoVote('Bob')

    // Alice votes
    await alice.vote('5')

    // Alice sees her vote selected
    await alice.expectMyVoteSelected('5')

    // Bob sees Alice has voted (hidden)
    await bob.expectVoteHidden('Alice')
    await bob.expectNoVote('Bob')

    // Alice also sees her own vote as hidden (not revealed yet)
    await alice.expectVoteHidden('Alice')
  })

  test('user can change vote before reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice votes 5
    await alice.vote('5')
    await alice.expectMyVoteSelected('5')

    // Alice changes to 8
    await alice.vote('8')
    await alice.expectMyVoteSelected('8')

    // Still shows as voted
    await bob.expectVoteHidden('Alice')
  })

  test('auto-reveal when all users vote', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Not revealed yet
    await alice.expectNotRevealed()
    await bob.expectNotRevealed()

    // Alice votes
    await alice.vote('5')
    await alice.expectNotRevealed()

    // Bob votes - should trigger reveal
    await bob.vote('8')

    // Both should see reveal
    await alice.expectRevealed()
    await bob.expectRevealed()

    // Both should see actual vote values
    await alice.expectVoteValue('Alice', '5')
    await alice.expectVoteValue('Bob', '8')

    await bob.expectVoteValue('Alice', '5')
    await bob.expectVoteValue('Bob', '8')
  })

  test('three users vote and all see reveal', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    await alice.vote('3')
    await bob.vote('5')

    // Not revealed yet (Charlie hasn't voted)
    await alice.expectNotRevealed()

    await charlie.vote('8')

    // All revealed
    for (const user of [alice, bob, charlie]) {
      await user.expectRevealed()
      await user.expectVoteValue('Alice', '3')
      await user.expectVoteValue('Bob', '5')
      await user.expectVoteValue('Charlie', '8')
    }
  })

  test('vote statistics display correctly', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Votes: 2, 5, 8
    // Average: (2+5+8)/3 = 5
    // Median: 5
    // Spread: 8-2 = 6
    await alice.vote('2')
    await bob.vote('5')
    await charlie.vote('8')

    await alice.expectRevealed()
    await alice.expectStats({ average: '5.0', median: '5', spread: '6' })
  })

  test('consensus shows celebration when all votes match', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // All vote 5
    await alice.vote('5')
    await bob.vote('5')
    await charlie.vote('5')

    await alice.expectRevealed()
    await alice.expectConsensus()
    await bob.expectConsensus()
    await charlie.expectConsensus()
  })

  test('special vote ? does not count in stats', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    await alice.vote('5')
    await bob.vote('8')
    await charlie.vote('?')

    await alice.expectRevealed()

    // Stats should only include 5 and 8
    // Average: (5+8)/2 = 6.5
    // Median: either 5 or 8 (sorted: [5,8], middle is index 1 = 8)
    await alice.expectStats({ average: '6.5' })
  })

  test('special vote coffee does not count in stats', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.vote('5')
    await bob.vote('☕')

    await alice.expectRevealed()

    // Only Alice's vote counts
    await alice.expectStats({ average: '5.0', spread: '0' })
  })

  test('voting disabled after reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.vote('5')
    await bob.vote('8')

    await alice.expectRevealed()

    // Vote buttons should be disabled
    const voteBtn = alice.page.locator('button[data-vote="3"]')
    await expect(voteBtn).toBeDisabled()
    await expect(voteBtn).toHaveClass(/opacity-50/)
  })

  test('single user can vote and sees reveal', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    await alice.vote('5')

    // Single user voting should reveal immediately
    await alice.expectRevealed()
    await alice.expectVoteValue('Alice', '5')
  })

  test('duck vote displays correctly', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.vote('🦆')
    await bob.vote('5')

    await alice.expectRevealed()
    await alice.expectVoteValue('Alice', '🦆')
    await bob.expectVoteValue('Alice', '🦆')
  })

  test('fractional vote .5 works correctly', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.vote('.5')
    await bob.vote('1')

    await alice.expectRevealed()
    await alice.expectVoteValue('Alice', '.5')

    // Average of 0.5 and 1 = 0.75
    await alice.expectStats({ average: '0.8' }) // 0.75 rounds to 0.8 with toFixed(1)
  })

  test('user joining after reveal can participate in next round', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice and Bob vote, triggering reveal
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Charlie joins after reveal
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Charlie should see the revealed state
    await charlie.expectRevealed()
    await charlie.expectVoteValue('Alice', '5')
    await charlie.expectVoteValue('Bob', '8')

    // Alice (host) resets the round
    await alice.resetRound()

    // Everyone should see round reset
    await alice.expectNotRevealed()
    await bob.expectNotRevealed()
    await charlie.expectNotRevealed()

    // All three can now vote in the new round
    await alice.vote('3')
    await bob.vote('3')
    await charlie.vote('3')

    await alice.expectRevealed()
    await charlie.expectVoteValue('Charlie', '3')
  })

  test('vote persists after page refresh in revealed room', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Both vote, triggering reveal
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Alice refreshes the page
    await alice.page.reload()
    await alice.joinRoom()

    // Alice should still see the revealed state with all votes
    await alice.expectRevealed()
    await alice.expectVoteValue('Alice', '5')
    await alice.expectVoteValue('Bob', '8')
  })

  test('consensus message appears in chat when everyone votes the same', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Both vote the same value
    await alice.vote('5')
    await bob.vote('5')

    // Wait for reveal
    await alice.expectRevealed()

    // Should see a consensus celebration message in chat (contains keywords like YAHTZEE, UNANIMOUS, etc.)
    const chatMessages = alice.page.locator('#chat-messages')
    // The message should contain the vote value in bold
    await expect(chatMessages.locator('strong', { hasText: '5' })).toBeVisible({ timeout: 3000 })
  })

  test('no consensus message when votes differ', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Vote different values
    await alice.vote('5')
    await bob.vote('8')

    // Wait for reveal
    await alice.expectRevealed()

    // Wait a moment for any messages to arrive
    await alice.page.waitForTimeout(500)

    // Should NOT see consensus messages (check for common consensus keywords)
    const chatMessages = alice.page.locator('#chat-messages')
    await expect(chatMessages.locator('text=YAHTZEE')).not.toBeVisible()
    await expect(chatMessages.locator('text=UNANIMOUS')).not.toBeVisible()
    await expect(chatMessages.locator('text=CONSENSUS')).not.toBeVisible()
  })
})
