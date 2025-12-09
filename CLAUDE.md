# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

fibonacci-mcfibface is a free, no-account planning poker app for agile teams. Users create a room, share a link, and teammates join to vote on story points. Cards flip with animations when everyone has voted.

## Architecture

**Monorepo with two packages:**

- `frontend/` - Vite + TypeScript + Tailwind CSS static site hosted on Cloudflare Pages
- `worker/` - Cloudflare Worker + Durable Objects for real-time WebSocket communication

**Data flow:** Room state lives entirely in Durable Objects (no external database). Workers handle HTTP routing and WebSocket upgrades. Frontend connects via WebSocket for real-time vote sync.

## Commands

### Frontend (`cd frontend/`)
```bash
npm run dev      # Start Vite dev server
npm run build    # Build to dist/
npm run preview  # Preview production build
```

### Worker (`cd worker/`)
```bash
npx wrangler dev      # Local development
npx wrangler deploy   # Deploy to Cloudflare
```

### E2E Tests (`cd e2e/`)
```bash
npm test              # Run all Playwright tests
npm test -- --grep "pattern"  # Run tests matching pattern
```

## Development Guidelines

**Every new feature must have E2E tests.** Tests live in `e2e/tests/` and use the multi-user fixture from `e2e/fixtures/multi-user.ts`. The fixture provides helpers for common actions:

- `createUsers(n)` - Create n test users with separate browser contexts
- `user.createRoom()` - Create a room and return the URL
- `user.joinRoom()` - Join a room
- `user.vote(value)` - Cast a vote
- `user.kickParticipant(name)` - Kick a user (host only)
- `user.expectParticipantCount(n)` - Assert participant count
- etc.

Run tests before committing: `cd e2e && npm test`

**Consider README updates.** When adding features or fixing bugs, consider whether the README should be updated to document the change (e.g., new features, changed behavior, new special values).

## Point Scale

Valid point values: `.5, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, ☕, 🦆`

Special values:
- `?` - unsure/need discussion
- `☕` - need a break
- `🦆` - chaos vote
