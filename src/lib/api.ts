const base = () => import.meta.env.VITE_API_URL ?? "http://localhost:3000"

export function getApiBase(): string {
  return base().replace(/\/$/, "")
}

type Json = Record<string, unknown>

export class ApiError extends Error {
  status: number
  body: Json | null

  constructor(message: string, status: number, body: Json | null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.body = body
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers: initHeaders, ...rest } = options
  const headers = new Headers(initHeaders)
  if (!headers.has("Content-Type") && rest.body) {
    headers.set("Content-Type", "application/json")
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const res = await fetch(`${getApiBase()}${path}`, {
    ...rest,
    headers,
    credentials: "omit",
  })

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = { raw: text }
    }
  }

  if (!res.ok) {
    const errBody = data && typeof data === "object" ? (data as Json) : null
    const msg =
      errBody && typeof errBody.error === "string"
        ? errBody.error
        : `Error ${res.status}`
    throw new ApiError(msg, res.status, errBody)
  }

  return data as T
}

export async function publicApiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return apiFetch<T>(path, options)
}
