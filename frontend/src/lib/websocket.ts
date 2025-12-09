export type MessageHandler = (data: Record<string, unknown>) => void

const API_HOST = import.meta.env.PROD
  ? 'fibonacci-mcfibface-api.b-a92.workers.dev'
  : window.location.host

export class RoomConnection {
  private ws: WebSocket | null = null
  private handlers: Map<string, MessageHandler[]> = new Map()

  constructor(private roomId: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const isLocalApi = API_HOST === window.location.host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const path = isLocalApi ? `/api/room/${this.roomId}` : `/room/${this.roomId}`
      const url = `${protocol}//${API_HOST}${path}`

      this.ws = new WebSocket(url)

      this.ws.onopen = () => resolve()
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'))

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
        const handlers = this.handlers.get('disconnected') || []
        handlers.forEach((handler) => handler({ type: 'disconnected' }))
      }
    })
  }

  on(type: string, handler: MessageHandler) {
    const handlers = this.handlers.get(type) || []
    handlers.push(handler)
    this.handlers.set(type, handlers)
  }

  send(data: Record<string, unknown>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
      return true
    }
    // Trigger disconnect if websocket is not open
    if (this.ws?.readyState !== WebSocket.CONNECTING) {
      const handlers = this.handlers.get('disconnected') || []
      handlers.forEach((handler) => handler({ type: 'disconnected' }))
    }
    return false
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  disconnect() {
    this.ws?.close()
  }
}
