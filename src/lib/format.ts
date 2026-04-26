import Decimal from "decimal.js"

/**
 * Mercado Pago Bricks requires a `number` for `initialization.amount`.
 * Use exact decimal string → number (2 dp) to avoid ad-hoc float math for totals.
 */
export function amountStringToSdkNumber(totalAmount: string): number {
  return new Decimal(totalAmount || "0")
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber()
}

export function formatMoneyArs(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(n)) return "$ —"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n)
}

/** Total exacto con centavos (checkout / comprobante). */
export function formatMoneyArsExact(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(n)) return "$ —"
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s"
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

export function formatEventDate(d: Date | string | null | undefined): string {
  if (d == null) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

/** Fecha legible sin hora — para listas y vistas principales. */
export function formatEventDay(d: Date | string | null | undefined): string {
  if (d == null) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date)
}

/** Detalle en sheet / panel (sin segundos). */
export function formatEventDateTime(
  d: Date | string | null | undefined
): string {
  if (d == null) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function truncateHash(hash: string, head = 8, tail = 4): string {
  if (hash.length <= head + tail + 1) return hash
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  MERCADOPAGO: "Mercado Pago",
  TRANSFER: "Transferencia",
}

export function formatPaymentMethod(code: string): string {
  return PAYMENT_LABELS[code] ?? code
}

/** Estado legible para asistentes (sin enums crudos). */
export function ticketStatusLabel(s: string): string {
  if (s === "PENDING") return "Pendiente"
  if (s === "USED") return "Utilizada"
  if (s === "CANCELLED") return "Anulada"
  return s
}

export function consumptionStatusLabel(s: string): string {
  if (s === "PENDING") return "Pendiente"
  if (s === "REDEEMED") return "Canjeada"
  if (s === "CANCELLED") return "Anulada"
  return s
}
