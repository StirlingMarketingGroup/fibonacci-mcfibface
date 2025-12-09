# fibonacci-mcfibface Design

**Date:** 2025-12-09

## Overview

Overbuilt, ridiculous, free planning poker for teams in meetings.

No accounts. No config. Create a room, share the link, point tickets.

## Core Flow

1. User visits site, clicks "Create Room"
2. Enters their name (saved to localStorage for next time)
3. Gets a shareable URL like `fibonacci-mcfibface.pages.dev/room/abc123`
4. Shares link in Slack/Zoom, teammates click and join
5. Everyone sees the poker board with participant cards and voting buttons
6. People vote - their card shows face-down to others
7. When everyone has voted, cards auto-flip with dramatic animation
8. Stats display: average, median, spread, outliers highlighted
9. Consensus triggers confetti
10. Host clicks "Reset" for next ticket
11. Repeat

## Point Scale

`.5, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, ☕, 🦆`

- `?` - unsure/need discussion
- `☕` - need a break / too big
- `🦆` - quack (pure chaos, no meaning)

## Participant Identity

- Required name on join
- Stored in localStorage, editable anytime
- Random animal emoji assigned per participant
- No accounts ever

## Room Mechanics

- **Creation:** Anyone can create a room, becomes host
- **Joining:** Click the shareable URL, enter name, you're in
- **Host powers:** Reset round button (clears votes for next ticket)
- **Persistence:** Rooms live forever (Durable Objects hibernate when inactive, wake on request)

## Voting & Reveal

- Click a point value to vote
- Can change vote until reveal
- Cards show face-down while waiting
- **Auto-reveal** when all participants have voted
- Staggered card flip animation (builds tension)
- Outliers (high/low) get highlighted for discussion

## Stats Tracked

**Per round:**
- Average
- Median
- Spread (high - low)
- Outlier identification

**Per session:**
- Rounds completed
- Total points estimated
- Consensus rate (% of rounds where everyone agreed)

## UI Layout

### Homepage
- Big logo/title with fibonacci spiral + goofy face
- "Create Room" button
- Name input (pre-filled from localStorage)
- Nothing else

### Room View
- **Top bar:** Room URL (click to copy), session stats
- **Main area:** Grid of participant cards
  - Random animal emoji + name
  - Card state: empty → face-down → revealed value
  - Fibonacci spiral card back design
- **Bottom:** Voting buttons for all point values
  - Current selection highlighted
- **Host controls:** "Reset Round" button

### Reveal Moment
- Staggered card flip animations
- Stats slide in
- Outliers glow/highlight
- Consensus = confetti explosion

## Technical Architecture

### Frontend
- **Vite** - dev server, static build
- **TypeScript** - type safety
- **Tailwind CSS** - styling, animations
- **Vanilla TS** - no framework needed
- **GitHub Pages** - hosting from `dist/`

### Backend
- **Cloudflare Workers** - HTTP routing, WebSocket upgrade
- **Durable Objects** - room state, connection management
- **TypeScript** - Cloudflare has good TS support

### Data Flow
1. Create room → Worker creates Durable Object with unique ID
2. Join room → Worker routes to DO, upgrades to WebSocket
3. Vote → WebSocket message → DO updates state → broadcasts to all
4. All voted → DO triggers reveal → broadcasts flip event
5. Reset → Host sends reset → DO clears votes, broadcasts

### No Database
Durable Object IS the state. It hibernates when inactive, persists to disk automatically, wakes on next request. Zero database management.

## Repo Structure

```
fibonacci-mcfibface/
├── frontend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── websocket.ts
│   │   ├── animations.ts
│   │   └── style.css
│   ├── index.html
│   ├── vite.config.ts
│   └── tailwind.config.js
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   └── room.ts
│   └── wrangler.toml
└── README.md
```

## Cost

**$0**

- GitHub Pages: Free
- Cloudflare Workers: Free tier (100k requests/day)
- Durable Objects: Free tier generous for low traffic
- No database costs
- No auth provider costs

## Non-Goals

- User accounts
- Persistent history across sessions
- Multiple point scales / configuration
- Sound effects
- Mobile app
- Jira/GitHub integration
- Timer/countdown features
