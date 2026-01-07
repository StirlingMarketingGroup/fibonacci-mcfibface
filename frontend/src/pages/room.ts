import { getName, setName, getRoomIdentity, setRoomIdentity } from '../lib/storage'
import { RoomConnection } from '../lib/websocket'
import { navigate } from '../lib/router'
import { checkForUpdate } from '../lib/version'
import { encrypt, decrypt, getKeyFromUrl, isEncrypted } from '../lib/crypto'
import confetti from 'canvas-confetti'
import { marked } from 'marked'

// Decrypt names embedded in system message text (wrapped in **...**)
async function decryptSystemMessageText(text: string, key: string): Promise<string> {
  // System messages embed names in bold: **encryptedName**
  // Find all bold patterns and decrypt if they look encrypted
  const boldPattern = /\*\*([^*]+)\*\*/g
  const matches = [...text.matchAll(boldPattern)]

  let result = text
  for (const match of matches) {
    const possiblyEncrypted = match[1]
    if (isEncrypted(possiblyEncrypted)) {
      const decrypted = await decrypt(possiblyEncrypted, key)
      result = result.replace(`**${possiblyEncrypted}**`, `**${decrypted}**`)
    }
  }

  return result
}

// Decrypt names in session stats
async function decryptSessionStats(stats: SessionStats, key: string): Promise<SessionStats> {
  const decryptName = async (obj: { name: string; emoji: string } | null) => {
    if (obj && isEncrypted(obj.name)) {
      obj.name = await decrypt(obj.name, key)
    }
  }

  await Promise.all([
    decryptName(stats.fastestVoter),
    decryptName(stats.slowestVoter),
    decryptName(stats.mostConsensus),
    decryptName(stats.leastConsensus),
    decryptName(stats.chaosAgent),
    decryptName(stats.highestAvg),
    decryptName(stats.lowestAvg),
  ])

  return stats
}

// Configure marked for inline-only rendering (no block elements)
marked.use({
  renderer: {
    paragraph: (token) => token.text, // Remove <p> wrapper
  },
})

interface Participant {
  id: string
  name: string
  emoji: string
  color: string
  vote: string | null
}

interface ChatMessage {
  id: string
  participantId: string
  name: string
  emoji: string
  color: string
  text: string
  timestamp: number
}

interface SessionStats {
  sessionDurationMins: number
  totalRounds: number
  yahtzeeCount: number
  fastestVoter: { name: string; emoji: string; avgMs: number } | null
  slowestVoter: { name: string; emoji: string; avgMs: number } | null
  mostConsensus: { name: string; emoji: string; rate: number } | null
  leastConsensus: { name: string; emoji: string; rate: number } | null
  chaosAgent: { name: string; emoji: string; count: number } | null
  highestAvg: { name: string; emoji: string; avg: number } | null
  lowestAvg: { name: string; emoji: string; avg: number } | null
}

interface ElectionCandidate {
  id: string
  name: string
  emoji: string
}

interface HostElection {
  candidates: ElectionCandidate[]
  votedCount: number
  totalVoters: number
  hasVoted: boolean
}

interface RoomState {
  participantId: string | null
  emoji: string | null
  color: string | null
  hostId: string | null
  participants: Participant[]
  revealed: boolean
  roundNumber: number
  myVote: string | null
  chat: ChatMessage[]
  sessionStats: SessionStats | null
  encryptionKey: string | null
  hostElection: HostElection | null
}

const POINT_VALUES = ['.5', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕', '🦆']

// GIF stickers - name to URL mapping
const STICKERS: Record<string, { url: string; alt: string }> = {
  'nope': { url: 'https://media.giphy.com/media/wYyTHMm50f4Dm/giphy.gif', alt: 'Bird shaking head no' },
  'yes': { url: 'https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif', alt: 'Nodding yes' },
  'think': { url: 'https://media.giphy.com/media/CaiVJuZGvR8HK/giphy.gif', alt: 'Thinking intensely' },
  'facepalm': { url: 'https://media.giphy.com/media/XsUtdIeJ0MWMo/giphy.gif', alt: 'Facepalm' },
  'panic': { url: 'https://media.giphy.com/media/HUkOv6BNWc1HO/giphy.gif', alt: 'Panicking' },
  'fine': { url: 'https://media.giphy.com/media/QMHoU66sBXqqLqYvGO/giphy.gif', alt: 'This is fine' },
  'celebrate': { url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif', alt: 'Celebrating' },
  'mindblown': { url: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif', alt: 'Mind blown' },
  'thumbsup': { url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif', alt: 'Thumbs up' },
  'waiting': { url: 'https://media.giphy.com/media/tXL4FHPSnVJ0A/giphy.gif', alt: 'Waiting impatiently' },
  'coffee': { url: 'https://media.giphy.com/media/DrJm6F9poo4aA/giphy.gif', alt: 'Need coffee' },
  'confused': { url: 'https://media.giphy.com/media/WRQBXSCnEFJIuxktnw/giphy.gif', alt: 'Confused math' },
}

// Slash commands - maps command to replacement text
const SLASH_COMMANDS: Record<string, string> = {
  '/shrug': '¯\\\\_(ツ)_/¯',
  '/tableflip': '(╯°□°)╯︵ ┻━┻',
  '/unflip': '┬─┬ノ( º _ ºノ)',
  '/disapprove': 'ಠ_ಠ',
  '/lenny': '( ͡° ͜ʖ ͡°)',
  '/fight': '(ง\'̀-\'́)ง',
  '/magic': '(ﾉ◕ヮ◕)ﾉ*:・ﾟ✧',
  '/sparkles': '✧･ﾟ: *✧･ﾟ:*',
  '/bear': 'ʕ•ᴥ•ʔ',
  '/hi': '(◕‿◕)ノ',
  '/cry': '(╥﹏╥)',
  '/what': '(⊙_⊙)?',
  '/cool': '(⌐■_■)',
  '/deal': '(•_•) ( •_•)>⌐■-■ (⌐■_■)',
  '/flex': 'ᕦ(ò_óˇ)ᕤ',
  '/run': 'ε=ε=ε=┌(;*´Д`)ノ',
  '/hug': '(づ｡◕‿‿◕｡)づ',
  '/zzz': '(-.-)zzZ',
  '/dance': '┏(・o・)┛♪┗ (・o・) ┓♪',
  '/help': '**Slash commands:** /shrug /tableflip /unflip /disapprove /lenny /fight /magic /sparkles /bear /hi /cry /what /cool /deal /flex /run /hug /zzz /dance',
}

function processSlashCommand(text: string): string {
  const trimmed = text.trim()
  // Check if the entire message is a slash command
  if (SLASH_COMMANDS[trimmed]) {
    return SLASH_COMMANDS[trimmed]
  }
  // Check if the message starts with a slash command followed by space or end
  for (const [cmd, replacement] of Object.entries(SLASH_COMMANDS)) {
    if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
      return trimmed.replace(cmd, replacement)
    }
  }
  return text
}

function fireConfetti() {
  const duration = 3000
  const end = Date.now() + duration

  const frame = () => {
    // Launch from left
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors: ['#6366f1', '#8b5cf6', '#a855f7', '#22c55e', '#eab308'],
    })
    // Launch from right
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors: ['#6366f1', '#8b5cf6', '#a855f7', '#22c55e', '#eab308'],
    })

    if (Date.now() < end) {
      requestAnimationFrame(frame)
    }
  }

  frame()
}

