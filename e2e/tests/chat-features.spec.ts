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

  test.describe('Link Unfurling', () => {
    test('plain URL is converted to a link with site title', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('check out https://example.com')

      const chatArea = alice.page.locator('#chat-messages')

      // Wait for the link to be unfurled (may take a moment to fetch)
      // The unfurled link should contain "(Link to ...)" format
      // Use .first() to get the inline link (not the preview card link)
      const unfurledLink = chatArea.locator('a[href="https://example.com"]').first()
      await expect(unfurledLink).toBeVisible({ timeout: 10000 })
      await expect(unfurledLink).toContainText('Link to')
    })

    test('multiple URLs in same message are both unfurled', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('https://example.com and https://example.org')

      const chatArea = alice.page.locator('#chat-messages')

      // Both links should be unfurled - use .first() to get inline links (not preview card links)
      const link1 = chatArea.locator('a[href="https://example.com"]').first()
      const link2 = chatArea.locator('a[href="https://example.org"]').first()
      await expect(link1).toBeVisible({ timeout: 10000 })
      await expect(link2).toBeVisible({ timeout: 10000 })
    })

    test('GIF URLs are not unfurled (rendered as images)', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('https://media.giphy.com/media/test/giphy.gif')

      const chatArea = alice.page.locator('#chat-messages')

      // Should be an image, not a link
      const img = chatArea.locator('img.chat-sticker')
      await expect(img).toBeVisible()
      // Should NOT have an unfurl placeholder for .gif URLs
      const unfurlPlaceholder = chatArea.locator('.unfurl-placeholder')
      await expect(unfurlPlaceholder).not.toBeVisible()
    })

    test('markdown links are preserved (not double-unfurled)', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('[Custom Text](https://example.com)')

      const chatArea = alice.page.locator('#chat-messages')

      // Marked should process this as a link with "Custom Text"
      // This link won't be unfurled since it's already a markdown link
      const link = chatArea.locator('a[href="https://example.com"]').first()
      await expect(link).toBeVisible()
      await expect(link).toHaveText('Custom Text')
    })

    test('preview card always shows for URLs', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      // example.com has minimal metadata - but should still show a preview card
      await alice.sendChat('https://example.com')

      const chatArea = alice.page.locator('#chat-messages')

      // Wait for preview card to appear
      const previewCard = chatArea.locator('.link-preview')
      await expect(previewCard).toBeVisible({ timeout: 15000 })

      // Preview card should have title and domain
      const title = previewCard.locator('.link-preview-title')
      await expect(title).toBeVisible()

      const domain = previewCard.locator('.link-preview-domain')
      await expect(domain).toHaveText('example.com')
    })

    test('preview card shows favicon or fallback when no OG image', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      // example.com has no OG image but may have a favicon
      await alice.sendChat('https://example.com')

      const chatArea = alice.page.locator('#chat-messages')

      // Wait for preview card to appear
      const previewCard = chatArea.locator('.link-preview')
      await expect(previewCard).toBeVisible({ timeout: 15000 })

      // Should have either favicon or fallback icon (gradient div with emoji)
      const favicon = previewCard.locator('.link-preview-favicon')
      const fallback = previewCard.locator('.link-preview-fallback')

      // One of these should be visible
      const hasFavicon = await favicon.isVisible().catch(() => false)
      const hasFallback = await fallback.isVisible().catch(() => false)
      expect(hasFavicon || hasFallback).toBe(true)
    })

    test('preview card shows for URLs with OG metadata', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      // GitHub has good OG metadata (title, description, image)
      await alice.sendChat('https://github.com')

      const chatArea = alice.page.locator('#chat-messages')

      // Wait for preview card to appear
      const previewCard = chatArea.locator('.link-preview')
      await expect(previewCard).toBeVisible({ timeout: 15000 })

      // Preview card should have title
      const title = previewCard.locator('.link-preview-title')
      await expect(title).toBeVisible()

      // Preview card should have domain (may include siteName prefix)
      const domain = previewCard.locator('.link-preview-domain')
      await expect(domain).toContainText('github.com')
    })

    test('preview card is clickable and links to URL', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      await alice.sendChat('https://github.com')

      const chatArea = alice.page.locator('#chat-messages')

      // Wait for preview card to appear
      const previewCard = chatArea.locator('.link-preview')
      await expect(previewCard).toBeVisible({ timeout: 15000 })

      // Preview card link should have correct href
      const link = previewCard.locator('a')
      await expect(link).toHaveAttribute('href', 'https://github.com')
      await expect(link).toHaveAttribute('target', '_blank')
    })

    test('long link titles are truncated with ellipsis', async ({ createUsers }) => {
      const [alice] = await createUsers(1)

      await alice.createRoom()
      // Wikipedia article with long title
      await alice.sendChat('https://en.wikipedia.org/wiki/Pneumonoultramicroscopicsilicovolcanoconiosis')

      const chatArea = alice.page.locator('#chat-messages')

      // Wait for link to be unfurled - use .first() to get inline link (not preview card)
      const link = chatArea.locator('a[href="https://en.wikipedia.org/wiki/Pneumonoultramicroscopicsilicovolcanoconiosis"]').first()
      await expect(link).toBeVisible({ timeout: 15000 })

      // The link should have overflow:hidden and text-overflow:ellipsis styles
      // We can check by comparing the scrollWidth to clientWidth
      const hasEllipsis = await link.evaluate((el) => {
        const style = window.getComputedStyle(el)
        return style.textOverflow === 'ellipsis' && style.overflow === 'hidden'
      })
      expect(hasEllipsis).toBe(true)
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
