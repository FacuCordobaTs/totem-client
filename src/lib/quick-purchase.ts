/**
 * Compra rápida del link de acceso (`/{slug}/acceso`): lo que el teléfono recuerda entre la carta,
 * Mercado Pago y el retiro. No es fuente de verdad de nada —el backend decide si una venta está
 * cobrada—, sólo sirve para volver al lugar correcto cuando el cliente regresa al navegador.
 */
const STORAGE_KEY = "crow_quick_purchase"
const GUEST_CART_PREFIX = "crow_guest_cart_"
/** La preferencia de Mercado Pago vence a los 30 minutos: después no hay pago que esperar. */
export const PENDING_PAYMENT_WINDOW_MS = 35 * 60 * 1000

export type QuickPurchase = {
  /** Identificadores del evento con los que se puede abrir su link (ruta, id y slug). */
  eventKeys: string[]
  /** La última venta iniciada desde este teléfono. */
  receiptToken: string
  /** Link de pago de esa venta, para retomarlo si el cliente volvió sin pagar. */
  paymentUrl: string | null
  /** La última venta cobrada: sigue dando acceso al retiro si la siguiente no se completa. */
  paidReceiptToken: string | null
  createdAt: number
}

export function readQuickPurchase(eventKey: string | undefined): QuickPurchase | null {
  if (!eventKey) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as QuickPurchase
    return stored.eventKeys?.includes(eventKey) && stored.receiptToken ? stored : null
  } catch {
    return null
  }
}

function writeQuickPurchase(purchase: QuickPurchase) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(purchase))
  } catch {
    /* noop: sin almacenamiento, el link de pago igual vuelve al retiro por su URL. */
  }
}

/** Guarda la venta que está por pagarse, conservando la última cobrada de ese evento. */
export function rememberQuickPurchase(input: {
  eventKeys: (string | null | undefined)[]
  receiptToken: string
  paymentUrl: string | null
}) {
  const eventKeys = [...new Set(input.eventKeys.filter((key): key is string => Boolean(key)))]
  const previous = eventKeys.map(readQuickPurchase).find(Boolean) ?? null
  writeQuickPurchase({
    eventKeys,
    receiptToken: input.receiptToken,
    paymentUrl: input.paymentUrl,
    paidReceiptToken: previous?.paidReceiptToken ?? null,
    createdAt: Date.now(),
  })
}

/** La pantalla de retiro vio la venta cobrada: el carrito ya cumplió y el retiro queda recordado. */
export function markQuickPurchasePaid(input: {
  eventKeys: (string | null | undefined)[]
  receiptToken: string
}) {
  const eventKeys = [...new Set(input.eventKeys.filter((key): key is string => Boolean(key)))]
  const previous = eventKeys.map(readQuickPurchase).find(Boolean) ?? null
  writeQuickPurchase({
    eventKeys: [...new Set([...(previous?.eventKeys ?? []), ...eventKeys])],
    receiptToken: previous?.receiptToken ?? input.receiptToken,
    paymentUrl: previous?.receiptToken === input.receiptToken ? null : previous?.paymentUrl ?? null,
    paidReceiptToken: input.receiptToken,
    createdAt: previous?.createdAt ?? Date.now(),
  })
  for (const key of eventKeys) clearGuestCart(key)
}

export function paymentUrlForReceipt(receiptToken: string, eventKeys: (string | null | undefined)[]): string | null {
  for (const key of eventKeys) {
    const purchase = readQuickPurchase(key ?? undefined)
    if (purchase?.receiptToken === receiptToken) return purchase.paymentUrl
  }
  return null
}

type ReceiptSnapshot = {
  sale: { paid: boolean; status?: string } | null
  consumptions: { status: string }[]
}

/**
 * Qué comprobante retomar al reabrir el link de acceso: una venta recién iniciada que puede estar
 * pagándose o una cobrada con productos por retirar. Sin nada de eso, el cliente ve la carta.
 */
export function shouldResumeReceipt(
  receipt: ReceiptSnapshot,
  createdAt: number,
  now = Date.now()
): boolean {
  if (receipt.sale?.paid) return receipt.consumptions.some((c) => c.status === "PENDING")
  return receipt.sale?.status === "PENDING" && now - createdAt < PENDING_PAYMENT_WINDOW_MS
}

export function readGuestCart(eventKey: string): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(`${GUEST_CART_PREFIX}${eventKey}`)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function writeGuestCart(eventKey: string, cart: Record<string, number>) {
  try {
    sessionStorage.setItem(`${GUEST_CART_PREFIX}${eventKey}`, JSON.stringify(cart))
  } catch {
    /* noop */
  }
}

export function clearGuestCart(eventKey: string) {
  try {
    sessionStorage.removeItem(`${GUEST_CART_PREFIX}${eventKey}`)
  } catch {
    /* noop */
  }
}
