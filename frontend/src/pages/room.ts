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
    state.participants.push(data.participant as Participant)
    renderRoom(app, roomId)
  })

  connection.on('participant_left', (data) => {
    state.participants = state.participants.filter((p) => p.id !== data.participantId)
    renderRoom(app, roomId)
  })

  connection.on('host_changed', (data) => {
    state.hostId = data.hostId as string
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
  div.innerHTML = `<span style="color: ${message.color}" class="font-bold">${escapeHtml(message.name)}</span><span class="text-gray-300">: ${renderMarkdown(message.text)}</span>`
  chatMessages.appendChild(div)
  chatMessages.scrollTop = chatMessages.scrollHeight
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function renderMarkdown(text: string): string {
  // Use marked for inline markdown (bold, italic, code, links, strikethrough)
  return marked.parseInline(text) as string
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
            ${isHost ? `
              <button
                id="reset-btn"
                class="bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm"
              >
                Reset Round
              </button>
            ` : ''}
          </div>
        </header>

        <!-- Participants -->
        <main class="flex-1 p-8 overflow-auto">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            ${state.participants.map((p) => renderParticipantCard(p)).join('')}
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
          ${state.chat.map((m) => `
            <div class="text-sm py-1">
              <span style="color: ${m.color}" class="font-bold">${escapeHtml(m.name)}</span><span class="text-gray-300">: ${renderMarkdown(m.text)}</span>
            </div>
          `).join('')}
        </div>
        <div class="p-3 border-t border-gray-700">
          <input
            type="text"
            id="chat-input"
            placeholder="Send a message"
            maxlength="500"
            class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
    </div>
  `

  // Scroll chat to bottom
  const chatMessages = document.querySelector('#chat-messages')
  if (chatMessages) {
    chatMessages.scrollTop = chatMessages.scrollHeight
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

  // Chat input
  const chatInput = document.querySelector<HTMLInputElement>('#chat-input')
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = chatInput.value.trim()
      if (text) {
        const sent = connection?.send({ type: 'chat', text })
        if (sent) {
          chatInput.value = ''
        }
      }
    }
  })
}

function renderParticipantCard(participant: Participant): string {
  const isMe = participant.id === state.participantId
  const hasVoted = participant.vote !== null
  const showVote = state.revealed && participant.vote

  let cardContent: string
  if (showVote) {
    cardContent = `<span class="text-2xl font-bold">${participant.vote}</span>`
  } else if (hasVoted) {
    cardContent = `<span class="text-3xl">🃏</span>`
  } else {
    cardContent = `<span class="text-gray-500">...</span>`
  }

  return `
    <div class="flex flex-col items-center">
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
        <span class="text-lg">${participant.emoji}</span>
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
