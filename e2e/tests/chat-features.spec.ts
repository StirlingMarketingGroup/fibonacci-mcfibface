import { test, expect } from '../fixtures/multi-user'

test.describe('Chat Features', () => {
  test.describe('Slash Commands', () => {
    test('/shrug sends kaomoji', async ({ createUsers }) => {
      const [alice, bob] = await createUsers(2)

      const roomUrl = await alice.createRoom()
      await bob.goto(roomUrl)
      await bob.joinRoom()

      await alice.sendChat('/shrug')

      // Both should see the kaomoji (check for the face part which is unique)
      const chatArea = bob.page.locator('#chat-messages')
      await expect(chatArea.locator('text=(ツ)')).toBeVisible()
    })

    test('/tableflip sends flip kaomoji', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('/tableflip')

      const chatArea = alice.page.locator('#chat-messages')
      await expect(chatArea.locator('text=(╯°□°)╯︵ ┻━┻')).toBeVisible()
    })

    test('/help lists available commands', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('/help')

      const chatArea = alice.page.locator('#chat-messages')
      await expect(chatArea.locator('text=/shrug')).toBeVisible()
      await expect(chatArea.locator('text=/tableflip')).toBeVisible()
    })

    test('slash command with additional text', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('/shrug whatever')

      const chatArea = alice.page.locator('#chat-messages')
      // Check both the face and the additional text are present
      await expect(chatArea.locator('text=(ツ)')).toBeVisible()
      await expect(chatArea.locator('text=whatever')).toBeVisible()
    })
  })

  test.describe('Stackable Text Effects', () => {
    test('single effect with colon syntax', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('rainbow:hello world')

      const chatArea = alice.page.locator('#chat-messages')
      const effectSpan = chatArea.locator('.effect-rainbow')
      await expect(effectSpan).toBeVisible()
      await expect(effectSpan).toContainText('hello world')
    })

    test('multiple stacked effects', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('wave:glow:buying gf')

      const chatArea = alice.page.locator('#chat-messages')
      const effectSpan = chatArea.locator('.effect-wave.effect-glow')
      await expect(effectSpan).toBeVisible()
      await expect(effectSpan).toContainText('buying gf')
    })

    test('color effect', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('cyan:cool text')

      const chatArea = alice.page.locator('#chat-messages')
      const effectSpan = chatArea.locator('.effect-cyan')
      await expect(effectSpan).toBeVisible()
      await expect(effectSpan).toContainText('cool text')
    })

    test('legacy !effect! syntax still works', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('!rainbow legacy!')

      const chatArea = alice.page.locator('#chat-messages')
      const effectSpan = chatArea.locator('.effect-rainbow')
      await expect(effectSpan).toBeVisible()
      await expect(effectSpan).toContainText('legacy')
    })
  })

  test.describe('Voting System Messages', () => {
    test('vote cast message appears in chat', async ({ createUsers }) => {
      const [alice, bob] = await createUsers(2)

      const roomUrl = await alice.createRoom()
      await bob.goto(roomUrl)
      await bob.joinRoom()

      // Wait for join messages to settle
      await bob.page.waitForTimeout(500)

      await alice.vote('5')

      // Wait for vote message to appear
      await bob.page.waitForTimeout(500)

      // Should see a system message about Alice voting - look for vote-related phrases
      const chatArea = bob.page.locator('#chat-messages')
      // Check for any of the vote cast messages that mention Alice
      const aliceVoteMessages = chatArea.locator('span.text-gray-500.italic', { hasText: 'Alice' })
      // There should be at least one system message about Alice (join + vote)
      const count = await aliceVoteMessages.count()
      // We expect at least 2: join message + vote message
      expect(count).toBeGreaterThanOrEqual(2)
    })

    test('round reveal message appears when all vote', async ({ createUsers }) => {
      const [alice, bob] = await createUsers(2)

      const roomUrl = await alice.createRoom()
      await bob.goto(roomUrl)
      await bob.joinRoom()

      await alice.vote('5')
      await bob.vote('8')

      // Wait for reveal
      await alice.expectRevealed()

      // Should see a reveal system message
      const chatArea = alice.page.locator('#chat-messages')
      // These are the reveal messages we defined
      const revealMessages = ['votes are in', 'Drumroll', 'see what', 'Revealing', 'results are', 'moment of truth', 'Behold', 'crystal ball']
      let foundReveal = false
      for (const msg of revealMessages) {
        const count = await chatArea.locator(`text=${msg}`).count()
        if (count > 0) {
          foundReveal = true
          break
        }
      }
      expect(foundReveal).toBe(true)
    })

    test('round start message appears on reset', async ({ createUsers }) => {
      const [alice, bob] = await createUsers(2)

      const roomUrl = await alice.createRoom()
      await bob.goto(roomUrl)
      await bob.joinRoom()

      // Complete a round
      await alice.vote('5')
      await bob.vote('8')
      await alice.expectRevealed()

      // Reset round
      await alice.resetRound()

      // Should see round 2 message
      const chatArea = alice.page.locator('#chat-messages')
      await expect(chatArea.locator('text=Round 2')).toBeVisible()
    })
  })
})
