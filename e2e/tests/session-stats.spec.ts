import { test, expect } from '../fixtures/multi-user'

test.describe('Session Stats', () => {
  test('shows session awards inline after reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete round 1
    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Wait for stats to load and show inline (the results section below cards)
    await expect(alice.page.locator('main').getByText('Session Awards')).toBeVisible({ timeout: 5000 })
  })

  test('shows round and yahtzee count inline after reveal', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete round 1 with consensus (yahtzee)
    await alice.vote('5')
    await bob.vote('5')
    await alice.expectRevealed()
    await alice.expectConsensus()

    // Check inline stats shows the counts
    await expect(alice.page.locator('main').getByText('Session Awards')).toBeVisible({ timeout: 5000 })
    await expect(alice.page.locator('main').getByText('1 round')).toBeVisible()
    await expect(alice.page.locator('main').getByText('1 yahtzee')).toBeVisible()

    // Reset and do another yahtzee
    await alice.resetRound()
    await alice.vote('8')
    await bob.vote('8')
    await alice.expectRevealed()

    // Check updated inline stats
    await expect(alice.page.locator('main').getByText('Session Awards')).toBeVisible({ timeout: 5000 })
    await expect(alice.page.locator('main').getByText('2 rounds')).toBeVisible()
    await expect(alice.page.locator('main').getByText('2 yahtzees')).toBeVisible()
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
    await expect(alice.page.locator('main').getByText('Session Awards')).toBeVisible({ timeout: 5000 })
    // Look for the chaos agent award with Alice's name in orange
    await expect(alice.page.locator('main .text-orange-400', { hasText: 'Alice' })).toBeVisible()
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

    // Check inline stats in main area - should show speed awards
    await expect(alice.page.locator('main').getByText('Session Awards')).toBeVisible({ timeout: 5000 })
    // Should have at least the speed demon award
    await expect(alice.page.locator('main').getByText('Speed Demon')).toBeVisible()
  })

  test('stats update after each round', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Complete round 1
    await alice.vote('3')
    await bob.vote('5')
    await alice.expectRevealed()

    // Stats should show inline
    await expect(alice.page.locator('main').getByText('Session Awards')).toBeVisible({ timeout: 5000 })
    await expect(alice.page.locator('main').getByText('1 round')).toBeVisible()

    // Reset and complete round 2
    await alice.resetRound()
    await alice.vote('8')
    await bob.vote('13')
    await alice.expectRevealed()

    // Stats should update
    await expect(alice.page.locator('main').getByText('Session Awards')).toBeVisible({ timeout: 5000 })
    await expect(alice.page.locator('main').getByText('2 rounds')).toBeVisible()
  })
})
