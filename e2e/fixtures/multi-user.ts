import { test as base, BrowserContext, Page, expect } from '@playwright/test'

const USER_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']

export interface TestUser {
  page: Page
  context: BrowserContext
  name: string

  // Navigation
  goto(url: string): Promise<void>
  createRoom(): Promise<string>
  joinRoom(name?: string): Promise<void>

  // Voting
  vote(value: string): Promise<void>
  clearVote(): Promise<void>

  // Host actions
  resetRound(): Promise<void>
  kickParticipant(name: string): Promise<void>

  // Chat
  sendChat(text: string): Promise<void>

  // Assertions
  expectParticipants(names: string[]): Promise<void>
  expectParticipantCount(count: number): Promise<void>
  expectVoteHidden(name: string): Promise<void>
  expectNoVote(name: string): Promise<void>
  expectRevealed(): Promise<void>
  expectNotRevealed(): Promise<void>
  expectVoteValue(name: string, value: string): Promise<void>
  expectMyVoteSelected(value: string): Promise<void>
  expectIsHost(): Promise<void>
  expectIsNotHost(): Promise<void>
  expectRoundNumber(num: number): Promise<void>
  expectChatMessage(name: string, text: string): Promise<void>
  expectStats(stats: { average?: string; median?: string; spread?: string }): Promise<void>
  expectConsensus(): Promise<void>

  // Connection
  leaveRoom(): Promise<void>
  disconnect(): Promise<void>
  reconnect(): Promise<void>

  // Kicked state
  expectKicked(): Promise<void>

  // Identity helpers
  getIdentity(): Promise<{ emoji: string; color: string }>

  // Session stats
  openStats(): Promise<void>
  closeStats(): Promise<void>
  expectStatsPanel(): Promise<void>
  expectStatsPanelContains(text: string): Promise<void>
  expectStatsPanelRounds(count: number): Promise<void>
  expectStatsPanelYahtzees(count: number): Promise<void>
}

class TestUserImpl implements TestUser {
  page: Page
  context: BrowserContext
  name: string
  private currentUrl: string = ''

  constructor(page: Page, context: BrowserContext, name: string) {
    this.page = page
    this.context = context
    this.name = name
  }

  async goto(url: string) {
    this.currentUrl = url
    await this.page.goto(url)
    await this.page.waitForSelector('#app', { state: 'attached' })
  }

  async createRoom() {
    await this.page.goto('/')
    await this.page.waitForSelector('#name-input')
    await this.page.fill('#name-input', this.name)
    await this.page.click('#create-room-btn')
    await this.page.waitForURL(/\/room\//)
    await this.page.waitForSelector('.vote-btn', { timeout: 10000 })
    this.currentUrl = this.page.url()
    return this.currentUrl
  }

  async joinRoom(customName?: string) {
    const nameToUse = customName || this.name
    const nameInput = this.page.locator('#name-input')
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await nameInput.fill(nameToUse)
      await this.page.click('#join-btn')
    }
    await this.page.waitForSelector('.vote-btn', { timeout: 10000 })
    // Wait for WebSocket state to sync
    await this.page.waitForTimeout(300)
  }

  async vote(value: string) {
    await this.page.click(`button[data-vote="${value}"]`)
    await this.page.waitForTimeout(100)
  }

  async clearVote() {
    // Not implemented in current app
  }

  async resetRound() {
    await this.page.click('#reset-btn')
    await this.page.waitForTimeout(100)
  }

  async kickParticipant(name: string) {
    const card = this.page.locator('.flex.flex-col.items-center.relative.group', { hasText: name })
    await card.hover()
    await card.locator('.kick-btn').click()
    await this.page.waitForTimeout(100)
  }

  async sendChat(text: string) {
    await this.page.fill('#chat-input', text)
    await this.page.press('#chat-input', 'Enter')
    await this.page.waitForTimeout(100)
  }

  async expectParticipants(names: string[]) {
    for (const n of names) {
      await expect(this.page.locator(`text=${n}`).first()).toBeVisible()
    }
  }

  async expectParticipantCount(count: number) {
    const cards = this.page.locator('main .flex.flex-col.items-center')
    await expect(cards).toHaveCount(count, { timeout: 5000 })
  }

  async expectVoteHidden(name: string) {
    const card = this.page.locator('.flex.flex-col.items-center', { hasText: name })
    await expect(card.locator('text=🃏')).toBeVisible()
  }

  async expectNoVote(name: string) {
    const card = this.page.locator('.flex.flex-col.items-center', { hasText: name })
    await expect(card.locator('text=...')).toBeVisible()
  }

  async expectRevealed() {
    await expect(this.page.locator('h2:has-text("Results")')).toBeVisible({ timeout: 5000 })
  }

  async expectNotRevealed() {
    await expect(this.page.locator('h2:has-text("Results")')).not.toBeVisible()
  }

