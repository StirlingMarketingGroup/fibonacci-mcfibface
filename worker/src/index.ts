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

        // Fetch the page with a timeout and limited response size
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

        // Don't check response.ok - we still want metadata from 404 pages etc.
        // as long as they return HTML with a <head> element

        // Check content-type, but still try to parse if it might be HTML
        const contentType = response.headers.get('content-type') || ''
        const mightBeHtml = contentType.includes('text/html') || contentType.includes('text/plain') || contentType === ''

        if (!mightBeHtml) {
          // Definitely not HTML - just return the domain as the title
          return new Response(JSON.stringify({ title: parsedUrl.hostname, favicon: parsedUrl.origin + '/favicon.ico' }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }

        // Read limited amount of HTML (first 500KB should contain <head>)
        const reader = response.body?.getReader()
        let html = ''
        const decoder = new TextDecoder()
        const maxBytes = 500 * 1024

        if (reader) {
          let bytesRead = 0
          while (bytesRead < maxBytes) {
            const { done, value } = await reader.read()
            if (done) break
            html += decoder.decode(value, { stream: true })
            bytesRead += value?.length || 0
            // Stop early if we've found </head>
            if (html.includes('</head>')) break
          }
          reader.cancel()
        }

        // If no <head> element found, fall back to hostname
        if (!html.includes('<head') && !html.includes('<HEAD')) {
          return new Response(JSON.stringify({ title: parsedUrl.hostname, favicon: parsedUrl.origin + '/favicon.ico' }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
            },
          })
        }

        // Helper to decode HTML entities
        const decodeEntities = (text: string) => text
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#x27;/g, "'")
          .replace(/&#x2F;/g, '/')
          .replace(/\s+/g, ' ')
          .trim()

        // Extract title - try OG title first, then regular title
        let title = ''

        // Try og:title
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)
        if (ogTitleMatch) {
          title = ogTitleMatch[1]
        }

        // Fall back to <title> tag
        if (!title) {
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
          if (titleMatch) {
            title = titleMatch[1]
          }
        }

        title = decodeEntities(title)

        // If no title found, use hostname
        if (!title) {
          title = parsedUrl.hostname
        }

        // Truncate very long titles
        if (title.length > 100) {
          title = title.substring(0, 97) + '...'
        }

        // Extract og:site_name (used for the inline link text)
        let siteName = ''
        const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i)
        if (siteNameMatch) {
          siteName = decodeEntities(siteNameMatch[1])
        }

        // Extract description - try OG description first, then meta description
        let description = ''

        const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i)
        if (ogDescMatch) {
          description = ogDescMatch[1]
        }

        if (!description) {
          const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)
          if (metaDescMatch) {
            description = metaDescMatch[1]
          }
        }

        description = decodeEntities(description)

        // Truncate very long descriptions
        if (description.length > 200) {
          description = description.substring(0, 197) + '...'
        }

        // Extract image - try OG image first, then twitter:image
        let image = ''

        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
          || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
        if (ogImageMatch) {
          image = ogImageMatch[1]
        }

        if (!image) {
          const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i)
          if (twitterImageMatch) {
            image = twitterImageMatch[1]
          }
        }

        // Make relative image URLs absolute
        if (image && !image.startsWith('http')) {
          if (image.startsWith('//')) {
            image = 'https:' + image
          } else if (image.startsWith('/')) {
            image = parsedUrl.origin + image
          } else {
            image = parsedUrl.origin + '/' + image
          }
        }

        // Extract favicon - try various link tags, fall back to /favicon.ico
        let favicon = ''

        // Try apple-touch-icon first (usually higher quality)
        const appleTouchMatch = html.match(/<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i)
          || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon["']/i)
        if (appleTouchMatch) {
          favicon = appleTouchMatch[1]
        }

        // Try standard icon
        if (!favicon) {
          const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
            || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i)
          if (iconMatch) {
            favicon = iconMatch[1]
          }
        }

        // Fall back to /favicon.ico
        if (!favicon) {
          favicon = '/favicon.ico'
        }

        // Make relative favicon URLs absolute
        if (favicon && !favicon.startsWith('http')) {
          if (favicon.startsWith('//')) {
            favicon = 'https:' + favicon
          } else if (favicon.startsWith('/')) {
            favicon = parsedUrl.origin + favicon
          } else {
            favicon = parsedUrl.origin + '/' + favicon
          }
        }

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
