import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { Minus, Plus } from "lucide-react"
import { publicApiFetch } from "@/lib/api"
import type { PublicEventDetailResponse } from "@/types/api"
import {
  formatCountdown,
  formatEventDay,
  formatEventDateTime,
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
    <div className="flex min-h-dvh flex-col bg-[#09090b] pb-40 text-zinc-50">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-10 px-5 pt-10">
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !data ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : (
          <>
            <header className="space-y-2 border-b border-white/10 pb-8">
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                {data.productora.name}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {data.event.name}
              </h1>
              <p className="text-sm text-zinc-400">{formatEventDay(data.event.date)}</p>
              {data.event.location ? (
                <p className="text-sm text-zinc-500">{data.event.location}</p>
              ) : null}
            </header>

            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Entradas
                </h2>
                {ticketsFrom != null && !ticketsWindow.open ? (
                  <span className="text-[10px] uppercase tracking-wider text-amber-400/90">
                    En {formatCountdown(ticketsWindow.msLeft)}
                  </span>
                ) : null}
              </div>

              {ticketsFrom != null && !ticketsWindow.open ? (
                <p className="text-xs text-zinc-500">
                  Disponible el {formatEventDateTime(ticketsFrom)}
                </p>
              ) : null}

              <div className="divide-y divide-white/10 border border-white/10 bg-zinc-950/50">
                {data.ticketTypes.length === 0 ? (
                  <p className="px-4 py-8 text-sm text-zinc-500">
                    Sin entradas a la venta.
                  </p>
                ) : (
                  data.ticketTypes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={!t.availableForPurchase || !ticketsWindow.open}
                      onClick={() => setTicketTypeId(t.id)}
                      className={`flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors ${
                        ticketTypeId === t.id ? "bg-white/6" : "hover:bg-white/3"
                      } ${!t.availableForPurchase || !ticketsWindow.open ? "opacity-40" : ""}`}
                    >
                      <span className="font-medium text-zinc-100">{t.name}</span>
                      <span className="shrink-0 tabular-nums text-sm text-zinc-400">
                        {formatMoneyArsExact(t.price)}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {selectedType?.availableForPurchase && ticketsWindow.open ? (
                <div className="flex items-center justify-between px-1 pt-1">
                  <span className="text-xs text-zinc-500">Cantidad</span>
                  <div className="flex items-center gap-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-none text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                      onClick={() => setQty((q) => Math.max(0, q - 1))}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="min-w-8 text-center tabular-nums text-sm text-zinc-200">
                      {qty}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-none text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                      onClick={() => setQty((q) => q + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  Bar / consumos
                </h2>
                {consFrom != null && !consWindow.open ? (
                  <span className="text-[10px] uppercase tracking-wider text-amber-400/90">
                    En {formatCountdown(consWindow.msLeft)}
                  </span>
                ) : null}
              </div>

              {consFrom != null && !consWindow.open ? (
                <p className="text-xs text-zinc-500">
                  Disponible el {formatEventDateTime(consFrom)}
                </p>
              ) : null}

              {data.drinkProducts.length === 0 ? (
                <p className="text-sm text-zinc-600">Sin consumos digitales para este evento.</p>
              ) : (
                <div className="divide-y divide-white/10 border border-white/10 bg-zinc-950/50">
                  {data.drinkProducts.map((p) => {
                    const q = drinks[p.id] ?? 0
                    const rowDisabled = !consWindow.open
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between gap-3 px-4 py-4 ${rowDisabled ? "opacity-40" : ""}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-100">{p.name}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {formatMoneyArsExact(p.price)} c/u
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-none text-zinc-500 hover:bg-white/5"
                            disabled={rowDisabled}
                            onClick={() => setDrinkQty(p.id, q - 1)}
                          >
                            <Minus className="size-4" />
                          </Button>
                          <span className="min-w-6 text-center tabular-nums text-sm text-zinc-200">
                            {q}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-none text-zinc-500 hover:bg-white/5"
                            disabled={rowDisabled}
                            onClick={() => setDrinkQty(p.id, q + 1)}
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {data ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#09090b]/95 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Total</span>
              <span className="text-lg font-semibold tabular-nums tracking-tight text-white">
                {formatMoneyArsExact(totalStr)}
              </span>
            </div>
            <Button
              className="h-11 w-full rounded-none border border-white/20 bg-white text-[#09090b] hover:bg-zinc-200"
              disabled={!canContinue}
              onClick={continueClick}
            >
              Ir a checkout
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
