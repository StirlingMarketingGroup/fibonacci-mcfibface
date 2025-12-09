import { DurableObject } from 'cloudflare:workers'

interface Participant {
  id: string
  name: string
  emoji: string
  color: string
  vote: string | null
  left: boolean
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
  participants: Record<string, Participant>
  votes: Record<string, string> // participantId -> vote (persists across reconnects)
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

// High-contrast colors optimized for dark backgrounds
const CHAT_COLORS = [
  '#FF6B6B', // Soft Red
  '#4ECDC4', // Teal
  '#FFE66D', // Yellow
  '#95E1D3', // Mint
  '#F38181', // Coral
  '#AA96DA', // Lavender
  '#FCBAD3', // Pink
  '#A8E6CF', // Light Green
  '#DDA0DD', // Plum
  '#87CEEB', // Sky Blue
  '#F0E68C', // Khaki
  '#FFA07A', // Light Salmon
  '#98D8C8', // Seafoam
  '#FFB347', // Pastel Orange
  '#B19CD9', // Light Purple
]

// Funny join messages - {name} will be replaced with the user's name
const JOIN_MESSAGES = [
  '**{name}** has entered the arena',
  '**{name}** just slid into the room',
  '**{name}** appeared out of nowhere',
  'A wild **{name}** appeared!',
  '**{name}** has joined the party 🎉',
  '**{name}** is here to estimate things',
  'Everyone welcome **{name}**!',
  '**{name}** just spawned',
  '**{name}** has arrived fashionably late',
  '**{name}** rolled in like a tumbleweed',
  'It\'s dangerous to estimate alone! **{name}** joined',
  '**{name}** materialized from the void',
  '**{name}** teleported in',
  'The legend **{name}** has arrived',
  '**{name}** snuck in through the back door',
]

// Funny leave messages - {name} will be replaced with the user's name
const LEAVE_MESSAGES = [
  '**{name}** has left the building',
  '**{name}** vanished into thin air',
  '**{name}** yeeted themselves out',
  '**{name}** said "peace out" ✌️',
  '**{name}** has disconnected from the matrix',
  '**{name}** went to get coffee ☕',
  '**{name}** rage quit (probably)',
  '**{name}** was called to a meeting',
  '**{name}** found a better room (just kidding)',
  '**{name}** disappeared in a puff of smoke 💨',
  '**{name}** has fled the scene',
  '**{name}** noped out of here',
  '**{name}** took their ball and went home',
  '**{name}** exited stage left',
  '**{name}** is outta here!',
]

// Consensus celebration messages - {vote} will be replaced with the unanimous vote value
const CONSENSUS_MESSAGES = [
  '🎯 **YAHTZEE!** Everyone voted **{vote}**!',
  '🎉 **UNANIMOUS!** The council has spoken: **{vote}**',
  '🏆 **PERFECT CONSENSUS!** All voted **{vote}**!',
  '✨ **GREAT MINDS THINK ALIKE!** Everyone chose **{vote}**',
  '🎊 **FLAWLESS VICTORY!** Unanimous **{vote}**!',
  '🔮 **THE PROPHECY IS FULFILLED!** All see **{vote}**',
  '🎰 **JACKPOT!** Triple (or more) **{vote}**s!',
  '🤝 **TEAM SYNERGY ACTIVATED!** United on **{vote}**',
  '⚡ **HIVEMIND ENGAGED!** Collective vote: **{vote}**',
  '🌟 **LEGENDARY!** Perfect agreement on **{vote}**',
]

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getUsedIdentities(participants: Record<string, Participant>): Set<string> {
  const used = new Set<string>()
  for (const p of Object.values(participants)) {
    if (!p.left) {
      used.add(`${p.emoji}|${p.color}`)
    }
  }
  return used
}

function pickUniqueIdentity(
  participants: Record<string, Participant>
): { emoji: string; color: string } {
  const used = getUsedIdentities(participants)

  // Try to find an unused combination
  const shuffledEmojis = [...ANIMAL_EMOJIS].sort(() => Math.random() - 0.5)
  const shuffledColors = [...CHAT_COLORS].sort(() => Math.random() - 0.5)

  for (const emoji of shuffledEmojis) {
    for (const color of shuffledColors) {
      const key = `${emoji}|${color}`
      if (!used.has(key)) {
        return { emoji, color }
      }
    }
  }

  // Fallback if all combos are taken (750 combinations, very unlikely)
  return {
    emoji: randomFrom(ANIMAL_EMOJIS),
    color: randomFrom(CHAT_COLORS),
  }
}

interface WebSocketAttachment {
  participantId: string
}

export class RoomDO extends DurableObject {
  private state: RoomState | null = null