let connection: RoomConnection | null = null
let state: RoomState = {
  participantId: null,
  emoji: null,
  color: null,
  hostId: null,
  participants: [],
  revealed: false,
  roundNumber: 1,
  myVote: null,
  chat: [],
  sessionStats: null,
  encryptionKey: null,
  hostElection: null,
}

export function renderRoomPage(roomId: string) {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const name = getName()

  // Get encryption key from URL fragment
  const encryptionKey = getKeyFromUrl()
  if (!encryptionKey) {
    // No encryption key - show error
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-screen p-8">
        <div class="text-6xl mb-4">🔒</div>
        <h1 class="text-2xl font-bold mb-2 text-red-400">Missing Encryption Key</h1>
        <p class="text-gray-400 mb-6 text-center max-w-md">
          This room uses end-to-end encryption. The encryption key is missing from the URL.
          Please ask the room creator for the full link including the key.
        </p>
        <button
          id="back-btn"
          class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          Back to Home
        </button>
      </div>
    `
    document.querySelector('#back-btn')?.addEventListener('click', () => navigate('/'))
    return
  }

  // Store encryption key in state
  state.encryptionKey = encryptionKey

  // If no name, prompt for it
  if (!name) {
    renderNamePrompt(app, roomId)
    return
  }

  // Connect to room
  connectToRoom(app, roomId, name)
}

function renderNamePrompt(app: HTMLDivElement, roomId: string) {
  app.innerHTML = `
    <div class="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 class="text-3xl font-bold mb-2">Join Room</h1>
      <p class="text-gray-400 mb-8">Enter your name to join</p>

      <div class="w-full max-w-sm space-y-4">
        <input
          type="text"
          id="name-input"
          placeholder="Your name"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />

        <button
          id="join-btn"
          disabled
          class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors"
        >
          Join
        </button>
      </div>
    </div>
  `

  const nameInput = document.querySelector<HTMLInputElement>('#name-input')!
  const joinBtn = document.querySelector<HTMLButtonElement>('#join-btn')!

  nameInput.addEventListener('input', () => {
    joinBtn.disabled = !nameInput.value.trim()
  })

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const name = nameInput.value.trim()
      if (!name) return
      setName(name)
      connectToRoom(app, roomId, name)
    }
  })

  joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim()
    if (!name) return
    setName(name)
    connectToRoom(app, roomId, name)
  })
}

async function connectToRoom(app: HTMLDivElement, roomId: string, name: string) {
  app.innerHTML = `
    <div class="flex items-center justify-center min-h-screen">
      <p class="text-gray-400">Connecting...</p>
    </div>
  `

  connection = new RoomConnection(roomId)

  connection.on('joined', async (data) => {
    const participantId = data.participantId as string
    const participants = data.participants as Participant[]
    const chat = (data.chat as ChatMessage[]) || []

    // Decrypt participant names and chat messages
    const encryptionKey = state.encryptionKey
    if (encryptionKey) {
      await Promise.all(participants.map(async (p) => {
        if (isEncrypted(p.name)) {
          p.name = await decrypt(p.name, encryptionKey)
        }
      }))
      await Promise.all(chat.map(async (m) => {
        if (m.participantId === 'system') {
          // System messages may have encrypted names embedded in bold (**name**)
          m.text = await decryptSystemMessageText(m.text, encryptionKey)
        } else {
          if (isEncrypted(m.name)) {
            m.name = await decrypt(m.name, encryptionKey)
          }
          if (isEncrypted(m.text)) {
            m.text = await decrypt(m.text, encryptionKey)
          }
        }
      }))
    }

    // Restore myVote from participant data (server sends our actual vote back to us)
    const me = participants.find((p) => p.id === participantId)
    const myVote = me?.vote && me.vote !== 'hidden' ? me.vote : null

    state = {
      participantId,
      emoji: data.emoji as string,
      color: data.color as string,
      hostId: data.hostId as string,
      participants,
      revealed: data.revealed as boolean,
      roundNumber: data.roundNumber as number,
      myVote,
      chat,
      sessionStats: null,
      encryptionKey,
      hostElection: null,
    }
    // Save identity for reconnection
    setRoomIdentity(roomId, state.participantId!, state.emoji!, state.color!)
    renderRoom(app, roomId)
    // Request stats if room is already revealed (e.g., joining mid-session)
    if (state.revealed) {
      connection?.send({ type: 'get_stats' })
    }
  })

  connection.on('participant_joined', async (data) => {
    const newParticipant = data.participant as Participant
    // Decrypt participant name
    if (state.encryptionKey && isEncrypted(newParticipant.name)) {
      newParticipant.name = await decrypt(newParticipant.name, state.encryptionKey)
    }
    // Check if participant already exists (prevent duplicates on reconnection)
    const existingIndex = state.participants.findIndex((p) => p.id === newParticipant.id)
    if (existingIndex >= 0) {
      // Update existing participant
      state.participants[existingIndex] = newParticipant
    } else {
      // Add new participant
      state.participants.push(newParticipant)
    }
    renderRoom(app, roomId)
  })

  connection.on('participant_left', (data) => {
    state.participants = state.participants.filter((p) => p.id !== data.participantId)
    renderRoom(app, roomId)
  })

  connection.on('vote_cast', (data) => {
    const participant = state.participants.find((p) => p.id === data.participantId)
    if (participant) {
      participant.vote = data.hasVoted ? 'hidden' : null
    }
    renderRoom(app, roomId)
  })

  connection.on('reveal', (data) => {
    state.revealed = true
    const votes = data.votes as Array<{ participantId: string; vote: string }>
    votes.forEach((v) => {
      const participant = state.participants.find((p) => p.id === v.participantId)
      if (participant) {
        participant.vote = v.vote
      }
    })
    // Request session stats to display in results
    connection?.send({ type: 'get_stats' })
    renderRoom(app, roomId)
  })

  connection.on('round_reset', (data) => {
    state.revealed = false
    state.roundNumber = data.roundNumber as number
    state.myVote = null
    state.sessionStats = null // Clear stats on new round
    state.participants.forEach((p) => (p.vote = null))
    renderRoom(app, roomId)
  })

  connection.on('chat', async (data) => {
    const message = data.message as ChatMessage
    // Decrypt chat message
    if (state.encryptionKey) {
      if (message.participantId === 'system') {
        // System messages may have encrypted names embedded in bold (**name**)
        message.text = await decryptSystemMessageText(message.text, state.encryptionKey)
      } else {
        if (isEncrypted(message.name)) {
          message.name = await decrypt(message.name, state.encryptionKey)
        }
        if (isEncrypted(message.text)) {
          message.text = await decrypt(message.text, state.encryptionKey)
        }
      }
    }
    state.chat.push(message)
    // Keep last 100 messages
    if (state.chat.length > 100) {
      state.chat = state.chat.slice(-100)
    }
    appendChatMessage(message)
  })

  connection.on('reconnecting', () => {
    showConnectionStatus('reconnecting')
  })

  connection.on('connected', () => {
    showConnectionStatus('connected')
    // Check for updates on reconnection
    checkForUpdate()
  })

  connection.on('kicked', () => {
    connection?.disconnect()
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-screen p-8">
        <p class="text-red-400 text-xl mb-4">You were kicked from the room</p>
        <button
          id="back-home-btn"
          class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg mb-4"
        >
          Back to Home
        </button>
        <button
          id="blackjack-btn"
          class="text-gray-500 hover:text-gray-300 text-sm underline"
          title="I'm gonna go start my own room, with blackjack and hookers!"
        >
          Start my own room, with blackjack and "friends"
        </button>
      </div>
    `
    document.querySelector('#back-home-btn')?.addEventListener('click', () => navigate('/'))
    document.querySelector('#blackjack-btn')?.addEventListener('click', () => navigate('/'))
  })

  connection.on('room_burned', () => {
    connection?.disconnect()
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-screen p-8">
        <div class="text-6xl mb-4">🔥</div>
        <p class="text-gray-300 text-xl mb-2">This room has been deleted</p>
        <p class="text-gray-500 mb-6">The host burned the room</p>
        <button
          id="create-new-btn"
          class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg mb-4"
        >
          Create New Room
        </button>
        <button
          id="blackjack-btn"
          class="text-gray-500 hover:text-gray-300 text-sm underline"
          title="I'm gonna go start my own room, with blackjack and hookers!"
        >
          Start my own room, with blackjack and "friends"
        </button>
      </div>
    `
    document.querySelector('#create-new-btn')?.addEventListener('click', () => navigate('/'))
    document.querySelector('#blackjack-btn')?.addEventListener('click', () => navigate('/'))
  })

  connection.on('stats', async (data) => {
    let stats = data.stats as SessionStats
    // Decrypt names in stats
    if (state.encryptionKey) {
      stats = await decryptSessionStats(stats, state.encryptionKey)
    }
    // Always store stats and re-render to update the sidebar panel
    state.sessionStats = stats
    renderRoom(app, roomId)
  })

  connection.on('host_election_started', async (data) => {
    const candidates = data.candidates as ElectionCandidate[]
    // Decrypt candidate names
    if (state.encryptionKey) {
      await Promise.all(candidates.map(async (c) => {
        if (isEncrypted(c.name)) {
          c.name = await decrypt(c.name, state.encryptionKey!)
        }
      }))
    }
    state.hostElection = {
      candidates,
      votedCount: 0,
      totalVoters: state.participants.length,
      hasVoted: false,
    }
    showHostElectionModal(app, roomId)
  })

  connection.on('host_election_progress', (data) => {
    if (state.hostElection) {
      state.hostElection.votedCount = data.votedCount as number
      state.hostElection.totalVoters = data.totalVoters as number
      updateElectionProgress()
    }
  })

  connection.on('host_election_ended', (data) => {
    state.hostId = data.hostId as string
    state.hostElection = null
    hideHostElectionModal()
    renderRoom(app, roomId)
  })

  connection.on('host_changed', (data) => {
    state.hostId = data.hostId as string
    state.hostElection = null
    hideHostElectionModal()
    renderRoom(app, roomId)
  })

  try {
    await connection.connect()
    const existingIdentity = getRoomIdentity(roomId)
    // Encrypt name before sending to server
    const encryptedName = state.encryptionKey
      ? await encrypt(name, state.encryptionKey)
      : name
    connection.send({
      type: 'join',
      name: encryptedName,
      participantId: existingIdentity?.participantId,
      emoji: existingIdentity?.emoji,
      color: existingIdentity?.color,
    })
  } catch {
    app.innerHTML = `
      <div class="flex flex-col items-center justify-center min-h-screen p-8">
        <p class="text-red-400 mb-4">Failed to connect to room</p>
        <button
          id="back-btn"
          class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          Back to Home
        </button>
      </div>
    `
    document.querySelector('#back-btn')?.addEventListener('click', () => navigate('/'))
  }
}

function getChatEmoji(message: ChatMessage): string {
  // Show crown for host, otherwise show their animal emoji
  return message.participantId === state.hostId ? '👑' : (message.emoji || '')
}

function appendChatMessage(message: ChatMessage) {
  const chatMessages = document.querySelector('#chat-messages')
  if (!chatMessages) return

  const div = document.createElement('div')
  div.className = 'text-sm py-1'

  if (message.participantId === 'system') {
    // System messages: muted gray text, centered, italic
    div.className = 'text-sm py-1 text-center'
    div.innerHTML = `<span class="text-gray-500 italic">${renderMarkdown(message.text)}</span>`
  } else {
    // Regular user messages - show crown for host
    const emoji = getChatEmoji(message)
    div.innerHTML = `<span class="mr-1">${emoji}</span><span style="color: ${message.color}" class="font-bold">${escapeHtml(message.name)}</span><span class="text-gray-300">: ${renderMarkdown(message.text)}</span>`
  }

  chatMessages.appendChild(div)

  const scrollToBottom = () => {
    chatMessages.scrollTop = chatMessages.scrollHeight
  }

  // Scroll immediately for text content
  scrollToBottom()

  // Also scroll when any images in the message finish loading
  div.querySelectorAll('img').forEach((img) => {
    img.addEventListener('load', scrollToBottom)
  })

  // Process link unfurling
  processUnfurlPlaceholders(div)
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Valid effects for stackable syntax
const VALID_EFFECTS = new Set([
  'rainbow', 'shake', 'glow', 'party', 'wave', 'scroll', 'flash', 'slide',
  'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'white'
])

function processStackableEffects(text: string): string {
  // Match pattern: effect:effect:...:text (effects are alphanumeric, text is anything after last colon)
  // Example: wave:glow:cyan:buying gf
  const match = text.match(/^((?:[a-z]+:)+)(.+)$/i)
  if (!match) return text

  const effectsPart = match[1] // "wave:glow:cyan:"
  const textPart = match[2]    // "buying gf"

  const effects = effectsPart.slice(0, -1).split(':') // Remove trailing colon and split
  const validEffects = effects.filter(e => VALID_EFFECTS.has(e.toLowerCase()))

  if (validEffects.length === 0) return text

  const classes = validEffects.map(e => `effect-${e.toLowerCase()}`).join(' ')
  return `<span class="${classes}">${textPart}</span>`
}

// Link metadata type
interface LinkMetadata {
  title: string
  siteName?: string
  description?: string
  image?: string
  favicon?: string
}

// Cache for unfurled link metadata
const linkMetadataCache = new Map<string, LinkMetadata>()

// Get the API base URL for unfurling
function getApiBaseUrl(): string {
  // In development, use the local worker; in production, use the deployed worker
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8787'
  }
  return 'https://fibonacci-mcfibface.stirlingmarketinggroup.workers.dev'
}

// Fetch link metadata from our worker proxy
async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  // Check cache first
  if (linkMetadataCache.has(url)) {
    return linkMetadataCache.get(url)!
  }

  try {
    const apiUrl = `${getApiBaseUrl()}/api/unfurl?url=${encodeURIComponent(url)}`
    const response = await fetch(apiUrl)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const data = await response.json()
    const metadata: LinkMetadata = {
      title: data.title || new URL(url).hostname,
      siteName: data.siteName,
      description: data.description,
      image: data.image,
      favicon: data.favicon,
    }
    linkMetadataCache.set(url, metadata)
    return metadata
  } catch {
    // Fallback to hostname
    try {
      const hostname = new URL(url).hostname
      const metadata: LinkMetadata = { title: hostname }
      linkMetadataCache.set(url, metadata)
      return metadata
    } catch {
      return { title: url }
    }
  }
}

// Create a link preview card element
function createLinkPreviewCard(url: string, metadata: LinkMetadata): HTMLElement {
  const card = document.createElement('div')
  card.className = 'link-preview'

  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    hostname = url
  }

  const hasImage = metadata.image && metadata.image.length > 0
  const hasFavicon = metadata.favicon && metadata.favicon.length > 0
  const hasDescription = metadata.description && metadata.description.length > 0

  // Try OG image first, then favicon, then fallback to emoji with gradient
  let imagePart: string
  if (hasImage) {
    // OG image - on error, try favicon, then fallback to emoji
    const faviconFallback = hasFavicon
      ? `this.onerror=function(){this.onerror=null;this.classList.add(\\'link-preview-favicon\\');this.src=\\'${escapeHtml(metadata.favicon!).replace(/'/g, "\\'")}\\';};`
      : `this.onerror=null;this.outerHTML='<div class=\\'link-preview-fallback\\'>🔗</div>';`
    imagePart = `<img src="${escapeHtml(metadata.image!)}" class="link-preview-image" alt="" onerror="${faviconFallback}" />`
  } else if (hasFavicon) {
    // No OG image but has favicon - on error, fallback to emoji
    imagePart = `<img src="${escapeHtml(metadata.favicon!)}" class="link-preview-favicon" alt="" onerror="this.onerror=null;this.outerHTML='<div class=\\'link-preview-fallback\\'>🔗</div>'" />`
  } else {
    // No image or favicon - show emoji with gradient
    imagePart = `<div class="link-preview-fallback">🔗</div>`
  }

  card.innerHTML = `
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
      ${imagePart}
      <div class="link-preview-content">
        <div class="link-preview-title">${escapeHtml(metadata.title)}</div>
        ${hasDescription ? `<div class="link-preview-description">${escapeHtml(metadata.description!)}</div>` : ''}
        <div class="link-preview-domain">${metadata.siteName ? escapeHtml(metadata.siteName) + ' - ' : ''}${escapeHtml(hostname)}</div>
      </div>
    </a>
  `

  return card
}

