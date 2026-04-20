import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { ChevronLeft, Minus, Plus } from "lucide-react"
import { publicApiFetch } from "@/lib/api"
import type { PublicEventDetailResponse } from "@/types/api"
import {
  formatCountdown,
  formatEventDate,
  formatEventDay,
  formatMoneyArsExact,
} from "@/lib/format"
import { Button } from "@/components/ui/button"
import {
  computeCartTotalString,
  useCartStore,
  type CartDrinkLine,
  type CartTicketLine,
} from "@/stores/cart-store"

type PurchaseWorkflow = "tickets" | "products"

function useWindowOpen(iso: Date | string | null | undefined) {
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

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const setCart = useCartStore((s) => s.setCart)

  const [data, setData] = useState<PublicEventDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workflow, setWorkflow] = useState<PurchaseWorkflow | null>(null)
  const [ticketTypeId, setTicketTypeId] = useState<string>("")
  const [qty, setQty] = useState(0)
  const [drinks, setDrinks] = useState<Record<string, number>>({})

  const ticketsFrom = data?.event.ticketsAvailableFrom ?? null
  const consFrom = data?.event.consumptionsAvailableFrom ?? null
  const ticketsWindow = useWindowOpen(ticketsFrom)
  const consWindow = useWindowOpen(consFrom)

  const load = useCallback(() => {
    if (!eventId) return
    publicApiFetch<PublicEventDetailResponse>(`/public/events/${eventId}`)
      .then((r) => {
        setData(r)
        const first = r.ticketTypes.find((t) => t.availableForPurchase)
        setTicketTypeId(first?.id ?? r.ticketTypes[0]?.id ?? "")
        const tOpen =
          r.event.ticketsAvailableFrom == null ||
          Date.now() >= new Date(r.event.ticketsAvailableFrom).getTime()
        setQty(tOpen && first ? 1 : 0)
      })
      .catch(() => setError("No pudimos cargar el evento."))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const hasTicketCatalog = (data?.ticketTypes.length ?? 0) > 0
  const hasProductCatalog = (data?.drinkProducts.length ?? 0) > 0
  const needsWorkflowChoice = hasTicketCatalog && hasProductCatalog

  useEffect(() => {
    if (!data) return
    const hasT = data.ticketTypes.length > 0
    const hasP = data.drinkProducts.length > 0
    if (hasT && !hasP) setWorkflow("tickets")
    else if (!hasT && hasP) setWorkflow("products")
    else setWorkflow(null)
  }, [data])

  const selectedType = useMemo(
    () => data?.ticketTypes.find((t) => t.id === ticketTypeId),
    [data, ticketTypeId]
  )

  const ticketLines: CartTicketLine[] = useMemo(() => {
    if (!selectedType || qty <= 0) return []
    return [{ ticketTypeId: selectedType.id, quantity: qty, unitPrice: selectedType.price }]
  }, [selectedType, qty])

  const drinkLines: CartDrinkLine[] = useMemo(() => {
    if (!data) return []
    const out: CartDrinkLine[] = []
    for (const [pid, q] of Object.entries(drinks)) {
      if (q <= 0) continue
      const p = data.drinkProducts.find((x) => x.id === pid)
      if (p) out.push({ productId: pid, quantity: q, unitPrice: p.price })
    }
    return out
  }, [data, drinks])

  const cartPreview = useMemo(() => {
    if (!data || !eventId) return null
    return {
      eventId,
      eventName: data.event.name,
      productoraName: data.productora.name,
      ticketLines,
      drinkLines,
    }
  }, [data, eventId, ticketLines, drinkLines])

  const totalStr = cartPreview ? computeCartTotalString(cartPreview) : "0.00"

  const ticketsBuyable =
    !!selectedType?.availableForPurchase && ticketsWindow.open && qty > 0

  const hasDrinks = drinkLines.length > 0
  const drinksBuyable = hasDrinks && consWindow.open

  const canContinue =
    (qty > 0 && ticketsBuyable) || (hasDrinks && drinksBuyable)

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
    navigate(`/checkout/${eventId}`)
  }

  const chooseTicketsWorkflow = () => {
    setDrinks({})
    setWorkflow("tickets")
  }

  const chooseProductsWorkflow = () => {
    setQty(0)
    setWorkflow("products")
  }

  const anyTicketPurchasable =
    !!data?.ticketTypes.some((t) => t.availableForPurchase) && ticketsWindow.open
  const productsPurchasable = consWindow.open && hasProductCatalog

  const showChooser = data && needsWorkflowChoice && workflow == null
  const showTicketStep = data && workflow === "tickets"
  const showProductStep = data && workflow === "products"

  if (!eventId) return null

  return (
    <div className="flex min-h-dvh flex-col pb-40">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-6 pt-14 sm:px-8 sm:pt-16">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !data ? (
          <p className="text-sm text-[#8E8E93]">Cargando…</p>
        ) : (
          <>
            {showTicketStep || showProductStep ? (
              <Button
                type="button"
                variant="ghost"
                className="-ml-2 h-auto self-start rounded-xl px-2 py-1.5 text-sm text-[#8E8E93] hover:bg-white/5 hover:text-white"
                onClick={() => setWorkflow(null)}
              >
                <ChevronLeft className="mr-0.5 size-4" aria-hidden />
                Elegir otra opción
              </Button>
            ) : null}

            {data.event.imageUrl ? (
              <figure className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-900 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.04]">
                <img
                  src={data.event.imageUrl}
                  alt={data.event.name}
                  className="aspect-[5/3] w-full object-cover sm:aspect-[2/1]"
                  loading="eager"
                  decoding="async"
                />
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
                  aria-hidden
                />
              </figure>
            ) : null}

            <header className="space-y-3">
              <p className="text-sm text-[#8E8E93]">{data.productora.name}</p>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[1.75rem] sm:leading-tight">
                {data.event.name}
              </h1>
              <p className="text-sm text-[#8E8E93]">{formatEventDay(data.event.date)}</p>
              {data.event.location ? (
                <p className="text-sm text-[#8E8E93]">{data.event.location}</p>
              ) : null}
            </header>

            {showChooser ? (
              <section className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-tight text-white">
                    ¿Qué querés comprar?
                  </h2>
                  <p className="text-sm leading-relaxed text-[#8E8E93]">
                    Elegí si buscás entradas para el evento o consumos para canjear en el
                    momento.
                  </p>
                </div>
                <div className="rounded-2xl bg-transparent px-2 py-2">
                  <ul className="flex flex-col">
                    <li>
                      <button
                        type="button"
                        disabled={!hasTicketCatalog || !anyTicketPurchasable}
                        onClick={chooseTicketsWorkflow}
                        className={`flex w-full mb-4 flex-col border border-white/10 items-start gap-1 rounded-xl px-4 py-5 text-left transition-colors ${
                          !hasTicketCatalog || !anyTicketPurchasable
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <span className="font-medium text-white">Entradas</span>
                        <span className="text-sm text-[#8E8E93]">
                          {hasTicketCatalog && anyTicketPurchasable
                            ? "Elegí tipo y cantidad"
                            : ticketsFrom != null && !ticketsWindow.open
                              ? `Disponibles desde el ${formatEventDate(ticketsFrom)}`
                              : "No hay entradas a la venta"}
                        </span>
                      </button>
                    </li>
                    <li className="flex flex-col">
                      <div
                        className="ml-4 h-px shrink-0 bg-zinc-800/50"
                        aria-hidden
                      />
                      <button
                        type="button"
                        disabled={!hasProductCatalog || !productsPurchasable}
                        onClick={chooseProductsWorkflow}
                        className={`flex w-full flex-col border border-white/10 items-start gap-1 rounded-xl px-4 py-5 text-left transition-colors ${
                          !hasProductCatalog || !productsPurchasable
                            ? "cursor-not-allowed opacity-40"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <span className="font-medium text-white">Consumos</span>
                        <span className="text-sm text-[#8E8E93]">
                          {hasProductCatalog && productsPurchasable
                            ? "Bebidas y productos del evento"
                            : consFrom != null && !consWindow.open
                              ? `Disponibles desde el ${formatEventDate(consFrom)}`
                              : "No hay consumos para este evento"}
                        </span>
                      </button>
                    </li>
                  </ul>
                </div>
              </section>
            ) : null}

            {showTicketStep ? (
              <section className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">Entradas</h2>
                {ticketsFrom != null && !ticketsWindow.open ? (
                  <p className="text-sm leading-relaxed text-[#8E8E93]">
                    Venta desde el {formatEventDate(ticketsFrom)} · en{" "}
                    <span className="tabular-nums text-white/90">
                      {formatCountdown(ticketsWindow.msLeft)}
                    </span>
                  </p>
                ) : null}

                <div className="rounded-2xl bg-transparent px-2 py-2">
                  {data.ticketTypes.length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-[#8E8E93]">
                      Sin entradas a la venta.
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {data.ticketTypes.map((t, i) => (
                        <li key={t.id} className="flex flex-col">
                          {i > 0 ? (
                            <div
                              className="ml-4 h-px shrink-0 bg-zinc-800/50"
                              aria-hidden
                            />
                          ) : null}
                          <button
                            type="button"
                            disabled={!t.availableForPurchase || !ticketsWindow.open}
                            onClick={() => setTicketTypeId(t.id)}
                            className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-4 my-2 border border-white/10 text-left transition-colors ${
                              ticketTypeId === t.id ? "bg-white/5" : "hover:bg-white/3"
                            } ${!t.availableForPurchase || !ticketsWindow.open ? "opacity-40" : ""}`}
                          >
                            <span className="font-medium text-white">{t.name}</span>
                            <span className="shrink-0 tabular-nums text-sm text-[#8E8E93]">
                              {formatMoneyArsExact(t.price)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {selectedType?.availableForPurchase && ticketsWindow.open ? (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-sm text-[#8E8E93]">Cantidad</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-xl text-[#8E8E93] hover:bg-white/5 hover:text-white"
                        onClick={() => setQty((q) => Math.max(0, q - 1))}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="min-w-8 text-center tabular-nums text-sm text-white">
                        {qty}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-xl text-[#8E8E93] hover:bg-white/5 hover:text-white"
                        onClick={() => setQty((q) => q + 1)}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {showProductStep ? (
              <section className="space-y-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">Consumos</h2>
                {consFrom != null && !consWindow.open ? (
                  <p className="text-sm leading-relaxed text-[#8E8E93]">
                    Consumos desde el {formatEventDate(consFrom)} · en{" "}
                    <span className="tabular-nums text-white/90">
                      {formatCountdown(consWindow.msLeft)}
                    </span>
                  </p>
                ) : null}

                {data.drinkProducts.length === 0 ? (
                  <p className="text-sm text-[#8E8E93]">
                    No hay consumos digitales para este evento.
                  </p>
                ) : (
                  <div className="rounded-2xl bg-[#1C1C1E] px-2 py-2">
                    <ul className="flex flex-col">
                      {data.drinkProducts.map((p, i) => {
                        const q = drinks[p.id] ?? 0
                        const rowDisabled = !consWindow.open
                        return (
                          <li key={p.id} className="flex flex-col">
                            {i > 0 ? (
                              <div
                                className="ml-4 h-px shrink-0 bg-zinc-800/50"
                                aria-hidden
                              />
                            ) : null}
                            <div
                              className={`flex items-center justify-between gap-3 px-4 py-4 ${rowDisabled ? "opacity-40" : ""}`}
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-white">{p.name}</p>
                                <p className="mt-0.5 text-sm text-[#8E8E93]">
                                  {formatMoneyArsExact(p.price)} c/u
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="rounded-xl text-[#8E8E93] hover:bg-white/5"
                                  disabled={rowDisabled}
                                  onClick={() => setDrinkQty(p.id, q - 1)}
                                >
                                  <Minus className="size-4" />
                                </Button>
                                <span className="min-w-6 text-center tabular-nums text-sm text-white">
                                  {q}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="rounded-xl text-[#8E8E93] hover:bg-white/5"
                                  disabled={rowDisabled}
                                  onClick={() => setDrinkQty(p.id, q + 1)}
                                >
                                  <Plus className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </section>
            ) : null}

            {data && !hasTicketCatalog && !hasProductCatalog ? (
              <p className="text-sm text-[#8E8E93]">
                Este evento no tiene venta online por el momento.
              </p>
            ) : null}
          </>
        )}
      </div>

      {data &&
      !showChooser &&
      (showTicketStep || showProductStep || !needsWorkflowChoice) ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800/50 bg-black/70 px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-8">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-[#8E8E93]">Total</span>
              <span className="text-xl font-bold tabular-nums tracking-tight text-white">
                {formatMoneyArsExact(totalStr)}
              </span>
            </div>
            <p className="text-center text-xs leading-relaxed text-[#8E8E93]">
              El pago online se procesa de forma segura con Mercado Pago (Checkout Pro).
            </p>
            <Button
              className="h-12 w-full rounded-xl bg-white text-base font-semibold text-black hover:bg-zinc-200"
              disabled={!canContinue}
              onClick={continueClick}
            >
              Continuar al pago
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