  private getParticipantId(ws: WebSocket): string | null {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null
    return attachment?.participantId ?? null
  }

  private setParticipantId(ws: WebSocket, participantId: string): void {
    ws.serializeAttachment({ participantId } satisfies WebSocketAttachment)
  }

  private async getState(): Promise<RoomState> {
    if (!this.state) {
      const stored = await this.ctx.storage.get<RoomState>('state')
      this.state = stored || {
        participants: {},
        votes: {},
        revealed: false,
        hostId: null,
        roundNumber: 1,
        chat: [],
      }
      // Migration: add chat array if missing
      if (!this.state.chat) {
        this.state.chat = []
      }
      // Migration: add votes object if missing
      if (!this.state.votes) {
        this.state.votes = {}
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
    // Don't remove participant on disconnect - they stay in the room
    // They only leave if they explicitly click "Leave" or get kicked by host
    // This allows reconnection without losing their spot
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
        let isReconnection = false

        if (requestedId && state.participants[requestedId]) {
          // Reconnecting - participant still in state
          participantId = requestedId
          participant = state.participants[requestedId]
          participant.name = data.name as string // Allow name updates

          if (participant.left) {
            // User who left is rejoining - unset left flag, broadcast to others
            participant.left = false
            isReconnection = false
          } else {
            // Brief network blip reconnection - don't broadcast
            isReconnection = true
          }
        } else if (requestedId && requestedEmoji && requestedColor) {
          // Rejoining with stored identity (e.g. after worker restart or page refresh)
          // Treat as new join so others see them
          participantId = requestedId
          participant = {
            id: participantId,
            name: data.name as string,
            emoji: requestedEmoji,
            color: requestedColor,
            vote: state.votes[requestedId] || null, // Restore vote from persistent storage
            left: false,
          }
          state.participants[participantId] = participant
          // Not a reconnection - broadcast to others
        } else {
          // New participant - pick unique emoji+color combo
          participantId = crypto.randomUUID()
          const identity = pickUniqueIdentity(state.participants)
          const emoji = requestedEmoji || identity.emoji
          const color = requestedColor || identity.color

          participant = {
            id: participantId,
            name: data.name as string,
            emoji,
            color,
            vote: null,
            left: false,
          }

          state.participants[participantId] = participant
        }

        this.setParticipantId(ws, participantId)

        // First participant becomes host
        if (!state.hostId) {
          state.hostId = participantId
        }

        await this.saveState()

        // Send current state to new participant
        // Hide vote values unless revealed (show hasVoted status instead)
        // But send the participant's own vote so they can restore their selection
        // Filter out left users
        const activeParticipants = Object.values(state.participants).filter(p => !p.left)
        const participantsForClient = activeParticipants.map(p => ({
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

          // Add funny join system message
          const joinMessage: ChatMessage = {
            id: crypto.randomUUID(),
            participantId: 'system',
            name: 'System',
            emoji: '👋',
            color: '#22C55E', // Green
            text: randomFrom(JOIN_MESSAGES).replace('{name}', participant.name),
            timestamp: Date.now(),
          }
          state.chat.push(joinMessage)
          if (state.chat.length > 100) {
            state.chat = state.chat.slice(-100)
          }
          await this.saveState()

          this.broadcast({ type: 'chat', message: joinMessage })
        }
        break
      }

      case 'vote': {
        const participantId = this.getParticipantId(ws)
        if (!participantId) return

        const participant = state.participants[participantId]
        if (!participant || state.revealed) return

        participant.vote = data.vote as string
        state.votes[participantId] = data.vote as string // Persist vote separately
        await this.saveState()

        this.broadcast({ type: 'vote_cast', participantId, hasVoted: true })

        // Check if everyone has voted (only consider active, non-left participants)
        const activeParticipants = Object.values(state.participants).filter(p => !p.left)
        const allVoted = activeParticipants.every(p => p.vote !== null)

        if (allVoted && activeParticipants.length > 0) {
          state.revealed = true
          await this.saveState()

          this.broadcast({
            type: 'reveal',
            votes: activeParticipants.map(p => ({
              participantId: p.id,
              vote: p.vote,
            })),
          })

          // Check for consensus (everyone voted the same) - only if 2+ participants
          if (activeParticipants.length >= 2) {
            const votes = activeParticipants.map(p => p.vote)
            const allSame = votes.every(v => v === votes[0])
            if (allSame && votes[0] !== null) {
              const consensusMessage: ChatMessage = {
                id: crypto.randomUUID(),
                participantId: 'system',
                name: 'System',
                emoji: '🎯',
                color: '#22C55E', // Green
                text: randomFrom(CONSENSUS_MESSAGES).replace('{vote}', votes[0]),
                timestamp: Date.now(),
              }
              state.chat.push(consensusMessage)
              if (state.chat.length > 100) {
                state.chat = state.chat.slice(-100)
              }
              await this.saveState()
              this.broadcast({ type: 'chat', message: consensusMessage })
            }
          }
        }
        break
      }

      case 'reset': {
        const participantId = this.getParticipantId(ws)
        if (participantId !== state.hostId) return

        // Clear all votes
        for (const participant of Object.values(state.participants)) {
          participant.vote = null
        }
        state.votes = {} // Clear persistent votes
        state.revealed = false
        state.roundNumber++
        await this.saveState()

        this.broadcast({ type: 'round_reset', roundNumber: state.roundNumber })
        break
      }

      case 'chat': {
        const participantId = this.getParticipantId(ws)
        if (!participantId) return

        const participant = state.participants[participantId]
        if (!participant) return

        const text = (data.text as string || '').trim()
        if (!text || text.length > 500) return // Max 500 chars

        const chatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          participantId,
          name: participant.name,
          emoji: participant.emoji,
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
        const requesterId = this.getParticipantId(ws)
        if (requesterId !== state.hostId) return // Only host can kick

        const targetId = data.participantId as string
        if (!targetId || targetId === requesterId) return // Can't kick yourself

        const targetParticipant = state.participants[targetId]
        if (!targetParticipant) return

        const targetName = targetParticipant.name

        // Find the target's WebSocket and close it
        for (const targetWs of this.ctx.getWebSockets()) {
          if (this.getParticipantId(targetWs) === targetId) {
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

        // Mark as left (kicked users can rejoin but their identity is preserved)
        targetParticipant.left = true
        targetParticipant.vote = null
        delete state.votes[targetId]

        // Add system message about the kick
        const systemMessage: ChatMessage = {
          id: crypto.randomUUID(),
          participantId: 'system',
          name: 'System',
          emoji: '⚠️',
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

      case 'leave': {
        const participantId = this.getParticipantId(ws)
        if (!participantId) return

        const participant = state.participants[participantId]
        if (!participant) return

        const participantName = participant.name

        // Mark participant as left (don't delete - they can rejoin with same identity)
        participant.left = true
        participant.vote = null
        delete state.votes[participantId]

        // Add funny leave system message
        const leaveMessage: ChatMessage = {
          id: crypto.randomUUID(),
          participantId: 'system',
          name: 'System',
          emoji: '👋',
          color: '#EAB308', // Yellow
          text: randomFrom(LEAVE_MESSAGES).replace('{name}', participantName),
          timestamp: Date.now(),
        }
        state.chat.push(leaveMessage)
        if (state.chat.length > 100) {
          state.chat = state.chat.slice(-100)
        }

        await this.saveState()

        // Notify others
        this.broadcast({ type: 'participant_left', participantId })
        this.broadcast({ type: 'chat', message: leaveMessage })

        // Close the connection
        try {
          ws.close(1000, 'User left room')
        } catch {
          // Socket might already be closed
        }
        break
      }

      case 'burn': {
        const requesterId = this.getParticipantId(ws)
        if (requesterId !== state.hostId) return // Only host can burn

        // Notify all clients the room is being deleted
        this.broadcast({ type: 'room_burned' })

        // Close all WebSocket connections
        for (const clientWs of this.ctx.getWebSockets()) {
          try {
            clientWs.close(1000, 'Room deleted by host')
          } catch {
            // Socket might already be closed
          }
        }

        // Clear all state
        await this.ctx.storage.deleteAll()
        this.state = null
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