  async expectVoteValue(name: string, value: string) {
    const card = this.page.locator('.flex.flex-col.items-center', { hasText: name })
    await expect(card.locator('.text-2xl.font-bold', { hasText: value })).toBeVisible()
  }

  async expectMyVoteSelected(value: string) {
    const btn = this.page.locator(`button[data-vote="${value}"]`)
    await expect(btn).toHaveClass(/bg-indigo-600/)
    await expect(btn).toHaveClass(/scale-110/)
  }

  async expectIsHost() {
    await expect(this.page.locator('#reset-btn')).toBeVisible()
  }

  async expectIsNotHost() {
    await expect(this.page.locator('#reset-btn')).not.toBeVisible()
  }

  async expectRoundNumber(num: number) {
    await expect(this.page.locator(`h1:has-text("Round ${num}")`)).toBeVisible()
  }

  async expectChatMessage(senderName: string, text: string) {
    const chatArea = this.page.locator('#chat-messages')
    await expect(chatArea.locator(`text=${text}`)).toBeVisible()
  }

  async expectStats(stats: { average?: string; median?: string; spread?: string }) {
    if (stats.average) {
      await expect(this.page.locator('text=Average').locator('..').locator('.text-2xl')).toHaveText(stats.average)
    }
    if (stats.median) {
      await expect(this.page.locator('text=Median').locator('..').locator('.text-2xl')).toHaveText(stats.median)
    }
    if (stats.spread) {
      await expect(this.page.locator('text=Spread').locator('..').locator('.text-2xl')).toHaveText(stats.spread)
    }
  }

  async expectConsensus() {
    // Check for the UI consensus indicator (the green text with emoji in the stats area)
    await expect(this.page.locator('.text-green-400', { hasText: 'Consensus!' })).toBeVisible()
  }

  async leaveRoom() {
    await this.page.click('#blackjack-btn')
    await this.page.waitForTimeout(100)
  }

  async disconnect() {
    await this.page.close()
  }

  async reconnect() {
    const newPage = await this.context.newPage()
    await newPage.goto(this.currentUrl)
    this.page = newPage
    await this.page.waitForSelector('.vote-btn', { timeout: 10000 })
  }

  async expectKicked() {
    await expect(this.page.locator('text=You were kicked from the room')).toBeVisible({ timeout: 5000 })
  }

  async getIdentity(): Promise<{ emoji: string; color: string }> {
    // Find this user's card by name and extract emoji and color
    const card = this.page.locator('.flex.flex-col.items-center', { hasText: this.name })
    const emoji = await card.locator('.text-lg').textContent() || ''
    // Get color from the name element's style (uses text-sm class)
    const nameEl = card.locator('.text-sm')
    const style = await nameEl.getAttribute('style') || ''
    const colorMatch = style.match(/color:\s*(#[0-9A-Fa-f]{6})/i)
    const color = colorMatch ? colorMatch[1].toUpperCase() : ''
    return { emoji: emoji.trim(), color }
  }

  async openStats() {
    await this.page.click('#stats-btn')
    await this.page.waitForSelector('#stats-panel', { timeout: 5000 })
  }

  async closeStats() {
    await this.page.click('#close-stats-btn')
    await this.page.waitForTimeout(100)
  }

  async expectStatsPanel() {
    await expect(this.page.locator('#stats-panel')).toBeVisible()
  }

  async expectStatsPanelContains(text: string) {
    await expect(this.page.locator('#stats-panel', { hasText: text })).toBeVisible()
  }

  async expectStatsPanelRounds(count: number) {
    const roundsValue = this.page.locator('#stats-panel .text-center:has-text("Rounds") .text-2xl')
    await expect(roundsValue).toHaveText(String(count))
  }

  async expectStatsPanelYahtzees(count: number) {
    const yahtzeeValue = this.page.locator('#stats-panel .text-center:has-text("Yahtzees") .text-2xl')
    await expect(yahtzeeValue).toHaveText(String(count))
  }
}

type CreateUsersFunction = (count: number) => Promise<TestUser[]>

export const test = base.extend<{ createUsers: CreateUsersFunction }>({
  createUsers: async ({ browser }, use) => {
    const users: TestUser[] = []
    const contexts: BrowserContext[] = []

    const createUsers: CreateUsersFunction = async (count: number) => {
      const newUsers: TestUser[] = []
      const startIndex = users.length

      for (let i = 0; i < count; i++) {
        const context = await browser.newContext()
        contexts.push(context)
        const page = await context.newPage()
        const name = USER_NAMES[startIndex + i] || `User${startIndex + i + 1}`
        const user = new TestUserImpl(page, context, name)
        newUsers.push(user)
        users.push(user)
      }

      return newUsers
    }

    await use(createUsers)

    // Cleanup
    for (const context of contexts) {
      await context.close()
    }
  },
})

export { expect }
