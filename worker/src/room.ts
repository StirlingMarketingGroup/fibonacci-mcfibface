import { DurableObject } from 'cloudflare:workers'

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
  participants: Record<string, Participant>
  revealed: boolean
  hostId: string | null
  roundNumber: number
  chat: ChatMessage[]
}

const ANIMAL_EMOJIS = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
  '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋',
  '🐌', '🐞', '🐜', '🦟', '🦗', '🐢', '🐍', '🦎', '🦖', '🦕',
  '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
]

// Twitch-style chat colors
const CHAT_COLORS = [
  '#FF0000', // Red
  '#0000FF', // Blue
  '#008000', // Green
  '#B22222', // FireBrick
  '#FF7F50', // Coral
  '#9ACD32', // YellowGreen
  '#FF4500', // OrangeRed
  '#2E8B57', // SeaGreen
  '#DAA520', // GoldenRod
  '#D2691E', // Chocolate
  '#5F9EA0', // CadetBlue
  '#1E90FF', // DodgerBlue
  '#FF69B4', // HotPink
  '#8A2BE2', // BlueViolet
  '#00FF7F', // SpringGreen
]

export class RoomDO extends DurableObject {
  private sessions: Map<WebSocket, string> = new Map()
  private state: RoomState | null = null

  private async getState(): Promise<RoomState> {
    if (!this.state) {
      const stored = await this.ctx.storage.get<RoomState>('state')
      this.state = stored || {
        participants: {},
        revealed: false,
        hostId: null,
        roundNumber: 1,
        chat: [],
      }
      // Migration: add chat array if missing
      if (!this.state.chat) {
        this.state.chat = []
      }
    }
    return this.state
  }