// Process unfurl placeholders in the DOM
async function processUnfurlPlaceholders(container: Element) {
  const placeholders = container.querySelectorAll('.unfurl-placeholder')
  for (const placeholder of placeholders) {
    const url = placeholder.getAttribute('data-url')
    if (!url) continue

    // Skip if already processed
    if (placeholder.classList.contains('unfurl-loaded')) continue
    placeholder.classList.add('unfurl-loaded')

    // Fetch metadata asynchronously
    fetchLinkMetadata(url).then(metadata => {
      // Replace placeholder with proper link
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.className = 'text-indigo-400 hover:text-indigo-300 underline'
      // Use siteName for the link text if available, otherwise use title
      link.textContent = `(Link to ${metadata.siteName || metadata.title})`
      placeholder.replaceWith(link)

      // Always add a preview card after the message
      const messageDiv = link.closest('.text-sm.py-1')
      if (messageDiv && !messageDiv.querySelector('.link-preview')) {
        const previewCard = createLinkPreviewCard(url, metadata)
        messageDiv.appendChild(previewCard)

        // Scroll chat to bottom when preview card is added
        const chatMessages = document.querySelector('#chat-messages')
        if (chatMessages) {
          chatMessages.scrollTop = chatMessages.scrollHeight
        }
      }
    })
  }
}

