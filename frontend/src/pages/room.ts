import { getName, setName, getRoomIdentity, setRoomIdentity } from '../lib/storage'
import { RoomConnection } from '../lib/websocket'
import { navigate } from '../lib/router'
import confetti from 'canvas-confetti'
import { marked } from 'marked'

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
  '/shrug': '¯\\_(ツ)_/¯',
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
}

export function renderRoomPage(roomId: string) {
  const app = document.querySelector<HTMLDivElement>('#app')!
  const name = getName()

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

  connection.on('joined', (data) => {
    const participantId = data.participantId as string
    const participants = data.participants as Participant[]
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
      chat: (data.chat as ChatMessage[]) || [],
    }
    // Save identity for reconnection
    setRoomIdentity(roomId, state.participantId!, state.emoji!, state.color!)
    renderRoom(app, roomId)
  })

  connection.on('participant_joined', (data) => {
    const newParticipant = data.participant as Participant
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
    renderRoom(app, roomId)
  })

  connection.on('round_reset', (data) => {
    state.revealed = false
    state.roundNumber = data.roundNumber as number
    state.myVote = null
    state.participants.forEach((p) => (p.vote = null))
    renderRoom(app, roomId)
  })

  connection.on('chat', (data) => {
    const message = data.message as ChatMessage
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

  try {
    await connection.connect()
    const existingIdentity = getRoomIdentity(roomId)
    connection.send({
      type: 'join',
      name,
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
    // Regular user messages
    div.innerHTML = `<span class="mr-1">${message.emoji || ''}</span><span style="color: ${message.color}" class="font-bold">${escapeHtml(message.name)}</span><span class="text-gray-300">: ${renderMarkdown(message.text)}</span>`
  }

  chatMessages.appendChild(div)
  chatMessages.scrollTop = chatMessages.scrollHeight
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
  const roomUrl = `${window.location.origin}/room/${roomId}`

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
            : `<div class="text-sm py-1"><span class="mr-1">${m.emoji || ''}</span><span style="color: ${m.color}" class="font-bold">${escapeHtml(m.name)}</span><span class="text-gray-300">: ${renderMarkdown(m.text)}</span></div>`
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

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const rawText = chatInput.value.trim()
        if (rawText) {
          const text = processSlashCommand(rawText)
          const sent = connection?.send({ type: 'chat', text })
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
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-sticker-url')
        if (url) {
          const sent = connection?.send({ type: 'chat', text: url })
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
          ? 'bg-gradient-to-br from-indigo-600 to-purple-600'
          : 'bg-gray-700 border-2 border-dashed border-gray-600'
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
    </div>
  `
}
