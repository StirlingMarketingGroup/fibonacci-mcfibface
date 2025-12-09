import { DurableObject } from 'cloudflare:workers'

interface Participant {
  id: string
  name: string
  emoji: string
  vote: string | null
}

interface RoomState {
  participants: Map<string, Participant>
  revealed: boolean
  hostId: string | null
  roundNumber: number
}

const ANIMAL_EMOJIS = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
  '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋',
  '🐌', '🐞', '🐜', '🦟', '🦗', '🐢', '🐍', '🦎', '🦖', '🦕',
  '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳',
]

export class RoomDO extends DurableObject {
  private sessions: Map<WebSocket, string> = new Map()
  private state: RoomState = {
    participants: new Map(),
    revealed: false,
    hostId: null,
    roundNumber: 1,
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
      return Response.json({
        participants: Array.from(this.state.participants.values()),
        revealed: this.state.revealed,
        roundNumber: this.state.roundNumber,
      })
    }

    return new Response('Not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return

    try {
      const data = JSON.parse(message)
      await this.handleMessage(ws, data)
    } catch (e) {
      console.error('Failed to parse message:', e)
    }
  }

  async webSocketClose(ws: WebSocket) {
    const participantId = this.sessions.get(ws)
    if (participantId) {
      this.state.participants.delete(participantId)
      this.sessions.delete(ws)
      this.broadcast({ type: 'participant_left', participantId })

      // If host left, assign new host
      if (this.state.hostId === participantId) {
        const firstParticipant = this.state.participants.keys().next().value
        this.state.hostId = firstParticipant || null
        if (this.state.hostId) {
          this.broadcast({ type: 'host_changed', hostId: this.state.hostId })
        }
      }
    }
  }

  private async handleMessage(ws: WebSocket, data: Record<string, unknown>) {
    switch (data.type) {
      case 'join': {
        const requestedId = data.odI as string | undefined
        const requestedEmoji = data.emoji as string | undefined

        // Check if this is a reconnecting participant
        let participant: Participant
        let participantId: string

        if (requestedId && this.state.participants.has(requestedId)) {
          // Reconnecting - update their session
          participantId = requestedId
          participant = this.state.participants.get(requestedId)!
          participant.name = data.name as string // Allow name updates
        } else {
          // New participant
          participantId = requestedId || crypto.randomUUID()
          const emoji = requestedEmoji || ANIMAL_EMOJIS[Math.floor(Math.random() * ANIMAL_EMOJIS.length)]

          participant = {
            id: participantId,
            name: data.name as string,
            emoji,
            vote: null,
          }

          this.state.participants.set(participantId, participant)
        }

        this.sessions.set(ws, participantId)

        // First participant becomes host
        if (!this.state.hostId) {
          this.state.hostId = participantId
        }

        // Send current state to new participant
        // Hide vote values unless revealed (show hasVoted status instead)
        const participantsForClient = Array.from(this.state.participants.values()).map(p => ({
          ...p,
          vote: this.state.revealed ? p.vote : (p.vote ? 'hidden' : null),
        }))

        ws.send(JSON.stringify({
          type: 'joined',
          participantId,
          emoji: participant.emoji,
          hostId: this.state.hostId,
          participants: participantsForClient,
          revealed: this.state.revealed,
          roundNumber: this.state.roundNumber,
        }))

        // Broadcast to others
        this.broadcast({ type: 'participant_joined', participant }, ws)
        break
      }

      case 'vote': {
        const participantId = this.sessions.get(ws)
        if (!participantId) return

        const participant = this.state.participants.get(participantId)
        if (!participant || this.state.revealed) return

        participant.vote = data.vote as string
        this.broadcast({ type: 'vote_cast', participantId, hasVoted: true })

        // Check if everyone has voted
        const allVoted = Array.from(this.state.participants.values())
          .every(p => p.vote !== null)

        if (allVoted && this.state.participants.size > 0) {
          this.state.revealed = true
          this.broadcast({
            type: 'reveal',
            votes: Array.from(this.state.participants.values()).map(p => ({
              participantId: p.id,
              vote: p.vote,
            })),
          })
        }
        break
      }

      case 'reset': {
        const participantId = this.sessions.get(ws)
        if (participantId !== this.state.hostId) return

        // Clear all votes
        for (const participant of this.state.participants.values()) {
          participant.vote = null
        }
        this.state.revealed = false
        this.state.roundNumber++

        this.broadcast({ type: 'round_reset', roundNumber: this.state.roundNumber })
        break
      }
    }
  }

  private broadcast(message: Record<string, unknown>, exclude?: WebSocket) {
    const messageStr = JSON.stringify(message)
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        ws.send(messageStr)
      }
    }
  }
}
