import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { ApiError, publicApiFetch } from "@/lib/api"
import type {
  PublicDrinkProductItem,
  PublicEventDetailResponse,
  PublicProductCategory,
  PublicProductSaleType,
} from "@/types/api"
import {
  computeCartTotalString,
  useCartStore,
  type CartDrinkLine,
  type CartTicketLine,
} from "@/stores/cart-store"

/**
 * Lógica de compra de la página pública del evento: carga, ventanas de venta, entradas,
 * consumos, transporte, total, progreso guardado y salida al checkout. La comparten la
 * tienda de Crow (`event-detail-page.tsx`) y las páginas propias de `event-sites/`, que
 * sólo cambian la presentación.
 */

export type PurchaseWorkflow = "tickets" | "products"
export type CommerceSurface = "hero" | "store"
export type MinimalStep = "cover" | "store"

function readSavedProgress(slugOrId: string | undefined) {
  if (!slugOrId) return null
  try {
    const raw = localStorage.getItem(`crow_event_progress_${slugOrId}`)
    if (!raw) return null
    return JSON.parse(raw) as {
      purchaseOpen?: boolean
      commerceSurface?: CommerceSurface
      ticketQtys?: Record<string, number>
      drinks?: Record<string, number>
      transportQtys?: Record<string, number>
      minimalStep?: MinimalStep
    }
  } catch {
    return null
  }
}

/**
 * Flag que deja checkout-page al volver atrás: la página del evento solo
 * restaura la parte de consumos cuando viene de ahí (vuelta con "Volver" o
 * swipe atrás desde el checkout). Una visita normal al link del evento arranca
 * limpia, con la pantalla normal, sin importar qué quedó guardado en
 * localStorage. El Set tolera el doble-montaje de StrictMode en dev: el flag se
 * consume una sola vez por carga del documento.
 */
const consumedRestoreFlags = new Set<string>()

function consumeRestoreFlag(slug: string | undefined): boolean {
  if (!slug) return false
  if (consumedRestoreFlags.has(slug)) return true
  try {
    const raw = sessionStorage.getItem(`crow_restore_progress_${slug}`)
    sessionStorage.removeItem(`crow_restore_progress_${slug}`)
    if (raw !== null) consumedRestoreFlags.add(slug)
    return raw !== null
  } catch {
    return false
  }
}

export function useWindowOpen(iso: Date | string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (iso == null) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [iso])
  if (iso == null) return { open: true, msLeft: 0 }
  const t0 = new Date(iso).getTime()
  return { open: now >= t0, msLeft: Math.max(0, t0 - now) }
}

