import { test, expect } from '../fixtures/multi-user'

test.describe('Session Stats', () => {
  test('can open and close stats panel when not revealed', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()
    await alice.openStats()
    await alice.expectStatsPanel()
    await alice.closeStats()
    await expect(alice.page.locator('#stats-panel')).not.toBeVisible()
  })

  test('shows session awards inline after reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete round 1
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Wait for stats to load and show inline
    await expect(alice.page.locator('text=Session Awards')).toBeVisible({ timeout: 5000 })
    // Should show round count
    await expect(alice.page.locator('text=1 round')).toBeVisible()
  })

  test('shows round and yahtzee count inline', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete round 1 with consensus (yahtzee)
    await alice.vote('5')
    await bob.vote('5')
    await alice.expectRevealed()
    await alice.expectConsensus()

    // Check inline stats
    await expect(alice.page.locator('text=Session Awards')).toBeVisible({ timeout: 5000 })
    await expect(alice.page.locator('text=1 yahtzee')).toBeVisible()

    // Reset and do another yahtzee
    await alice.resetRound()
    await alice.vote('8')
    await bob.vote('8')
    await alice.expectRevealed()

    // Check updated inline stats
    await expect(alice.page.locator('text=Session Awards')).toBeVisible({ timeout: 5000 })
    await expect(alice.page.locator('text=2 yahtzees')).toBeVisible()
    await expect(alice.page.locator('text=2 rounds')).toBeVisible()
  })

  test('tracks chaos agent award inline', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice votes chaos, Bob votes normal
    await alice.vote('?')
    await bob.vote('5')
    await alice.expectRevealed()

    // Check inline stats - Alice should get Chaos Agent (shown as orange text with duck)
    await expect(alice.page.locator('text=Session Awards')).toBeVisible({ timeout: 5000 })
    // Look for the chaos agent award with Alice's name in orange
    await expect(alice.page.locator('.text-orange-400', { hasText: 'Alice' })).toBeVisible()
  })

  test('shows speed awards inline', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete a round
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Check inline stats - should show speed awards
    await expect(alice.page.locator('text=Session Awards')).toBeVisible({ timeout: 5000 })
    // Should have at least the speed demon award (⚡)
    await expect(alice.page.locator('.bg-gray-800 >> text=⚡')).toBeVisible()
  })

  test('closes panel with escape key when opened manually', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()
    await alice.openStats()
    await alice.expectStatsPanel()

    // Press Escape
    await alice.page.keyboard.press('Escape')
    await expect(alice.page.locator('#stats-panel')).not.toBeVisible()
  })

  test('closes panel by clicking backdrop when opened manually', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()
    await alice.openStats()
    await alice.expectStatsPanel()

    // Click the backdrop (panel itself)
    await alice.page.locator('#stats-panel').click({ position: { x: 10, y: 10 } })
    await expect(alice.page.locator('#stats-panel')).not.toBeVisible()
  })
})
