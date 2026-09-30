/**
 * Memoria local de las entradas que este teléfono reclamó desde un link de "compartir entradas".
 *
 * Sirve para una sola cosa: si el amigo vuelve a abrir el mismo link desde el chat, reconocer que ya
 * reclamó en vez de mostrarle otra vez el formulario (o, peor, "ya no quedan entradas"). No guarda la
 * entrada ni su QR: eso siempre se lee fresco del servidor desde su cuenta.
 */
const STORAGE_KEY = "crow_ticket_claims"
const MAX_ENTRIES = 30

export type StoredClaim = {
  eventId: string
  eventSlug: string | null
  eventName: string
  firstName: string
  /** Sesión del cliente, sólo si el reclamo creó su ficha. `null` = entra con el código de WhatsApp. */
  sessionToken: string | null
  claimedAt: number
}

type Store = Record<string, StoredClaim>

function read(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === "object" ? (parsed as Store) : {}
  } catch {
    // Storage bloqueado o JSON roto: se sigue sin memoria.
    return {}
  }
}

export function getStoredClaim(shareToken: string): StoredClaim | null {
  return read()[shareToken] ?? null
}

export function saveStoredClaim(shareToken: string, claim: StoredClaim): void {
  try {
    const store = { ...read(), [shareToken]: claim }
    // Acotado: se conservan los más recientes.
    const recent = Object.entries(store)
      .sort(([, a], [, b]) => b.claimedAt - a.claimedAt)
      .slice(0, MAX_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(recent)))
  } catch {
    /* sin storage no hay memoria, y el reclamo ya está hecho */
  }
}

/**
 * El resultado del reclamo (con el QR) sobrevive a un refresh de la pestaña, y nada más: va a
 * `sessionStorage`, que se borra al cerrarla. Sin esto, recargar justo después de reclamar dejaba al
 * amigo sin el QR que acababa de recibir.
 */
const RESULT_PREFIX = "crow_claim_result:"

export function saveClaimResult(shareToken: string, result: unknown): void {
  try {
    window.sessionStorage.setItem(`${RESULT_PREFIX}${shareToken}`, JSON.stringify(result))
  } catch {
    /* noop */
  }
}

export function getClaimResult<T>(shareToken: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(`${RESULT_PREFIX}${shareToken}`)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
