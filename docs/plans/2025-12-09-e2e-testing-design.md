# E2E Testing Design for fibonacci-mcfibface

## Overview

Automated Playwright test suite that simulates multiple real users interacting with the planning poker app simultaneously. Tests run against local dev servers (vite + wrangler) to catch bugs in both frontend and backend.

## Architecture

### Directory Structure

```
e2e/
├── package.json           # Playwright + dependencies
├── playwright.config.ts   # Config with webServer setup
├── fixtures/
│   └── multi-user.ts      # Custom fixture for spawning multiple users
├── helpers/
│   └── room.ts            # Helper functions (createRoom, joinRoom, vote, etc.)
└── tests/
    ├── join-leave.spec.ts      # Join room, leave room, reconnect
    ├── voting.spec.ts          # Cast votes, auto-reveal, consensus
    ├── host-controls.spec.ts   # Reset round, host handoff
    ├── chat.spec.ts            # Send messages, see others' messages
    └── stress.spec.ts          # Many users, rapid actions, race conditions
```

### Multi-User Fixture

Custom Playwright fixture that spawns multiple browser contexts, each representing a different user:

```typescript
test('three users vote and see reveal', async ({ createUsers }) => {
  const [alice, bob, charlie] = await createUsers(3)

  await alice.createRoom()
  const roomUrl = alice.page.url()

  await bob.goto(roomUrl)
  await charlie.goto(roomUrl)

  await alice.vote('5')
  await bob.vote('8')
  await charlie.vote('5')

  await alice.expectRevealed({ '5': 2, '8': 1 })
  await bob.expectRevealed({ '5': 2, '8': 1 })
  await charlie.expectRevealed({ '5': 2, '8': 1 })
})
```

### User Object Methods

Each user object wraps a Playwright Page with helper methods:

- `createRoom()` - Go to home, enter name, create room
- `goto(url)` - Navigate to URL (e.g., join room via link)
- `joinRoom(name)` - Enter name when prompted
- `vote(value)` - Click a vote button
- `sendChat(text)` - Send a chat message
- `expectParticipants(names[])` - Assert who's in the room
- `expectRevealed(voteCounts)` - Assert votes are shown with counts
- `expectVoteHidden(name)` - Assert someone voted but value is hidden
- `expectIsHost()` / `expectIsNotHost()` - Assert host status
- `resetRound()` - Click reset (host only)
- `disconnect()` - Close WebSocket connection
- `reconnect()` - Reconnect to room

## Test Scenarios

### join-leave.spec.ts

- User creates room and sees themselves as only participant
- Second user joins via URL, both see each other
- User leaves (closes tab), others see them removed
- User reconnects with same identity (emoji/color preserved)
- Host leaves, next user becomes host

### voting.spec.ts

- User casts vote, others see "voted" indicator (card face-down)
- User changes vote before reveal
- All users vote → auto-reveal triggers
- Verify vote statistics (average, median, spread) display correctly
- Consensus case (all same vote) shows celebration message
- Special votes (?, ☕, 🦆) don't count in numeric stats

### host-controls.spec.ts

- Only host sees "Reset Round" button
- Host resets → all votes cleared, round number increments
- Non-host cannot reset (button not present)

### chat.spec.ts

- User sends message, all others see it with correct name/color
- Chat persists for users who join mid-session (last 50 messages)
- Long messages truncated at 500 chars

### stress.spec.ts

- 5+ users join rapidly in parallel
- Multiple users vote simultaneously
- User disconnects mid-vote, reconnects, state is correct

## Running Tests

```bash
cd e2e
npm install          # Install Playwright + deps
npm test             # Run all tests (starts servers automatically)
npm run test:ui      # Playwright UI mode for debugging
npm run test:headed  # Watch tests run in visible browsers
```

## Playwright Configuration

- Starts `vite dev` (frontend on port 5173)
- Starts `wrangler dev` (worker on port 8787)
- Waits for both servers to be ready before running tests
- Runs tests in parallel (each test gets fresh browser contexts)
- Generates HTML report on failure
