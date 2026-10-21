import { eventSlugFromHostname } from "../src/lib/event-domain"

interface Env { CLIENT_PAGES_ORIGIN: string }

/** Wildcard route proxy. The browser keeps the event host and React resolves its slug. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url)
    if (!eventSlugFromHostname(incoming.hostname)) {
      // Infrastructure hosts have their own origin; configure explicit route exclusions too.
      return fetch(request)
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } })
    }
    let origin: URL
    try {
      origin = new URL(env.CLIENT_PAGES_ORIGIN)
      if (origin.protocol !== "https:" || !/^[a-z0-9-]+\.pages\.dev$/.test(origin.hostname) ||
          origin.port || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error()
    } catch {
      return new Response("Configure CLIENT_PAGES_ORIGIN with the client production pages.dev origin", { status: 503 })
    }
    const upstream = new URL(origin)
    upstream.pathname = incoming.pathname
    upstream.search = incoming.search
    const headers = new Headers(request.headers)
    headers.delete("host")
    headers.delete("cookie")
    headers.delete("authorization")
    const response = await fetch(upstream, { method: request.method, headers, redirect: "manual" })
    // Keep relative and same-Pages redirects on the event hostname.
    const result = new Response(response.body, response)
    const location = result.headers.get("location")
    if (location) {
      const destination = new URL(location, upstream)
      if (destination.origin === origin.origin) {
        destination.host = incoming.host
        result.headers.set("location", destination.toString())
      }
    }
    result.headers.delete("set-cookie")
    return result
  },
}
