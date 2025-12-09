import { test, expect } from '../fixtures/multi-user'

test.describe('Host Controls', () => {
  test('only host sees reset button', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice (host) sees reset button
    await alice.expectIsHost()

    // Bob does not see reset button
    await bob.expectIsNotHost()
  })

  test('host can reset round after reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Vote and reveal
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()
    await alice.expectRoundNumber(1)

    // Host resets
    await alice.resetRound()

    // Round increments, votes cleared
    await alice.expectRoundNumber(2)
    await alice.expectNotRevealed()
    await alice.expectNoVote('Alice')
    await alice.expectNoVote('Bob')

    // Bob also sees the reset
    await bob.expectRoundNumber(2)
    await bob.expectNotRevealed()
  })

  test('host can reset round before all votes are in', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Only Alice votes
    await alice.vote('5')
    await alice.expectNotRevealed()

    // Host resets anyway
    await alice.resetRound()

    await alice.expectRoundNumber(2)
    await alice.expectNoVote('Alice')
    await alice.expectNoVote('Bob')
  })

  test('users can vote again after reset', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // First round
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Reset
    await alice.resetRound()

    // Second round - vote buttons should be enabled
    const voteBtn = alice.page.locator('button[data-vote="3"]')
    await expect(voteBtn).not.toBeDisabled()

    // Can vote again
    await alice.vote('3')
    await bob.vote('5')

    await alice.expectRevealed()
    await alice.expectVoteValue('Alice', '3')
    await alice.expectVoteValue('Bob', '5')
  })

  test('multiple rounds work correctly', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Round 1
    await alice.vote('1')
    await bob.vote('2')
    await alice.expectRevealed()
    await alice.expectRoundNumber(1)

    // Round 2
    await alice.resetRound()
    await alice.vote('3')
    await bob.vote('5')
    await alice.expectRevealed()
    await alice.expectRoundNumber(2)

    // Round 3
    await alice.resetRound()
    await alice.vote('8')
    await bob.vote('13')
    await alice.expectRevealed()
    await alice.expectRoundNumber(3)
  })

  test('host transfer works when host leaves', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Alice is host
    await alice.expectIsHost()
    await bob.expectIsNotHost()
    await charlie.expectIsNotHost()

    // Alice leaves
    await alice.disconnect()
    await bob.page.waitForTimeout(500)

    // Bob should become host
    await bob.expectIsHost()
    await charlie.expectIsNotHost()

    // Bob can use host controls
    await bob.vote('5')
    await charlie.vote('8')
    await bob.expectRevealed()

    await bob.resetRound()
    await bob.expectRoundNumber(2)
  })

  test('new host transfer after second host leaves', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Alice leaves - Bob becomes host
    await alice.disconnect()
    await bob.page.waitForTimeout(500)
    await bob.expectIsHost()

    // Bob leaves - Charlie becomes host
    await bob.disconnect()
    await charlie.page.waitForTimeout(500)
    await charlie.expectIsHost()

    // Charlie can reset
    await charlie.vote('5')
    await charlie.expectRevealed()
    await charlie.resetRound()
    await charlie.expectRoundNumber(2)
  })

  test('reset clears my vote selection UI', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice votes 5
    await alice.vote('5')
    await alice.expectMyVoteSelected('5')

    await bob.vote('8')
    await alice.expectRevealed()

    // Reset
    await alice.resetRound()

    // Alice's vote selection should be cleared (no button highlighted)
    const voteBtn5 = alice.page.locator('button[data-vote="5"]')
    await expect(voteBtn5).not.toHaveClass(/scale-110/)
  })
})