export function useEventPurchase(eventSlug?: string) {
  const { slug: routeSlug } = useParams<{ slug: string }>()
  const slug = eventSlug ?? routeSlug
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setCart = useCartStore((s) => s.setCart)
  // `promotor` viaja en el enlace que comparte cada promotor. También soportamos
  // `promoter` para no romper links que se hayan armado antes del nombre en español.
  const promoterId = searchParams.get("promotor") ?? searchParams.get("promoter") ?? undefined

  const [data, setData] = useState<PublicEventDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoreSession] = useState(() => consumeRestoreFlag(slug))
  const savedProgress = restoreSession ? readSavedProgress(slug) : null
  const [purchaseOpen, setPurchaseOpen] = useState<boolean>(() => savedProgress?.purchaseOpen ?? false)
  const [commerceSurface, setCommerceSurface] = useState<CommerceSurface>(() => savedProgress?.commerceSurface ?? "hero")
  const [ticketQtys, setTicketQtys] = useState<Record<string, number>>(() => savedProgress?.ticketQtys ?? {})
  const [drinks, setDrinks] = useState<Record<string, number>>(() => savedProgress?.drinks ?? {})
  const [transportQtys, setTransportQtys] = useState<Record<string, number>>(() => savedProgress?.transportQtys ?? {})
  const [minimalStep, setMinimalStep] = useState<MinimalStep>(() => savedProgress?.minimalStep ?? "cover")

  const ticketsFrom = data?.event.ticketsAvailableFrom ?? null
  const consFrom = data?.event.consumptionsAvailableFrom ?? null
  const ticketsWindow = useWindowOpen(ticketsFrom)
  const consWindow = useWindowOpen(consFrom)

  const load = useCallback(() => {
    if (!slug) return
    publicApiFetch<PublicEventDetailResponse>(`/public/events/${slug}`)
      .then((r) => {
        const saved = restoreSession ? readSavedProgress(slug) : null
        setData(r)
        setTicketQtys(saved?.ticketQtys ?? {})
        setDrinks(saved?.drinks ?? {})
        setTransportQtys(saved?.transportQtys ?? {})
        setPurchaseOpen(saved?.purchaseOpen ?? false)
        setCommerceSurface(saved?.commerceSurface ?? "hero")
        setMinimalStep(saved?.minimalStep ?? "cover")
      })
      .catch((err) => {
        const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : ""
        setError(detail ? `No pudimos cargar el evento. ${detail}` : "No pudimos cargar el evento.")
      })
  }, [slug, restoreSession])

  useEffect(() => {
    load()
  }, [load])

  const hasTicketCatalog = (data?.ticketTypes.length ?? 0) > 0
  const hasProductCatalog = (data?.drinkProducts.length ?? 0) > 0

  const workflow: PurchaseWorkflow | null = hasTicketCatalog ? "tickets" : hasProductCatalog ? "products" : null

  const ticketLines: CartTicketLine[] = useMemo(() => {
    if (!data) return []
    const out: CartTicketLine[] = []
    for (const t of data.ticketTypes) {
      const q = ticketQtys[t.id] ?? 0
      if (q <= 0) continue
      out.push({ ticketTypeId: t.id, quantity: q, unitPrice: t.price, promoBuy: t.promoBuy, promoPay: t.promoPay })
    }
    return out
  }, [data, ticketQtys])

  const bumpTicket = (ticketTypeId: string) => {
    setTicketQtys((prev) => ({
      ...prev,
      [ticketTypeId]: Math.min(99, (prev[ticketTypeId] ?? 0) + 1),
    }))
  }

  const trimTicket = (ticketTypeId: string) => {
    setTicketQtys((prev) => {
      const next = (prev[ticketTypeId] ?? 0) - 1
      const copy = { ...prev }
      if (next <= 0) delete copy[ticketTypeId]
      else copy[ticketTypeId] = next
      return copy
    })
  }

  const drinkLines: CartDrinkLine[] = useMemo(() => {
    // Con la venta de consumos sin abrir no viajan al carrito (p. ej. un progreso guardado antes
    // de que se agendara la fecha): el backend los rechazaría.
    if (!data || !consWindow.open) return []
    const out: CartDrinkLine[] = []
    for (const [pid, q] of Object.entries(drinks)) {
      if (q <= 0) continue
      const p = data.drinkProducts.find((x) => x.id === pid)
      if (p) out.push({ productId: pid, quantity: q, unitPrice: p.price })
    }
    return out
  }, [data, drinks, consWindow.open])

  const transportLines = useMemo(() => {
    // Nunca más pasajes que entradas: se reparten los asientos en el orden de los transportes.
    let remaining = ticketLines.reduce((sum, line) => sum + line.quantity, 0)
    const out: { transportId: string; quantity: number; unitPrice: string; name: string; address: string }[] = []
    for (const transport of data?.transports ?? []) {
      const quantity = Math.min(remaining, transportQtys[transport.id] ?? 0)
      remaining -= quantity
      if (quantity > 0) out.push({ transportId: transport.id, quantity, unitPrice: transport.price, name: transport.name, address: transport.address })
    }
    return out
  }, [data, transportQtys, ticketLines])
  const selectedTransportQtys = Object.fromEntries(transportLines.map((line) => [line.transportId, line.quantity]))
  const transportCount = transportLines.reduce((sum, line) => sum + line.quantity, 0)
  const setTransportQty = (transportId: string, quantity: number) =>
    setTransportQtys({ ...selectedTransportQtys, [transportId]: quantity })

  const cartPreview = useMemo(() => {
    if (!data) return null
    return {
      eventId: data.event.id,
      eventName: data.event.name,
      productoraName: data.productora.name,
      ticketLines,
      drinkLines,
      transportLines,
    }
  }, [data, ticketLines, drinkLines, transportLines])

  const totalStr = cartPreview ? computeCartTotalString(cartPreview) : "0.00"

  const ticketsBuyable =
    ticketsWindow.open &&
    ticketLines.length > 0 &&
    ticketLines.every((line) => {
      const t = data?.ticketTypes.find((x) => x.id === line.ticketTypeId)
      return t?.availableForPurchase === true
    })

  const hasDrinks = drinkLines.length > 0
  const drinksBuyable = hasDrinks && consWindow.open

  const ticketCount = ticketLines.reduce((a, l) => a + l.quantity, 0)
  const drinkUnitCount = drinkLines.reduce((a, l) => a + l.quantity, 0)
  const bolsaUnitCount = ticketCount + drinkUnitCount

  const showTicketStep = !!data && workflow === "tickets"
  const showProductStep = !!data && workflow === "products"
  const canContinue =
    (ticketCount > 0 && ticketsBuyable) || (hasDrinks && drinksBuyable)

  const canContinueFromTicketsToStore =
    hasProductCatalog && ticketCount > 0 && ticketsBuyable

  const setDrinkQty = (productId: string, next: number) => {
    setDrinks((prev) => {
      const copy = { ...prev }
      if (next <= 0) delete copy[productId]
      else copy[productId] = next
      return copy
    })
  }

  const continueClick = () => {
    if (!cartPreview || !canContinue) return
    setCart(cartPreview)
    const promoterQuery = promoterId ? `?promotor=${encodeURIComponent(promoterId)}` : ""
    navigate(`/checkout/${data!.event.id}${promoterQuery}`)
  }

  const anyTicketPurchasable =
    !!data?.ticketTypes.some((t) => t.availableForPurchase) && ticketsWindow.open
  const productsPurchasable = consWindow.open && hasProductCatalog

  const anythingPurchasable = anyTicketPurchasable || productsPurchasable
  const hasAnyCatalog = hasTicketCatalog || hasProductCatalog

  useEffect(() => {
    if (!purchaseOpen) {
      // Cerrar la compra vacía la bolsa; la restauración desde el checkout la vuelve a cargar en `load`.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCommerceSurface("hero")
      setTicketQtys({})
      setDrinks({})
      setTransportQtys({})
    }
  }, [purchaseOpen])

  useEffect(() => {
    if (!slug) return
    try {
      localStorage.setItem(
        `crow_event_progress_${slug}`,
        JSON.stringify({ purchaseOpen, commerceSurface, ticketQtys, drinks, transportQtys, minimalStep })
      )
    } catch { /* noop */ }
  }, [slug, purchaseOpen, commerceSurface, ticketQtys, drinks, transportQtys, minimalStep])

  return {
    slug,
    data,
    error,
    restoreSession,
    purchaseOpen,
    setPurchaseOpen,
    commerceSurface,
    setCommerceSurface,
    workflow,
    ticketQtys,
    drinks,
    minimalStep,
    setMinimalStep,
    ticketsFrom,
    consFrom,
    ticketsWindow,
    consWindow,
    hasTicketCatalog,
    hasProductCatalog,
    hasAnyCatalog,
    ticketLines,
    drinkLines,
    transportLines,
    selectedTransportQtys,
    transportCount,
    setTransportQty,
    bumpTicket,
    trimTicket,
    setDrinkQty,
    totalStr,
    ticketCount,
    bolsaUnitCount,
    showTicketStep,
    showProductStep,
    canContinue,
    canContinueFromTicketsToStore,
    continueClick,
    anyTicketPurchasable,
    productsPurchasable,
    anythingPurchasable,
  }
}

