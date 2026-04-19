import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Minus, Plus } from "lucide-react"
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
            <header className="space-y-3">
              <p className="text-sm text-[#8E8E93]">{data.productora.name}</p>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {data.event.name}
              </h1>
              <p className="text-sm text-[#8E8E93]">{formatEventDay(data.event.date)}</p>
              {data.event.location ? (
                <p className="text-sm text-[#8E8E93]">{data.event.location}</p>
              ) : null}
            </header>

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

              <div className="rounded-2xl bg-[#1C1C1E] px-2 py-2">
                {data.ticketTypes.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-[#8E8E93]">
                    Sin entradas a la venta.
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {data.ticketTypes.map((t, i) => (
                      <li
                        key={t.id}
                        className={
                          i > 0 ? "ml-4 border-t border-zinc-800/50" : ""
                        }
                      >
                        <button
                          type="button"
                          disabled={!t.availableForPurchase || !ticketsWindow.open}
                          onClick={() => setTicketTypeId(t.id)}
                          className={`flex w-full items-center justify-between gap-4 rounded-xl px-4 py-4 text-left transition-colors ${
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

            <section className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-white">Bar</h2>
              {consFrom != null && !consWindow.open ? (
                <p className="text-sm leading-relaxed text-[#8E8E93]">
                  Consumos desde el {formatEventDate(consFrom)} · en{" "}
                  <span className="tabular-nums text-white/90">
                    {formatCountdown(consWindow.msLeft)}
                  </span>
                </p>
              ) : null}

              {data.drinkProducts.length === 0 ? (
                <p className="text-sm text-[#8E8E93]">No hay consumos digitales para este evento.</p>
              ) : (
                <div className="rounded-2xl bg-[#1C1C1E] px-2 py-2">
                  <ul className="flex flex-col">
                    {data.drinkProducts.map((p, i) => {
                      const q = drinks[p.id] ?? 0
                      const rowDisabled = !consWindow.open
                      return (
                        <li
                          key={p.id}
                          className={i > 0 ? "ml-4 border-t border-zinc-800/50" : ""}
                        >
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
          </>
        )}
      </div>

      {data ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800/50 bg-black/70 px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-8">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-sm text-[#8E8E93]">Total</span>
              <span className="text-xl font-bold tabular-nums tracking-tight text-white">
                {formatMoneyArsExact(totalStr)}
              </span>
            </div>
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