function renderMarkdown(text: string): string {
  // Process stackable effects first (RuneScape style: effect:effect:text)
  let processed = processStackableEffects(text)

  // Also support legacy syntax: !effect text! (for backwards compatibility)
  processed = processed
    .replace(/!rainbow ([^!]+)!/g, '<span class="effect-rainbow">$1</span>')
    .replace(/!shake ([^!]+)!/g, '<span class="effect-shake">$1</span>')
    .replace(/!glow ([^!]+)!/g, '<span class="effect-glow">$1</span>')
    .replace(/!party ([^!]+)!/g, '<span class="effect-party">$1</span>')
    .replace(/!wave ([^!]+)!/g, '<span class="effect-wave">$1</span>')
    .replace(/!flash ([^!]+)!/g, '<span class="effect-flash">$1</span>')
    .replace(/!scroll ([^!]+)!/g, '<span class="effect-scroll">$1</span>')
    .replace(/!slide ([^!]+)!/g, '<span class="effect-slide">$1</span>')

  // Convert GIF URLs to inline images (common GIF hosts)
  processed = processed.replace(
    /(https?:\/\/[^\s]+\.gif(?:\?[^\s]*)?)/gi,
    '<img src="$1" class="chat-sticker" alt="sticker" />'
  )

  // Also support tenor/giphy embed URLs
  processed = processed.replace(
    /https?:\/\/tenor\.com\/view\/[^\s]+/gi,
    (match) => `<img src="${match}.gif" class="chat-sticker" alt="sticker" onerror="this.outerHTML=this.src" />`
  )

  // Convert remaining plain URLs to unfurl placeholders (not in markdown link syntax)
  // This regex matches URLs that aren't already in markdown link syntax or converted to images
  processed = processed.replace(
    /(?<![(\[])(https?:\/\/[^\s<>"]+)(?![)\]])/gi,
    (match) => {
      // Skip if it's already been converted to an image tag
      if (match.includes('<img')) return match
      // Skip image URLs (common extensions)
      if (/\.(gif|png|jpg|jpeg|webp|svg)(\?|$)/i.test(match)) return match
      // Create unfurl placeholder
      const escaped = match.replace(/"/g, '&quot;')
      return `<span class="unfurl-placeholder text-indigo-400" data-url="${escaped}">${match}</span>`
    }
  )

  // Use marked for inline markdown (bold, italic, code, links, strikethrough)
  return marked.parseInline(processed) as string
}

function showConnectionStatus(status: 'connected' | 'reconnecting') {
  let indicator = document.querySelector('#connection-status')

  if (status === 'connected') {
    // Hide and remove after fade
    if (indicator) {
      indicator.classList.add('opacity-0')
      setTimeout(() => indicator?.remove(), 300)
    }
    return
  }

  // Show reconnecting indicator
  if (!indicator) {
    indicator = document.createElement('div')
    indicator.id = 'connection-status'
    indicator.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-yellow-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-opacity duration-300 z-50'
    document.body.appendChild(indicator)
  }

  indicator.innerHTML = `
    <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Reconnecting...</span>
  `
  indicator.classList.remove('opacity-0')
}

function renderRoom(app: HTMLDivElement, roomId: string) {
  const isHost = state.participantId === state.hostId
  // Include encryption key in shareable URL
  const roomUrl = state.encryptionKey
    ? `${window.location.origin}/room/${roomId}#${state.encryptionKey}`
    : `${window.location.origin}/room/${roomId}`

  // Preserve chat input value and focus before re-render
  const existingChatInput = document.querySelector<HTMLTextAreaElement>('#chat-input')
  const chatInputValue = existingChatInput?.value || ''
  const chatInputFocused = document.activeElement === existingChatInput
  const chatInputSelectionStart = existingChatInput?.selectionStart || 0
  const chatInputSelectionEnd = existingChatInput?.selectionEnd || 0

  app.innerHTML = `
    <div class="h-screen flex">
      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Header -->
        <header class="bg-gray-800 border-b border-gray-700 p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <h1 class="text-xl font-bold">Round ${state.roundNumber}</h1>
              <button
                id="copy-url-btn"
                class="text-sm text-gray-400 hover:text-white flex items-center gap-2"
              >
                <span class="truncate max-w-xs">${roomUrl}</span>
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <div class="flex items-center gap-2">
              ${isHost ? `
                <button
                  id="reset-btn"
                  class="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm"
                >
                  Reset Round
                </button>
                <button
                  id="burn-btn"
                  class="bg-red-900 hover:bg-red-800 text-red-300 py-2 px-3 rounded-lg text-sm"
                  title="Delete this room permanently"
                >
                  🔥
                </button>
              ` : ''}
              <a
                href="https://github.com/StirlingMarketingGroup/fibonacci-mcfibface"
                target="_blank"
                rel="noopener noreferrer"
                class="text-gray-400 hover:text-white p-2"
                title="View on GitHub"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                </svg>
              </a>
              <button
                id="blackjack-btn"
                class="text-gray-500 hover:text-gray-300 p-2"
                title="I'm gonna go start my own room, with blackjack and hookers!"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <!-- Participants -->
        <main class="flex-1 p-8 overflow-auto">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            ${state.participants.map((p) => renderParticipantCard(p, isHost)).join('')}
          </div>

          ${state.revealed ? renderStats() : ''}
        </main>

        <!-- Voting buttons -->
        <footer class="bg-gray-800 border-t border-gray-700 p-4">
          <div class="flex flex-wrap justify-center gap-2">
            ${POINT_VALUES.map((value) => `
              <button
                data-vote="${value}"
                class="vote-btn w-12 h-12 rounded-lg font-bold text-lg transition-all ${
                  state.myVote === value
                    ? 'bg-indigo-600 text-white scale-110'
                    : 'bg-gray-700 hover:bg-gray-600 text-white'
                } ${state.revealed ? 'opacity-50 cursor-not-allowed' : ''}"
                ${state.revealed ? 'disabled' : ''}
              >
                ${value}
              </button>
            `).join('')}
          </div>
        </footer>
      </div>

      <!-- Chat sidebar -->
      <div class="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
        <div class="p-3 border-b border-gray-700 font-bold">Chat</div>
        <div id="chat-messages" class="flex-1 p-3 overflow-y-auto space-y-1">
          ${state.chat.map((m) => m.participantId === 'system'
            ? `<div class="text-sm py-1 text-center"><span class="text-gray-500 italic">${renderMarkdown(m.text)}</span></div>`
            : `<div class="text-sm py-1"><span class="mr-1">${getChatEmoji(m)}</span><span style="color: ${m.color}" class="font-bold">${escapeHtml(m.name)}</span><span class="text-gray-300">: ${renderMarkdown(m.text)}</span></div>`
          ).join('')}
        </div>
        <div class="p-3 border-t border-gray-700">
          <div class="flex gap-2 items-start">
            <textarea
              id="chat-input"
              placeholder="Send a message"
              maxlength="500"
              rows="1"
              class="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none overflow-hidden"
              style="min-height: 38px; max-height: 120px;"
            ></textarea>
            <div class="relative flex items-center" style="height: 38px;">
              <button type="button" id="sticker-btn" class="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-lg flex items-center justify-center" title="Stickers">
                🎭
              </button>
              <div id="sticker-picker" class="absolute bottom-10 right-0 w-72 p-2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl hidden z-50">
                <div class="text-xs text-gray-400 mb-2 font-bold">Stickers</div>
                <div class="grid grid-cols-4 gap-1">
                  ${Object.entries(STICKERS).map(([name, sticker]) => `
                    <button type="button" class="sticker-option p-1 rounded hover:bg-gray-700 transition-colors" data-sticker-url="${sticker.url}" title="${sticker.alt}">
                      <img src="${sticker.url}" alt="${sticker.alt}" class="w-14 h-14 object-cover rounded" loading="lazy" />
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="relative group flex items-center" style="height: 38px;">
              <button type="button" class="w-6 h-6 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-xs font-bold flex items-center justify-center">?</button>
              <div class="absolute bottom-8 right-0 w-64 p-3 bg-gray-800 border border-gray-600 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div class="text-xs text-gray-300 space-y-2">
                  <div class="font-bold text-white mb-2">Chat Formatting</div>
                  <div><span class="text-gray-400">**bold**</span> → <strong>bold</strong></div>
                  <div><span class="text-gray-400">*italic*</span> → <em>italic</em></div>
                  <div><span class="text-gray-400">\`code\`</span> → <code class="bg-gray-700 px-1 rounded">code</code></div>
                  <div><span class="text-gray-400">~~strike~~</span> → <del>strike</del></div>
                  <div class="font-bold text-white mt-3 mb-2">Text Effects (stackable!)</div>
                  <div><span class="text-gray-400">wave:glow:cyan:text</span></div>
                  <div class="text-gray-500 text-[10px]">rainbow, shake, glow, party, wave, scroll, flash, slide</div>
                  <div class="text-gray-500 text-[10px]">Colors: red, orange, yellow, green, cyan, blue, purple, pink</div>
                  <div class="font-bold text-white mt-3 mb-2">Slash Commands</div>
                  <div class="text-gray-400">/shrug /tableflip /lenny /help</div>
                  <div class="font-bold text-white mt-3 mb-2">Stickers</div>
                  <div class="text-gray-400">Click 🎭 or paste any .gif URL</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  // Scroll chat to bottom
  const chatMessages = document.querySelector('#chat-messages')
  if (chatMessages) {
    const scrollToBottom = () => {
      chatMessages.scrollTop = chatMessages.scrollHeight
    }
    scrollToBottom()

    // Scroll to bottom when any image loads (they change container height)
    chatMessages.querySelectorAll('img').forEach((img) => {
      img.addEventListener('load', scrollToBottom)
    })

    // Also use ResizeObserver for dynamically added images
    const resizeObserver = new ResizeObserver(scrollToBottom)
    resizeObserver.observe(chatMessages)

    // Process link unfurling for existing chat messages
    processUnfurlPlaceholders(chatMessages)
  }

  // Event listeners
  document.querySelector('#copy-url-btn')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(roomUrl)
    const btn = document.querySelector('#copy-url-btn')
    if (btn) {
      const original = btn.innerHTML
      btn.innerHTML = '<span class="text-green-400">Copied!</span>'
      setTimeout(() => (btn.innerHTML = original), 2000)
    }
  })

  document.querySelector('#reset-btn')?.addEventListener('click', () => {
    connection?.send({ type: 'reset' })
  })

  document.querySelector('#burn-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to permanently delete this room? This cannot be undone.')) {
      connection?.send({ type: 'burn' })
    }
  })


  document.querySelector('#blackjack-btn')?.addEventListener('click', () => {
    connection?.send({ type: 'leave' })
    connection?.disconnect() // Prevent reconnection when server closes the socket
    navigate('/')
  })

  document.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.revealed) return
      const vote = btn.getAttribute('data-vote')
      if (vote) {
        state.myVote = vote
        connection?.send({ type: 'vote', vote })

        // Update my own participant
        const me = state.participants.find((p) => p.id === state.participantId)
        if (me) me.vote = 'hidden'

        renderRoom(app, roomId)
      }
    })
  })

  // Kick button handlers (host only)
  document.querySelectorAll('.kick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const participantId = btn.getAttribute('data-kick')
      if (participantId) {
        connection?.send({ type: 'kick', participantId })
      }
    })
  })

  // Chat input with auto-grow
  const chatInput = document.querySelector<HTMLTextAreaElement>('#chat-input')
  if (chatInput) {
    // Restore preserved chat input value and focus
    if (chatInputValue) {
      chatInput.value = chatInputValue
      chatInput.setSelectionRange(chatInputSelectionStart, chatInputSelectionEnd)
    }
    if (chatInputFocused) {
      chatInput.focus()
    }

    const autoGrow = () => {
      chatInput.style.height = 'auto'
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px'
    }

    // Run auto-grow on restored content
    autoGrow()

    chatInput.addEventListener('input', autoGrow)

    chatInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const rawText = chatInput.value.trim()
        if (rawText) {
          const text = processSlashCommand(rawText)
          // Encrypt chat message before sending
          const encryptedText = state.encryptionKey
            ? await encrypt(text, state.encryptionKey)
            : text
          const sent = connection?.send({ type: 'chat', text: encryptedText })
          if (sent) {
            chatInput.value = ''
            autoGrow()
          }
        }
      }
    })
  }

  // Sticker picker
  const stickerBtn = document.querySelector<HTMLButtonElement>('#sticker-btn')
  const stickerPicker = document.querySelector<HTMLDivElement>('#sticker-picker')
  if (stickerBtn && stickerPicker) {
    stickerBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      stickerPicker.classList.toggle('hidden')
    })

    // Close picker when clicking outside
    document.addEventListener('click', (e) => {
      if (!stickerPicker.contains(e.target as Node) && e.target !== stickerBtn) {
        stickerPicker.classList.add('hidden')
      }
    })

    // Handle sticker selection
    document.querySelectorAll('.sticker-option').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = btn.getAttribute('data-sticker-url')
        if (url) {
          // Encrypt sticker URL before sending
          const encryptedText = state.encryptionKey
            ? await encrypt(url, state.encryptionKey)
            : url
          const sent = connection?.send({ type: 'chat', text: encryptedText })
          if (sent) {
            stickerPicker.classList.add('hidden')
          }
        }
      })
    })
  }
}

function renderParticipantCard(participant: Participant, isCurrentUserHost: boolean): string {
  const isMe = participant.id === state.participantId
  const isParticipantHost = participant.id === state.hostId
  const hasVoted = participant.vote !== null
  const showVote = state.revealed && participant.vote
  const canKick = isCurrentUserHost && !isMe

  let cardContent: string
  if (showVote) {
    cardContent = `<span class="text-2xl font-bold">${participant.vote}</span>`
  } else if (hasVoted) {
    cardContent = `<span class="text-3xl">🃏</span>`
  } else {
    cardContent = `<span class="text-gray-500">...</span>`
  }

  return `
    <div class="flex flex-col items-center relative group">
      ${canKick ? `
        <button
          data-kick="${participant.id}"
          class="kick-btn absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10"
          title="Kick ${participant.name}"
        >✕</button>
      ` : ''}
      <div class="w-20 h-28 rounded-lg flex items-center justify-center ${
        showVote
          ? 'bg-indigo-600'
          : hasVoted
          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 voted'
          : 'bg-gray-700 border-2 border-dashed border-gray-600 not-voted'
      }">
        ${cardContent}
      </div>
      <div class="mt-2 text-center">
        <span class="text-lg">${isParticipantHost ? '👑' : participant.emoji}</span>
        <span class="text-sm" style="color: ${participant.color || '#9CA3AF'}">${participant.name}${isMe ? ' (you)' : ''}</span>
      </div>
    </div>
  `
}

function renderSessionAwards(): string {
  const stats = state.sessionStats
  if (!stats) return ''

  const awards: string[] = []

  if (stats.fastestVoter) {
    awards.push(`
      <div class="bg-gray-800 rounded-lg p-3 flex flex-col items-center min-w-[100px]">
        <span class="text-2xl mb-1">⚡</span>
        <span class="text-xs text-gray-400 mb-1">Speed Demon</span>
        <span class="text-sm font-bold text-yellow-400">${stats.fastestVoter.emoji} ${stats.fastestVoter.name}</span>
        <span class="text-xs text-gray-500">${formatTime(stats.fastestVoter.avgMs)}</span>
      </div>
    `)
  }

  if (stats.slowestVoter && stats.slowestVoter.name !== stats.fastestVoter?.name) {
    awards.push(`
      <div class="bg-gray-800 rounded-lg p-3 flex flex-col items-center min-w-[100px]">
        <span class="text-2xl mb-1">🐢</span>
        <span class="text-xs text-gray-400 mb-1">Deep Thinker</span>
        <span class="text-sm font-bold text-blue-400">${stats.slowestVoter.emoji} ${stats.slowestVoter.name}</span>
        <span class="text-xs text-gray-500">${formatTime(stats.slowestVoter.avgMs)}</span>
      </div>
    `)
  }

  if (stats.mostConsensus && stats.mostConsensus.rate > 0) {
    awards.push(`
      <div class="bg-gray-800 rounded-lg p-3 flex flex-col items-center min-w-[100px]">
        <span class="text-2xl mb-1">🤝</span>
        <span class="text-xs text-gray-400 mb-1">Team Player</span>
        <span class="text-sm font-bold text-green-400">${stats.mostConsensus.emoji} ${stats.mostConsensus.name}</span>
        <span class="text-xs text-gray-500">${Math.round(stats.mostConsensus.rate * 100)}% agree</span>
      </div>
    `)
  }

  if (stats.leastConsensus && stats.leastConsensus.name !== stats.mostConsensus?.name && stats.leastConsensus.rate < 1) {
    awards.push(`
      <div class="bg-gray-800 rounded-lg p-3 flex flex-col items-center min-w-[100px]">
        <span class="text-2xl mb-1">🎭</span>
        <span class="text-xs text-gray-400 mb-1">Wild Card</span>
        <span class="text-sm font-bold text-purple-400">${stats.leastConsensus.emoji} ${stats.leastConsensus.name}</span>
        <span class="text-xs text-gray-500">${Math.round(stats.leastConsensus.rate * 100)}% agree</span>
      </div>
    `)
  }

  if (stats.chaosAgent && stats.chaosAgent.count > 0) {
    awards.push(`
      <div class="bg-gray-800 rounded-lg p-3 flex flex-col items-center min-w-[100px]">
        <span class="text-2xl mb-1">🦆</span>
        <span class="text-xs text-gray-400 mb-1">Chaos Agent</span>
        <span class="text-sm font-bold text-orange-400">${stats.chaosAgent.emoji} ${stats.chaosAgent.name}</span>
        <span class="text-xs text-gray-500">${stats.chaosAgent.count}x chaos</span>
      </div>
    `)
  }

  if (stats.highestAvg) {
    awards.push(`
      <div class="bg-gray-800 rounded-lg p-3 flex flex-col items-center min-w-[100px]">
        <span class="text-2xl mb-1">📈</span>
        <span class="text-xs text-gray-400 mb-1">Big Thinker</span>
        <span class="text-sm font-bold text-red-400">${stats.highestAvg.emoji} ${stats.highestAvg.name}</span>
        <span class="text-xs text-gray-500">avg ${stats.highestAvg.avg.toFixed(1)}</span>
      </div>
    `)
  }

  if (stats.lowestAvg && stats.lowestAvg.name !== stats.highestAvg?.name) {
    awards.push(`
      <div class="bg-gray-800 rounded-lg p-3 flex flex-col items-center min-w-[100px]">
        <span class="text-2xl mb-1">🎯</span>
        <span class="text-xs text-gray-400 mb-1">Minimalist</span>
        <span class="text-sm font-bold text-cyan-400">${stats.lowestAvg.emoji} ${stats.lowestAvg.name}</span>
        <span class="text-xs text-gray-500">avg ${stats.lowestAvg.avg.toFixed(1)}</span>
      </div>
    `)
  }

  if (awards.length === 0) return ''

  return `
    <div class="mt-6 pt-4 border-t border-gray-700">
      <div class="flex items-center justify-center gap-3 mb-4">
        <span class="text-lg font-bold text-gray-200">🏆 Session Awards</span>
        <span class="text-sm text-gray-500">${stats.totalRounds} round${stats.totalRounds !== 1 ? 's' : ''} · ${stats.yahtzeeCount} yahtzee${stats.yahtzeeCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="flex flex-wrap justify-center gap-3">
        ${awards.join('')}
      </div>
    </div>
  `
}

function renderStats(): string {
  const numericVotes = state.participants
    .map((p) => parseFloat(p.vote || ''))
    .filter((v) => !isNaN(v))

  if (numericVotes.length === 0) {
    return ''
  }

  const sum = numericVotes.reduce((a, b) => a + b, 0)
  const avg = sum / numericVotes.length
  const sorted = [...numericVotes].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const spread = sorted[sorted.length - 1] - sorted[0]

  const allSame = numericVotes.every((v) => v === numericVotes[0])

  // Trigger confetti on consensus!
  if (allSame && numericVotes.length > 1) {
    fireConfetti()
  }

  return `
    <div class="mt-8 p-6 bg-gray-800 rounded-lg">
      <h2 class="text-lg font-bold mb-4">Results</h2>
      <div class="grid grid-cols-3 gap-4 text-center">
        <div>
          <div class="text-2xl font-bold text-indigo-400">${avg.toFixed(1)}</div>
          <div class="text-sm text-gray-400">Average</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-indigo-400">${median}</div>
          <div class="text-sm text-gray-400">Median</div>
        </div>
        <div>
          <div class="text-2xl font-bold text-indigo-400">${spread}</div>
          <div class="text-sm text-gray-400">Spread</div>
        </div>
      </div>
      ${allSame ? `
        <div class="mt-4 text-center text-green-400 font-bold">
          🎉 Consensus!
        </div>
      ` : ''}
      ${renderSessionAwards()}
    </div>
  `
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

function hideHostElectionModal() {
  const existing = document.querySelector('#election-modal')
  if (existing) existing.remove()
}

function updateElectionProgress() {
  const progressEl = document.querySelector('#election-progress')
  if (progressEl && state.hostElection) {
    progressEl.textContent = `${state.hostElection.votedCount} / ${state.hostElection.totalVoters} votes cast`
  }
}

function showHostElectionModal(app: HTMLDivElement, roomId: string) {
  // Remove existing modal if present
  hideHostElectionModal()

  if (!state.hostElection) return

  const candidates = state.hostElection.candidates
  // Filter out ourselves - we can't vote for ourselves as #1 choice, but we CAN be a candidate
  const otherCandidates = candidates.filter(c => c.id !== state.participantId)
  const me = candidates.find(c => c.id === state.participantId)

  const modal = document.createElement('div')
  modal.id = 'election-modal'
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50'
  modal.innerHTML = `
    <div class="bg-gray-900 rounded-xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
      <div class="text-center mb-6">
        <div class="text-4xl mb-2">👑</div>
        <h2 class="text-2xl font-bold">Host Election</h2>
        <p class="text-gray-400 text-sm mt-2">The host has left! Rank your preferences for the new host.</p>
        <p id="election-progress" class="text-gray-500 text-xs mt-1">${state.hostElection.votedCount} / ${state.hostElection.totalVoters} votes cast</p>
      </div>

      ${state.hostElection.hasVoted ? `
        <div class="text-center py-8">
          <div class="text-3xl mb-2">✅</div>
          <p class="text-gray-300">Vote submitted!</p>
          <p class="text-gray-500 text-sm">Waiting for others to vote...</p>
        </div>
      ` : `
        <div class="mb-4">
          <p class="text-sm text-gray-400 mb-2">Drag to reorder. Top = first choice.</p>
          <div id="candidate-list" class="space-y-2">
            ${otherCandidates.map((c, i) => `
              <div
                class="candidate-item flex items-center gap-3 p-3 bg-gray-800 rounded-lg cursor-move hover:bg-gray-700 transition-colors"
                data-candidate-id="${c.id}"
                draggable="true"
              >
                <span class="text-gray-500 font-bold w-6">${i + 1}.</span>
                <span class="text-xl">${c.emoji}</span>
                <span class="flex-1 font-medium">${escapeHtmlForElection(c.name)}</span>
                <span class="text-gray-500">☰</span>
              </div>
            `).join('')}
          </div>
          ${me ? `
            <p class="text-xs text-gray-500 mt-2 text-center">You (${me.emoji} ${escapeHtmlForElection(me.name)}) are automatically included at the end of your ranking.</p>
          ` : ''}
        </div>

        <button
          id="submit-vote-btn"
          class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
        >
          Submit Vote
        </button>
      `}
    </div>
  `

  document.body.appendChild(modal)

  // Set up drag and drop if not already voted
  if (!state.hostElection.hasVoted) {
    setupDragAndDrop()

    document.querySelector('#submit-vote-btn')?.addEventListener('click', () => {
      submitHostVote(app, roomId)
    })
  }
}

function escapeHtmlForElection(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function setupDragAndDrop() {
  const list = document.querySelector('#candidate-list')
  if (!list) return

  let draggedItem: HTMLElement | null = null

  list.querySelectorAll('.candidate-item').forEach(item => {
    const el = item as HTMLElement

    el.addEventListener('dragstart', (e) => {
      draggedItem = el
      el.classList.add('opacity-50')
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move'
      }
    })

    el.addEventListener('dragend', () => {
      el.classList.remove('opacity-50')
      draggedItem = null
      updateRankNumbers()
    })

    el.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move'
      }
    })

    el.addEventListener('dragenter', (e) => {
      e.preventDefault()
      if (draggedItem && draggedItem !== el) {
        el.classList.add('border-2', 'border-indigo-500')
      }
    })

    el.addEventListener('dragleave', () => {
      el.classList.remove('border-2', 'border-indigo-500')
    })

    el.addEventListener('drop', (e) => {
      e.preventDefault()
      el.classList.remove('border-2', 'border-indigo-500')

      if (draggedItem && draggedItem !== el) {
        const listEl = list as HTMLElement
        const items = [...listEl.querySelectorAll('.candidate-item')]
        const draggedIndex = items.indexOf(draggedItem)
        const targetIndex = items.indexOf(el)

        if (draggedIndex < targetIndex) {
          el.parentNode?.insertBefore(draggedItem, el.nextSibling)
        } else {
          el.parentNode?.insertBefore(draggedItem, el)
        }
        updateRankNumbers()
      }
    })
  })
}

function updateRankNumbers() {
  const list = document.querySelector('#candidate-list')
  if (!list) return

  list.querySelectorAll('.candidate-item').forEach((item, index) => {
    const rankSpan = item.querySelector('span')
    if (rankSpan) {
      rankSpan.textContent = `${index + 1}.`
    }
  })
}

function submitHostVote(app: HTMLDivElement, roomId: string) {
  if (!state.hostElection || state.hostElection.hasVoted) return

  const list = document.querySelector('#candidate-list')
  if (!list) return

  // Get rankings in order
  const rankings: string[] = []
  list.querySelectorAll('.candidate-item').forEach(item => {
    const candidateId = item.getAttribute('data-candidate-id')
    if (candidateId) {
      rankings.push(candidateId)
    }
  })

  // Add ourselves at the end if we're a candidate
  const me = state.hostElection.candidates.find(c => c.id === state.participantId)
  if (me) {
    rankings.push(me.id)
  }

  // Send vote
  connection?.send({ type: 'host_vote', rankings })

  // Update UI to show waiting state
  state.hostElection.hasVoted = true
  showHostElectionModal(app, roomId)
}
