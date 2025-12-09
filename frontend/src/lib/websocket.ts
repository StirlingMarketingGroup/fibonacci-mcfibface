export type MessageHandler = (data: Record<string, unknown>) => void

const API_HOST = import.meta.env.PROD
  ? 'fibonacci-mcfibface-api.b-a92.workers.dev'
  : window.location.host

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000] // Exponential backoff

export class RoomConnection {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private manualDisconnect = false
  private joinData: Record<string, unknown> | null = null

  constructor(private roomId: string) {}

  private getUrl(): string {
    const isLocalApi = API_HOST === window.location.host
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const path = isLocalApi ? `/api/room/${this.roomId}` : `/room/${this.roomId}`
    return `${protocol}//${API_HOST}${path}`
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.manualDisconnect = false
      this.ws = new WebSocket(this.getUrl())

      this.ws.onopen = () => {
        this.reconnectAttempt = 0
        // Re-send join message on reconnect
        if (this.joinData) {
          this.ws?.send(JSON.stringify(this.joinData))
        }
        resolve()
        const handlers = this.handlers.get('connected') || []
        handlers.forEach((handler) => handler({ type: 'connected' }))
      }

      this.ws.onerror = () => {
        if (this.reconnectAttempt === 0) {
          reject(new Error('WebSocket connection failed'))
        }
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const handlers = this.handlers.get(data.type) || []
          handlers.forEach((handler) => handler(data))
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }

      this.ws.onclose = () => {
        if (!this.manualDisconnect) {
          this.scheduleReconnect()
        }
      }
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

      this.ws.onopen = () => {
        this.reconnectAttempt = 0
        if (this.joinData) {
          this.ws?.send(JSON.stringify(this.joinData))
        }
        const connectedHandlers = this.handlers.get('connected') || []
        connectedHandlers.forEach((handler) => handler({ type: 'connected' }))
      }

      this.ws.onerror = () => {
        // Will trigger onclose which schedules next reconnect
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const messageHandlers = this.handlers.get(data.type) || []
          messageHandlers.forEach((handler) => handler(data))
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }

      this.ws.onclose = () => {
        if (!this.manualDisconnect) {
          this.scheduleReconnect()
        }
      }
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
  }
}
