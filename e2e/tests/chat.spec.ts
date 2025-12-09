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
})
