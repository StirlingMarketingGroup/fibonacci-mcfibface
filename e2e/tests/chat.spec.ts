import { test, expect } from '../fixtures/multi-user'

test.describe('Chat', () => {
  test('user sends message and others see it', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.sendChat('Hello everyone!')

    // Both should see the message
    await alice.expectChatMessage('Alice', 'Hello everyone!')
    await bob.expectChatMessage('Alice', 'Hello everyone!')
  })

  test('multiple users can chat', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    await alice.sendChat('Hi from Alice')
    await bob.sendChat('Hi from Bob')
    await charlie.sendChat('Hi from Charlie')

    // All should see all messages
    for (const user of [alice, bob, charlie]) {
      await user.expectChatMessage('Alice', 'Hi from Alice')
      await user.expectChatMessage('Bob', 'Hi from Bob')
      await user.expectChatMessage('Charlie', 'Hi from Charlie')
    }
  })

  test('chat messages show correct sender name', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.sendChat('Message from Alice')
    await bob.sendChat('Message from Bob')

    // Verify sender names are shown with messages
    const aliceChat = alice.page.locator('#chat-messages')

    // Check Alice's message shows Alice as sender
    const aliceMessage = aliceChat.locator('div', { hasText: 'Message from Alice' })
    await expect(aliceMessage.locator('span.font-bold')).toHaveText('Alice')

    // Check Bob's message shows Bob as sender
    const bobMessage = aliceChat.locator('div', { hasText: 'Message from Bob' })
    await expect(bobMessage.locator('span.font-bold')).toHaveText('Bob')
  })

  test('new user sees chat history', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice and Bob chat before Charlie joins
    await alice.sendChat('Welcome to the room')
    await bob.sendChat('Thanks Alice!')

    // Charlie joins late
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // Charlie should see previous messages
    await charlie.expectChatMessage('Alice', 'Welcome to the room')
    await charlie.expectChatMessage('Bob', 'Thanks Alice!')
  })

  test('chat input clears after sending', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    await alice.page.fill('#chat-input', 'Test message')
    await alice.page.press('#chat-input', 'Enter')

    // Input should be cleared
    const input = alice.page.locator('#chat-input')
    await expect(input).toHaveValue('')
  })

  test('empty message is not sent', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Try to send empty message
    await alice.page.press('#chat-input', 'Enter')

    // Wait a bit to ensure no message appears
    await alice.page.waitForTimeout(200)

    // Chat should be empty (no messages)
    const chatMessages = alice.page.locator('#chat-messages')
    const messageCount = await chatMessages.locator('div.text-sm').count()
    expect(messageCount).toBe(0)
  })

  test('whitespace-only message is not sent', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Try to send whitespace message
    await alice.page.fill('#chat-input', '   ')
    await alice.page.press('#chat-input', 'Enter')

    await alice.page.waitForTimeout(200)

    const chatMessages = alice.page.locator('#chat-messages')
    const messageCount = await chatMessages.locator('div.text-sm').count()
    expect(messageCount).toBe(0)
  })

  test('long message is accepted up to 500 chars', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Create a 500 char message
    const longMessage = 'a'.repeat(500)
    await alice.sendChat(longMessage)

    // Should be sent successfully
    await bob.expectChatMessage('Alice', longMessage)
  })

  test('message over 500 chars is blocked by input maxlength', async ({ createUsers }) => {
    const [alice] = await createUsers(1)

    await alice.createRoom()

    // Input has maxlength=500, so typing more won't work
    const input = alice.page.locator('#chat-input')
    await input.fill('a'.repeat(600))

    // Should be truncated to 500
    const value = await input.inputValue()
    expect(value.length).toBe(500)
  })

  test('chat messages have colored usernames', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.sendChat('Hello')

    // Check that the username span has a color style
    const chatMessages = alice.page.locator('#chat-messages')
    const nameSpan = chatMessages.locator('span.font-bold').first()
    const style = await nameSpan.getAttribute('style')

    // Should have a color like "color: #FF0000" or similar
    expect(style).toContain('color:')
  })

  test('chat works during and after voting', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Chat before voting
    await alice.sendChat('Let me think...')
    await bob.expectChatMessage('Alice', 'Let me think...')

    // Vote
    await alice.vote('5')
    await bob.sendChat('I voted!')
    await alice.expectChatMessage('Bob', 'I voted!')

    await bob.vote('8')
    await alice.expectRevealed()

    // Chat after reveal
    await alice.sendChat('Interesting results')
    await bob.expectChatMessage('Alice', 'Interesting results')
  })

  test('chat persists across rounds', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    await alice.sendChat('Round 1 message')

    await alice.vote('5')
    await bob.vote('8')
    await alice.expectRevealed()

    // Reset round
    await alice.resetRound()

    // Chat should still be there
    await alice.expectChatMessage('Alice', 'Round 1 message')
    await bob.expectChatMessage('Alice', 'Round 1 message')

    // Can send new messages
    await bob.sendChat('Round 2 message')
    await alice.expectChatMessage('Bob', 'Round 2 message')
  })

  test('large room - all 6 members send messages and everyone sees them', async ({ createUsers }) => {
    const users = await createUsers(6)
    const [alice, bob, charlie, diana, eve, frank] = users

    const roomUrl = await alice.createRoom()

    // Everyone joins
    for (const user of [bob, charlie, diana, eve, frank]) {
      await user.goto(roomUrl)
      await user.joinRoom()
    }

    // Each user sends a unique message
    await alice.sendChat('Hello from Alice!')
    await bob.sendChat('Hello from Bob!')
    await charlie.sendChat('Hello from Charlie!')
    await diana.sendChat('Hello from Diana!')
    await eve.sendChat('Hello from Eve!')
    await frank.sendChat('Hello from Frank!')

    // Give time for all messages to propagate
    await alice.page.waitForTimeout(500)

    // Verify ALL users see ALL messages
    for (const user of users) {
      await user.expectChatMessage('Alice', 'Hello from Alice!')
      await user.expectChatMessage('Bob', 'Hello from Bob!')
      await user.expectChatMessage('Charlie', 'Hello from Charlie!')
      await user.expectChatMessage('Diana', 'Hello from Diana!')
      await user.expectChatMessage('Eve', 'Hello from Eve!')
      await user.expectChatMessage('Frank', 'Hello from Frank!')
    }
  })

  test('chat history persists after page refresh', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Send several messages
    await alice.sendChat('Message 1 from Alice')
    await bob.sendChat('Message 2 from Bob')
    await alice.sendChat('Message 3 from Alice')
    await bob.sendChat('Message 4 from Bob')

    // Bob refreshes the page
    await bob.page.reload()
    await bob.joinRoom()

    // Bob should still see all previous messages
    await bob.expectChatMessage('Alice', 'Message 1 from Alice')
    await bob.expectChatMessage('Bob', 'Message 2 from Bob')
    await bob.expectChatMessage('Alice', 'Message 3 from Alice')
    await bob.expectChatMessage('Bob', 'Message 4 from Bob')
  })

  test('user reconnects and sees chat history', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Chat before disconnect
    await alice.sendChat('Before disconnect 1')
    await bob.sendChat('Before disconnect 2')

    // Bob disconnects
    await bob.disconnect()
    await alice.page.waitForTimeout(300)

    // Alice keeps chatting
    await alice.sendChat('While Bob was away')

    // Bob reconnects
    await bob.reconnect()
    await bob.joinRoom()

    // Bob should see all messages including ones sent while away
    await bob.expectChatMessage('Alice', 'Before disconnect 1')
    await bob.expectChatMessage('Bob', 'Before disconnect 2')
    await bob.expectChatMessage('Alice', 'While Bob was away')
  })

  test('rapid fire messages from multiple users', async ({ createUsers }) => {
    const [alice, bob, charlie] = await createUsers(3)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()
    await charlie.goto(roomUrl)
    await charlie.joinRoom()

    // All users send messages rapidly in parallel
    await Promise.all([
      alice.sendChat('Alice rapid 1'),
      bob.sendChat('Bob rapid 1'),
      charlie.sendChat('Charlie rapid 1'),
    ])

    await Promise.all([
      alice.sendChat('Alice rapid 2'),
      bob.sendChat('Bob rapid 2'),
      charlie.sendChat('Charlie rapid 2'),
    ])

    await Promise.all([
      alice.sendChat('Alice rapid 3'),
      bob.sendChat('Bob rapid 3'),
      charlie.sendChat('Charlie rapid 3'),
    ])

    // Give time for messages to settle
    await alice.page.waitForTimeout(500)

    // All messages should be visible to everyone
    for (const user of [alice, bob, charlie]) {
      await user.expectChatMessage('Alice', 'Alice rapid 1')
      await user.expectChatMessage('Bob', 'Bob rapid 1')
      await user.expectChatMessage('Charlie', 'Charlie rapid 1')
      await user.expectChatMessage('Alice', 'Alice rapid 2')
      await user.expectChatMessage('Bob', 'Bob rapid 2')
      await user.expectChatMessage('Charlie', 'Charlie rapid 2')
      await user.expectChatMessage('Alice', 'Alice rapid 3')
      await user.expectChatMessage('Bob', 'Bob rapid 3')
      await user.expectChatMessage('Charlie', 'Charlie rapid 3')
    }
  })

  test('chat message order is preserved', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Send messages in specific order
    await alice.sendChat('First message')
    await bob.sendChat('Second message')
    await alice.sendChat('Third message')
    await bob.sendChat('Fourth message')

    // Verify order in the chat panel
    const chatMessages = alice.page.locator('#chat-messages .text-sm')
    const count = await chatMessages.count()
    expect(count).toBe(4)

    // Check order by examining text content
    const texts = await chatMessages.allTextContents()
    expect(texts[0]).toContain('First message')
    expect(texts[1]).toContain('Second message')
    expect(texts[2]).toContain('Third message')
    expect(texts[3]).toContain('Fourth message')
  })

  test('late joiner sees last 50 messages', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()

    // Alice sends many messages before Bob joins
    for (let i = 1; i <= 10; i++) {
      await alice.sendChat(`Pre-join msg number ${i} end`)
    }

    // Bob joins late
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Bob should see the messages (use exact text to avoid substring matches)
    await bob.expectChatMessage('Alice', 'Pre-join msg number 1 end')
    await bob.expectChatMessage('Alice', 'Pre-join msg number 5 end')
    await bob.expectChatMessage('Alice', 'Pre-join msg number 10 end')
  })

  test('markdown is rendered in chat messages', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Send messages with markdown
    await alice.sendChat('This is **bold** text')
    await alice.sendChat('This is *italic* text')
    await alice.sendChat('This is `code` text')
    await alice.sendChat('This is ~~strikethrough~~ text')

    // Check that markdown is rendered as HTML
    const chatMessages = bob.page.locator('#chat-messages')

    // Bold should render as <strong>
    await expect(chatMessages.locator('strong', { hasText: 'bold' })).toBeVisible()

    // Italic should render as <em>
    await expect(chatMessages.locator('em', { hasText: 'italic' })).toBeVisible()

    // Code should render as <code>
    await expect(chatMessages.locator('code', { hasText: 'code' })).toBeVisible()

    // Strikethrough should render as <del>
    await expect(chatMessages.locator('del', { hasText: 'strikethrough' })).toBeVisible()
  })

  test('text effects are rendered', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Send messages with text effects
    await alice.sendChat('!rainbow hello world!')
    await alice.sendChat('!shake shaky text!')
    await alice.sendChat('!glow glowing!')
    await alice.sendChat('!party party time!')

    const chatMessages = bob.page.locator('#chat-messages')

    // Check effect classes are applied
    await expect(chatMessages.locator('.effect-rainbow', { hasText: 'hello world' })).toBeVisible()
    await expect(chatMessages.locator('.effect-shake', { hasText: 'shaky text' })).toBeVisible()
    await expect(chatMessages.locator('.effect-glow', { hasText: 'glowing' })).toBeVisible()
    await expect(chatMessages.locator('.effect-party', { hasText: 'party time' })).toBeVisible()
  })

  test('GIF URLs are rendered as images', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Send a GIF URL
    await alice.sendChat('Check this out https://media.giphy.com/media/test/giphy.gif cool right?')

    const chatMessages = bob.page.locator('#chat-messages')

    // Should render as an image with chat-sticker class
    await expect(chatMessages.locator('img.chat-sticker')).toBeVisible()
  })

  test('each user has consistent color across messages', async ({ createUsers }) => {
    const [alice, bob] = await createUsers(2)

    const roomUrl = await alice.createRoom()
    await bob.goto(roomUrl)
    await bob.joinRoom()

    // Alice sends multiple messages
    await alice.sendChat('Message 1')
    await alice.sendChat('Message 2')
    await alice.sendChat('Message 3')

    // Get all Alice's name spans and verify they have same color
    const chatMessages = bob.page.locator('#chat-messages')
    const aliceNames = chatMessages.locator('span.font-bold', { hasText: 'Alice' })
    const count = await aliceNames.count()
    expect(count).toBe(3)

    const colors: string[] = []
    for (let i = 0; i < count; i++) {
      const style = await aliceNames.nth(i).getAttribute('style')
      colors.push(style || '')
    }

    // All should have the same color
    expect(colors[0]).toBe(colors[1])
    expect(colors[1]).toBe(colors[2])
  })
})
