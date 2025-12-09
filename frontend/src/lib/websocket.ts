export type MessageHandler = (data: Record<string, unknown>) => void

const API_HOST = import.meta.env.PROD
  ? 'fibonacci-mcfibface-api.b-a92.workers.dev'
  : window.location.host

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000] // Exponential backoff
const PING_INTERVAL = 30000 // 30 seconds
const PONG_TIMEOUT = 10000 // 10 seconds to receive pong

export class RoomConnection {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private manualDisconnect = false
  private joinData: Record<string, unknown> | null = null
  private pingTimer: number | null = null
  private pongTimer: number | null = null

  constructor(private roomId: string) {}

  private getUrl(): string {
    const isLocalApi = API_HOST === window.location.host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = isLocalApi ? `/api/room/${this.roomId}` : `/room/${this.roomId}`
    return `${protocol}//${API_HOST}${path}`
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.pingTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
        // Set timeout for pong response
        this.pongTimer = window.setTimeout(() => {
          console.log('Pong timeout - connection dead, reconnecting')
          this.ws?.close()
        }, PONG_TIMEOUT)
      }
    }, PING_INTERVAL)
  }

  private stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer)
      this.pongTimer = null
    }
  }

  private setupWebSocket(ws: WebSocket, onFirstConnect?: () => void) {
    ws.onopen = () => {
      this.reconnectAttempt = 0
      // Re-send join message on reconnect
      if (this.joinData) {
        ws.send(JSON.stringify(this.joinData))
      }
      this.startHeartbeat()
      onFirstConnect?.()
      const handlers = this.handlers.get('connected') || []
      handlers.forEach((handler) => handler({ type: 'connected' }))
    }

    ws.onerror = () => {
      // Will trigger onclose
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        // Handle pong response
        if (data.type === 'pong') {
          if (this.pongTimer) {
            clearTimeout(this.pongTimer)
            this.pongTimer = null
          }
          return
        }

        const handlers = this.handlers.get(data.type) || []
        handlers.forEach((handler) => handler(data))
      } catch (e) {
        console.error('Failed to parse message:', e)
      }
    }

    ws.onclose = () => {
      this.stopHeartbeat()
      if (!this.manualDisconnect) {
        this.scheduleReconnect()
      }
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.manualDisconnect = false
      this.ws = new WebSocket(this.getUrl())

      // Special handling for first connect - reject on error
      const originalOnError = this.ws.onerror
      this.ws.onerror = () => {
        if (this.reconnectAttempt === 0) {
          reject(new Error('WebSocket connection failed'))
        }
        originalOnError?.call(this.ws)
      }

      this.setupWebSocket(this.ws, resolve)
    })
  }

  private scheduleReconnect() {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt++

    // Notify about reconnecting status
    const handlers = this.handlers.get('reconnecting') || []
    handlers.forEach((handler) => handler({ type: 'reconnecting', attempt: this.reconnectAttempt }))

    this.reconnectTimer = window.setTimeout(() => {
      this.ws = new WebSocket(this.getUrl())
      this.setupWebSocket(this.ws)
    }, delay)
  }

  on(type: string, handler: MessageHandler) {
    const handlers = this.handlers.get(type) || []
    handlers.push(handler)
    this.handlers.set(type, handlers)
  }

  send(data: Record<string, unknown>): boolean {
    // Store join data for reconnection
    if (data.type === 'join') {
      this.joinData = data
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
      return true
    }
    return false
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  disconnect() {
    this.manualDisconnect = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
  }
}
