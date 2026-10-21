import { afterEach, expect, test } from "bun:test"
import worker from "./event-subdomains"
import { eventSlugFromHostname, isEventSubdomain } from "../src/lib/event-domain"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const env = { CLIENT_PAGES_ORIGIN: "https://crow-client.pages.dev" }

test("resolves event hosts while rejecting infrastructure, nested and lookalike hosts", () => {
  expect(eventSlugFromHostname("dripeo.crow.ar")).toBe("dripeo")
  expect(eventSlugFromHostname("dripeo.localhost")).toBe("dripeo")
  for (const host of ["crow.ar", "api.crow.ar", "admin.crow.ar", "www.crow.ar", "x.y.crow.ar", "dripeo.crow.ar.evil.com", "-bad.crow.ar", `${"x".repeat(64)}.crow.ar`]) {
    expect(eventSlugFromHostname(host)).toBeNull()
  }
  expect(isEventSubdomain("dripeo")).toBe(true)
  expect(isEventSubdomain("admin")).toBe(false)
})

test("proxy preserves paths, queries and event-host redirects without forwarding credentials", async () => {
  let forwarded: URL | undefined
  let forwardedHeaders: Headers | undefined
  globalThis.fetch = (async (input, init) => {
    forwarded = new URL(String(input))
    forwardedHeaders = new Headers(init?.headers)
    return new Response(null, { status: 302, headers: { Location: "https://crow-client.pages.dev/acceso", "Set-Cookie": "secret=x" } })
  }) as typeof fetch
  const response = await worker.fetch(new Request("https://dripeo.crow.ar/checkout/123?promoter=p", { headers: { Cookie: "private=x", Authorization: "Bearer private" } }), env)
  expect(forwarded?.toString()).toBe("https://crow-client.pages.dev/checkout/123?promoter=p")
  expect(forwardedHeaders?.has("cookie")).toBe(false)
  expect(forwardedHeaders?.has("authorization")).toBe(false)
  expect(response.headers.get("location")).toBe("https://dripeo.crow.ar/acceso")
  expect(response.headers.has("set-cookie")).toBe(false)
})

test("double-slash paths cannot change upstream host", async () => {
  globalThis.fetch = (async (input) => {
    expect(new URL(String(input)).hostname).toBe("crow-client.pages.dev")
    return new Response("ok")
  }) as typeof fetch
  await worker.fetch(new Request("https://dripeo.crow.ar//evil.com/path"), env)
})

test("rejects writes and invalid origins before fetching", async () => {
  globalThis.fetch = (async () => { throw new Error("unexpected fetch") }) as typeof fetch
  expect((await worker.fetch(new Request("https://dripeo.crow.ar", { method: "POST" }), env)).status).toBe(405)
  for (const origin of ["https://crow.ar", "https://evil.com", "http://client.pages.dev", "https://client.pages.dev/path"]) {
    expect((await worker.fetch(new Request("https://dripeo.crow.ar"), { CLIENT_PAGES_ORIGIN: origin })).status).toBe(503)
  }
})

test("infrastructure requests pass to their existing origin", async () => {
  globalThis.fetch = (async (input) => {
    expect(input).toBeInstanceOf(Request)
    expect((input as Request).url).toBe("https://api.crow.ar/public/events/dripeo")
    return new Response("api")
  }) as typeof fetch
  expect(await (await worker.fetch(new Request("https://api.crow.ar/public/events/dripeo"), env)).text()).toBe("api")
})

test("registered event sites get their own title, icon and link preview", async () => {
  globalThis.fetch = (async () => new Response(
    '<html><head><link rel="icon" type="image/png" href="/logo.png" /><title>Crow</title></head><body></body></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  )) as typeof fetch
  const html = await (await worker.fetch(new Request("https://perronegro3110.crow.ar/"), env)).text()
  expect(html).toContain("<title>Perro Negro · 31/10 · Night Club</title>")
  expect(html).toContain('href="/sites/perronegro3110/icon.png"')
  expect(html).toContain('<meta property="og:image" content="https://perronegro3110.crow.ar/sites/perronegro3110/og.jpg" />')
  expect(html).not.toContain("/logo.png")

  const plain = await (await worker.fetch(new Request("https://dripeo.crow.ar/"), env)).text()
  expect(plain).toContain("<title>Crow</title>")
})