export function productSaleType(p: PublicDrinkProductItem): PublicProductSaleType {
  return p.saleType ?? "GLASS"
}

const UNCATEGORIZED_KEY = "__uncat__"

export type ProductCategoryGroup = {
  id: string
  name: string | null
  products: PublicDrinkProductItem[]
}

export function groupProductsByCategory(
  products: PublicDrinkProductItem[],
  categories?: PublicProductCategory[]
): ProductCategoryGroup[] {
  const byCat = new Map<string, PublicDrinkProductItem[]>()
  for (const p of products) {
    const key = p.categoryId ?? UNCATEGORIZED_KEY
    const list = byCat.get(key) ?? []
    list.push(p)
    byCat.set(key, list)
  }
  const groups: ProductCategoryGroup[] = []
  for (const cat of categories ?? []) {
    const list = byCat.get(cat.id)
    if (list && list.length > 0) {
      groups.push({ id: cat.id, name: cat.name, products: list })
      byCat.delete(cat.id)
    }
  }
  // Categorías presentes en productos pero no listadas (fallback defensivo).
  for (const [key, list] of byCat) {
    if (key === UNCATEGORIZED_KEY) continue
    if (list.length > 0) {
      groups.push({ id: key, name: list[0].categoryName ?? null, products: list })
    }
  }
  const uncat = byCat.get(UNCATEGORIZED_KEY)
  if (uncat && uncat.length > 0) {
    groups.push({ id: UNCATEGORIZED_KEY, name: null, products: uncat })
  }
  return groups
}
