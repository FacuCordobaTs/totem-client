import { eventSlugFromHostname } from "../src/lib/event-domain"
import { eventSiteMeta, type EventSiteMeta } from "../src/event-sites/meta"

interface Env { CLIENT_PAGES_ORIGIN: string }

/** Wildcard route proxy. The browser keeps the event host and React resolves its slug. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const incoming = new URL(request.url)
    const slug = eventSlugFromHostname(incoming.hostname)
    if (!slug) {
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
    const meta = Object.hasOwn(eventSiteMeta, slug) ? eventSiteMeta[slug] : null
    if (meta && result.ok && result.headers.get("content-type")?.includes("text/html")) {
      return withSiteMeta(result, meta, incoming.origin)
    }
    return result
  },
}

const escapeAttr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Título, ícono y vista previa del link propios de la página, en el HTML que leen los crawlers. */
function withSiteMeta(response: Response, meta: EventSiteMeta, origin: string): Response {
  const image = new URL(meta.image, origin).toString()
  const tags = [
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeAttr(origin + "/")}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    meta.appleTouchIcon ? `<link rel="apple-touch-icon" href="${escapeAttr(meta.appleTouchIcon)}" />` : "",
    meta.themeColor ? `<meta name="theme-color" content="${escapeAttr(meta.themeColor)}" />` : "",
  ].join("")
  const rewritten = new HTMLRewriter()
    .on("title", { element: (el) => { el.setInnerContent(meta.title) } })
    .on('link[rel="icon"]', { element: (el) => { el.setAttribute("href", meta.icon) } })
    .on("head", { element: (el) => { el.append(tags, { html: true }) } })
    .transform(response)
  const headers = new Headers(rewritten.headers)
  headers.delete("content-length")
  return new Response(rewritten.body, { status: rewritten.status, statusText: rewritten.statusText, headers })
}
