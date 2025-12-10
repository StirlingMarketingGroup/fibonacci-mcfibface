import { RoomDO } from './room'

export { RoomDO }

interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>
}

export default {
  // Scheduled handler to keep worker warm
  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Just a no-op ping to prevent cold starts
    console.log('Keepalive ping at', new Date().toISOString())
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Upgrade, Connection',
        },
      })
    }

    // Health check for tests
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 })
    }

    // Room routes: /room/:id
    const roomMatch = url.pathname.match(/^\/room\/([a-zA-Z0-9]+)$/)
    if (roomMatch) {
      const roomId = roomMatch[1]
      const id = env.ROOMS.idFromName(roomId)
      const room = env.ROOMS.get(id)

      const response = await room.fetch(request)

      // Add CORS headers
      const newHeaders = new Headers(response.headers)
      newHeaders.set('Access-Control-Allow-Origin', '*')

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
        webSocket: response.webSocket,
      })
    }

    return new Response('Not found', { status: 404 })
  },
}