  private async saveState(): Promise<void> {
    if (this.state) {
      await this.ctx.storage.put('state', this.state)
    }
  }

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)

      this.ctx.acceptWebSocket(server)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // HTTP GET - return room state
    if (request.method === 'GET') {
      const state = await this.getState()
      return Response.json({
        participants: Object.values(state.participants),
        revealed: state.revealed,
        roundNumber: state.roundNumber,
      })
    }

    return new Response('Not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return

    try {
      const data = JSON.parse(message)

      // Handle ping/pong for keepalive
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
        return
      }

      await this.handleMessage(ws, data)
    } catch (e) {
      console.error('Failed to parse message:', e)
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('WebSocket error:', error)
    // Clean up on error
    await this.webSocketClose(ws)
  }

  async webSocketClose(ws: WebSocket) {
    const participantId = this.sessions.get(ws)
    if (participantId) {
      const state = await this.getState()
      delete state.participants[participantId]
      this.sessions.delete(ws)
      await this.saveState()

      this.broadcast({ type: 'participant_left', participantId })

      // If host left, assign new host
      if (state.hostId === participantId) {
        const participantIds = Object.keys(state.participants)
        state.hostId = participantIds[0] || null
        await this.saveState()
        if (state.hostId) {
          this.broadcast({ type: 'host_changed', hostId: state.hostId })
        }
      }
    }
  }

  private async handleMessage(ws: WebSocket, data: Record<string, unknown>) {
    const state = await this.getState()

    switch (data.type) {
      case 'join': {
        const requestedId = data.participantId as string | undefined
        const requestedEmoji = data.emoji as string | undefined
        const requestedColor = data.color as string | undefined

        // Check if this is a reconnecting participant
        let participant: Participant
        let participantId: string

        if (requestedId && state.participants[requestedId]) {
          // Reconnecting - update their session
          participantId = requestedId
          participant = state.participants[requestedId]
          participant.name = data.name as string // Allow name updates
        } else {
          // New participant
          participantId = crypto.randomUUID()
          const emoji = requestedEmoji || ANIMAL_EMOJIS[Math.floor(Math.random() * ANIMAL_EMOJIS.length)]
          const color = requestedColor || CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)]

          participant = {
            id: participantId,
            name: data.name as string,
            emoji,
            color,
            vote: null,
          }

          state.participants[participantId] = participant
        }

        const isReconnection = requestedId && requestedId === participantId

        this.sessions.set(ws, participantId)

        // First participant becomes host
        if (!state.hostId) {
          state.hostId = participantId
        }

        await this.saveState()

        // Send current state to new participant
        // Hide vote values unless revealed (show hasVoted status instead)
        // But send the participant's own vote so they can restore their selection
        const participantsForClient = Object.values(state.participants).map(p => ({
          ...p,
          vote: state.revealed ? p.vote : (p.id === participantId ? p.vote : (p.vote ? 'hidden' : null)),
        }))

        // Send last 50 chat messages
        const recentChat = state.chat.slice(-50)

        ws.send(JSON.stringify({
          type: 'joined',
          participantId,
          emoji: participant.emoji,
          color: participant.color,
          hostId: state.hostId,
          participants: participantsForClient,
          revealed: state.revealed,
          roundNumber: state.roundNumber,
          chat: recentChat,
        }))

        // Only broadcast participant_joined for new participants, not reconnections
        if (!isReconnection) {
          this.broadcast({
            type: 'participant_joined',
            participant: {
              ...participant,
              vote: state.revealed ? participant.vote : (participant.vote ? 'hidden' : null),
            },
          }, ws)
        }
        break
      }

      case 'vote': {
        const participantId = this.sessions.get(ws)
        if (!participantId) return

        const participant = state.participants[participantId]
        if (!participant || state.revealed) return

        participant.vote = data.vote as string
        await this.saveState()

        this.broadcast({ type: 'vote_cast', participantId, hasVoted: true })

        // Check if everyone has voted
        const participants = Object.values(state.participants)
        const allVoted = participants.every(p => p.vote !== null)

        if (allVoted && participants.length > 0) {
          state.revealed = true
          await this.saveState()

          this.broadcast({
            type: 'reveal',
            votes: participants.map(p => ({
              participantId: p.id,
              vote: p.vote,
            })),
          })
        }
        break
      }

      case 'reset': {
        const participantId = this.sessions.get(ws)
        if (participantId !== state.hostId) return

        // Clear all votes
        for (const participant of Object.values(state.participants)) {
          participant.vote = null
        }
        state.revealed = false
        state.roundNumber++
        await this.saveState()

        this.broadcast({ type: 'round_reset', roundNumber: state.roundNumber })
        break
      }

      case 'chat': {
        const participantId = this.sessions.get(ws)
        if (!participantId) return

        const participant = state.participants[participantId]
        if (!participant) return

        const text = (data.text as string || '').trim()
        if (!text || text.length > 500) return // Max 500 chars

        const chatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          participantId,
          name: participant.name,
          color: participant.color,
          text,
          timestamp: Date.now(),
        }

        state.chat.push(chatMessage)
        // Keep only last 100 messages
        if (state.chat.length > 100) {
          state.chat = state.chat.slice(-100)
        }
        await this.saveState()

        this.broadcast({ type: 'chat', message: chatMessage })
        break
      }

      case 'kick': {
        const requesterId = this.sessions.get(ws)
        if (requesterId !== state.hostId) return // Only host can kick

        const targetId = data.participantId as string
        if (!targetId || targetId === requesterId) return // Can't kick yourself

        const targetParticipant = state.participants[targetId]
        if (!targetParticipant) return

        const targetName = targetParticipant.name

        // Find the target's WebSocket and close it
        for (const [targetWs, participantId] of this.sessions.entries()) {
          if (participantId === targetId) {
            // Send kicked message to the target before closing
            try {
              targetWs.send(JSON.stringify({ type: 'kicked' }))
              targetWs.close(1000, 'Kicked by host')
            } catch {
              // Socket might already be closed
            }
            break
          }
        }

        // Remove from state
        delete state.participants[targetId]

        // Add system message about the kick
        const systemMessage: ChatMessage = {
          id: crypto.randomUUID(),
          participantId: 'system',
          name: 'System',
          color: '#EF4444', // Red
          text: `**${targetName}** was kicked from the room`,
          timestamp: Date.now(),
        }
        state.chat.push(systemMessage)
        if (state.chat.length > 100) {
          state.chat = state.chat.slice(-100)
        }

        await this.saveState()

        this.broadcast({ type: 'participant_left', participantId: targetId })
        this.broadcast({ type: 'chat', message: systemMessage })
        break
      }
    }
  }

  private broadcast(message: Record<string, unknown>, exclude?: WebSocket) {
    const messageStr = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(messageStr)
        } catch {
          // Socket might be closed
        }
      }
    }
  }
}
