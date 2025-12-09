import { test, expect } from '../fixtures/multi-user'

test.describe('Session Stats', () => {
  test('can open and close stats panel', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()
    await alice.openStats()
    await alice.expectStatsPanel()
    await alice.closeStats()
    await expect(alice.page.locator('#stats-panel')).not.toBeVisible()
  })

  test('shows round count after completing rounds', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete round 1
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Reset for round 2
    await alice.resetRound()
    await alice.vote('3')
    await bob.vote('3')
    await alice.expectRevealed()

    // Check stats
    await alice.openStats()
    await alice.expectStatsPanelRounds(2)
  })

  test('tracks yahtzee count', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete round 1 with consensus (yahtzee)
    await alice.vote('5')
    await bob.vote('5')
    await alice.expectRevealed()
    await alice.expectConsensus()

    // Check stats
    await alice.openStats()
    await alice.expectStatsPanelYahtzees(1)
    await alice.closeStats()

    // Reset and do another yahtzee
    await alice.resetRound()
    await alice.vote('8')
    await bob.vote('8')
    await alice.expectRevealed()

    await alice.openStats()
    await alice.expectStatsPanelYahtzees(2)
  })

  test('shows awards after multiple rounds', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete a round
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Check stats - should show at least duration and rounds
    await alice.openStats()
    await alice.expectStatsPanelContains('Session Stats')
    await alice.expectStatsPanelContains('Rounds')
    await alice.expectStatsPanelContains('Duration')
  })

  test('tracks chaos agent award', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice votes chaos, Bob votes normal
    await alice.vote('?')
    await bob.vote('5')
    await alice.expectRevealed()

    // Check stats - Alice should get Chaos Agent
    await alice.openStats()
    await alice.expectStatsPanelContains('Chaos Agent')
    await alice.expectStatsPanelContains('Alice')
  })

  test('closes panel with escape key', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()
    await alice.openStats()
    await alice.expectStatsPanel()

    // Press Escape
    await alice.page.keyboard.press('Escape')
    await expect(alice.page.locator('#stats-panel')).not.toBeVisible()
  })

  test('closes panel by clicking backdrop', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()
    await alice.openStats()
    await alice.expectStatsPanel()

    // Click the backdrop (panel itself)
    await alice.page.locator('#stats-panel').click({ position: { x: 10, y: 10 } })
    await expect(alice.page.locator('#stats-panel')).not.toBeVisible()
  })
})
