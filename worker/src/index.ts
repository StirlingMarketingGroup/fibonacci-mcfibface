import { RoomDO } from './room'

export { RoomDO }

interface Env {
  ROOMS: DurableObjectNamespace<RoomDO>
}

export default {
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

    // URL unfurling endpoint for link previews
    if (url.pathname === '/api/unfurl') {
      const targetUrl = url.searchParams.get('url')
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      try {
        // Validate URL
        const parsedUrl = new URL(targetUrl)
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Invalid protocol')
        }

        // Fetch the page with a timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FibonacciBot/1.0; +https://fibonacci-mcfibface.pages.dev)',
            'Accept': 'text/html',
          },
          redirect: 'follow',
        })
        clearTimeout(timeoutId)

        // Check content-type, but still try to parse if it might be HTML
        const contentType = response.headers.get('content-type') || ''
        const mightBeHtml = contentType.includes('text/html') || contentType.includes('text/plain') || contentType === ''

        if (!mightBeHtml) {
          return new Response(JSON.stringify({ title: parsedUrl.hostname, favicon: parsedUrl.origin + '/favicon.ico' }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }

        // Helper to decode HTML entities (including numeric)
        const decodeEntities = (text: string) => text
          .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/&mdash;/g, '—')
          .replace(/&ndash;/g, '–')
          .replace(/&hellip;/g, '…')
          .replace(/&copy;/g, '©')
          .replace(/&reg;/g, '®')
          .replace(/&trade;/g, '™')
          .replace(/\s+/g, ' ')
          .trim()

        // Helper to resolve relative URLs
        const resolveUrl = (relativeUrl: string): string => {
          if (!relativeUrl || relativeUrl.startsWith('http')) return relativeUrl
          try {
            return new URL(relativeUrl, parsedUrl.origin).href
          } catch {
            return ''
          }
        }

        // Use HTMLRewriter to parse metadata
        const metadata: {
          title: string
          siteName: string
          description: string
          image: string
          favicon: string
          foundHead: boolean
        } = {
          title: '',
          siteName: '',
          description: '',
          image: '',
          favicon: '',
          foundHead: false,
        }

        // Create a pass-through response to process with HTMLRewriter
        const rewriter = new HTMLRewriter()
          .on('head', {
            element() {
              metadata.foundHead = true
            }
          })
          .on('title', {
            text(text) {
              if (!metadata.title) {
                metadata.title += text.text
              }
            }
          })
          .on('meta', {
            element(el) {
              const property = el.getAttribute('property')
              const name = el.getAttribute('name')
              const content = el.getAttribute('content')

              if (!content) return

              // OG metadata
              if (property === 'og:title' && !metadata.title) {
                metadata.title = content
              } else if (property === 'og:site_name' && !metadata.siteName) {
                metadata.siteName = content
              } else if (property === 'og:description' && !metadata.description) {
                metadata.description = content
              } else if (property === 'og:image' && !metadata.image) {
                metadata.image = content
              }

              // Twitter metadata fallbacks
              if (name === 'twitter:image' && !metadata.image) {
                metadata.image = content
              }

              // Standard meta description fallback
              if (name === 'description' && !metadata.description) {
                metadata.description = content
              }
            }
          })
          .on('link', {
            element(el) {
              const rel = el.getAttribute('rel') || ''
              const href = el.getAttribute('href')

              if (!href) return

              // Favicon detection (prefer apple-touch-icon, then icon)
              if (rel.includes('apple-touch-icon') && !metadata.favicon) {
                metadata.favicon = href
              } else if ((rel === 'icon' || rel === 'shortcut icon') && !metadata.favicon) {
                metadata.favicon = href
              }
            }
          })

        // Process the response through HTMLRewriter
        const transformed = rewriter.transform(response)
        await transformed.text() // Consume the response to trigger parsing

        // If no head found, fall back to hostname
        if (!metadata.foundHead) {
          return new Response(JSON.stringify({ title: parsedUrl.hostname, favicon: parsedUrl.origin + '/favicon.ico' }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }

        // Process and clean up metadata
        let title = decodeEntities(metadata.title) || parsedUrl.hostname
        if (title.length > 100) {
          title = title.substring(0, 97) + '...'
        }

        const siteName = decodeEntities(metadata.siteName)

        let description = decodeEntities(metadata.description)
        if (description.length > 200) {
          description = description.substring(0, 197) + '...'
        }

        const image = resolveUrl(metadata.image)
        const favicon = resolveUrl(metadata.favicon) || parsedUrl.origin + '/favicon.ico'

        // Build response object
        const result: { title: string; siteName?: string; description?: string; image?: string; favicon?: string } = { title }
        if (siteName) result.siteName = siteName
        if (description) result.description = description
        if (image) result.image = image
        if (favicon) result.favicon = favicon

        return new Response(JSON.stringify(result), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      } catch (error) {
        // On error, return the hostname as fallback
        try {
          const parsedUrl = new URL(targetUrl)
          return new Response(JSON.stringify({ title: parsedUrl.hostname, favicon: parsedUrl.origin + '/favicon.ico' }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600',
            },
          })
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid URL' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          })
        }
      }
    }

    // Room routes: /room/:id
    const roomMatch = url.pathname.match(/^\/room\/([a-zA-Z0-9]+)$/)
    if (roomMatch) {
      const roomId = roomMatch[1]

      try {
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
      } catch (error) {
        console.error('Error handling room request:', roomId, error)
        return new Response(`Internal error: ${error}`, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        })
      }
    }

    return new Response('Not found', { status: 404 })
  },
}
